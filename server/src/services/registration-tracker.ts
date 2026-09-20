/**
 * Persistent registration tracker
 *
 * Stores installer registrations, KYC submissions, and project submissions.
 * The in-memory Maps are the live source of truth for the (synchronous) public API;
 * Neon (Postgres) is the durable store, with a local JSON file kept as a backup mirror.
 * Data persists across server restarts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { sql } from '../config/db.config';

interface TrackedInstaller {
  wallet_address: string;
  name: string;
  business_reg: string;
  documents_hash: string;
  kyc_status: number; // 0=pending, 1=submitted, 2=approved, 3=rejected
  location_id: number;
  project_id: number;
  registered_at: number;
  kyc_submitted_at?: number;
}

interface TrackedProject {
  project_id: number;
  name: string;
  installer: string;
  location_id: number;
  capacity_kw: number;
  cost_apt: string;
  description: string;
  documents_hash: string;
  expected_yield_bps: number;
  status: number; // 0=pending, 1=approved, 2=rejected
  submitted_at: number;
}

interface TrackerData {
  installers: Record<string, TrackedInstaller>;
  projects: Record<number, TrackedProject>;
  nextProjectId: number;
}

const DATA_FILE = path.join(__dirname, '../../data/tracker.json');

class RegistrationTracker {
  private installers: Map<string, TrackedInstaller> = new Map();
  private projects: Map<number, TrackedProject> = new Map();
  private nextProjectId: number = 1;

  // Resolves once init() has loaded/seeded Neon and the schema exists.
  // flushToDb() awaits this so mutations that fire before startup completes are queued.
  private ready: Promise<void>;
  private markReady!: () => void;
  // Serializes DB flushes so concurrent mutations don't race.
  private flushChain: Promise<void> = Promise.resolve();

  constructor() {
    this.ready = new Promise((resolve) => {
      this.markReady = resolve;
    });
    // Warm the in-memory Maps immediately from the local JSON backup, so reads work
    // even before init() finishes reconciling from Neon (Neon wins once loaded).
    this.loadFromFile();
  }

  // ─── Neon persistence ──────────────────────────────────────────────────────

  /** Create the tables if they don't exist. Idempotent. */
  private async ensureSchema(): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS installers (
        wallet_address   TEXT PRIMARY KEY,
        name             TEXT NOT NULL,
        business_reg     TEXT NOT NULL,
        documents_hash   TEXT NOT NULL DEFAULT '',
        kyc_status       INTEGER NOT NULL DEFAULT 0,
        location_id      INTEGER NOT NULL DEFAULT 0,
        project_id       INTEGER NOT NULL DEFAULT 0,
        registered_at    BIGINT NOT NULL,
        kyc_submitted_at BIGINT
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS projects (
        project_id         INTEGER PRIMARY KEY,
        name               TEXT NOT NULL,
        installer          TEXT NOT NULL,
        location_id        INTEGER NOT NULL,
        capacity_kw        INTEGER NOT NULL,
        cost_apt           TEXT NOT NULL,
        description        TEXT NOT NULL,
        documents_hash     TEXT NOT NULL,
        expected_yield_bps INTEGER NOT NULL,
        status             INTEGER NOT NULL DEFAULT 0,
        submitted_at       BIGINT NOT NULL
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS tracker_meta (
        key   TEXT PRIMARY KEY,
        value BIGINT NOT NULL
      )
    `;
  }

  /**
   * One-time startup: ensure schema, seed from tracker.json if the DB is empty,
   * then load all rows from Neon into the in-memory Maps (Neon is authoritative).
   * Must be awaited during server startup.
   */
  async init(): Promise<void> {
    try {
      await this.ensureSchema();

      const [{ count: installerCount }] = await sql`SELECT COUNT(*)::int AS count FROM installers`;
      const [{ count: projectCount }] = await sql`SELECT COUNT(*)::int AS count FROM projects`;

      // Seed from the JSON backup on first run (empty DB + a file already on disk).
      if (installerCount === 0 && projectCount === 0 && this.installers.size > 0) {
        console.log(`[RegistrationTracker] Empty Neon DB — seeding from tracker.json...`);
        await this.flushChainImmediate();
        console.log(
          `[RegistrationTracker] Seeded ${this.installers.size} installers, ${this.projects.size} projects into Neon`,
        );
      }

      await this.loadFromDb();
      this.markReady();
    } catch (error) {
      console.error('[RegistrationTracker] init() failed:', error);
      // Still resolve so the (JSON-backed) in-memory tracker keeps serving reads.
      this.markReady();
    }
  }

  /** Load all rows from Neon into the in-memory Maps, replacing current contents. */
  private async loadFromDb(): Promise<void> {
    const installerRows = (await sql`SELECT * FROM installers`) as any[];
    const projectRows = (await sql`SELECT * FROM projects`) as any[];

    this.installers.clear();
    for (const r of installerRows) {
      this.installers.set(r.wallet_address, {
        wallet_address: r.wallet_address,
        name: r.name,
        business_reg: r.business_reg,
        documents_hash: r.documents_hash,
        kyc_status: Number(r.kyc_status),
        location_id: Number(r.location_id),
        project_id: Number(r.project_id),
        registered_at: Number(r.registered_at),
        kyc_submitted_at: r.kyc_submitted_at != null ? Number(r.kyc_submitted_at) : undefined,
      });
    }

    this.projects.clear();
    for (const r of projectRows) {
      this.projects.set(Number(r.project_id), {
        project_id: Number(r.project_id),
        name: r.name,
        installer: r.installer,
        location_id: Number(r.location_id),
        capacity_kw: Number(r.capacity_kw),
        cost_apt: r.cost_apt,
        description: r.description,
        documents_hash: r.documents_hash,
        expected_yield_bps: Number(r.expected_yield_bps),
        status: Number(r.status),
        submitted_at: Number(r.submitted_at),
      });
    }

    const metaRows = (await sql`SELECT value FROM tracker_meta WHERE key = 'nextProjectId'`) as any[];
    if (metaRows.length > 0) {
      this.nextProjectId = Number(metaRows[0].value);
    } else {
      // Fallback: derive from the max project id we loaded.
      let maxId = 0;
      for (const id of this.projects.keys()) maxId = Math.max(maxId, id);
      this.nextProjectId = maxId + 1;
    }

    console.log(
      `[RegistrationTracker] Loaded ${this.installers.size} installers, ${this.projects.size} projects from Neon (nextProjectId=${this.nextProjectId})`,
    );
  }

  /** Upsert every current Map entry + meta into Neon. Waits for init() first. */
  private async flushToDb(): Promise<void> {
    await this.ready;
    await this.flushChainImmediate();
  }

  /** Upsert current state into Neon without waiting on `ready` (used during seed + flush). */
  private async flushChainImmediate(): Promise<void> {
    for (const i of this.installers.values()) {
      await sql`
        INSERT INTO installers (
          wallet_address, name, business_reg, documents_hash,
          kyc_status, location_id, project_id, registered_at, kyc_submitted_at
        ) VALUES (
          ${i.wallet_address}, ${i.name}, ${i.business_reg}, ${i.documents_hash},
          ${i.kyc_status}, ${i.location_id}, ${i.project_id}, ${i.registered_at},
          ${i.kyc_submitted_at ?? null}
        )
        ON CONFLICT (wallet_address) DO UPDATE SET
          name = EXCLUDED.name,
          business_reg = EXCLUDED.business_reg,
          documents_hash = EXCLUDED.documents_hash,
          kyc_status = EXCLUDED.kyc_status,
          location_id = EXCLUDED.location_id,
          project_id = EXCLUDED.project_id,
          registered_at = EXCLUDED.registered_at,
          kyc_submitted_at = EXCLUDED.kyc_submitted_at
      `;
    }

    for (const p of this.projects.values()) {
      await sql`
        INSERT INTO projects (
          project_id, name, installer, location_id, capacity_kw, cost_apt,
          description, documents_hash, expected_yield_bps, status, submitted_at
        ) VALUES (
          ${p.project_id}, ${p.name}, ${p.installer}, ${p.location_id}, ${p.capacity_kw}, ${p.cost_apt},
          ${p.description}, ${p.documents_hash}, ${p.expected_yield_bps}, ${p.status}, ${p.submitted_at}
        )
        ON CONFLICT (project_id) DO UPDATE SET
          name = EXCLUDED.name,
          installer = EXCLUDED.installer,
          location_id = EXCLUDED.location_id,
          capacity_kw = EXCLUDED.capacity_kw,
          cost_apt = EXCLUDED.cost_apt,
          description = EXCLUDED.description,
          documents_hash = EXCLUDED.documents_hash,
          expected_yield_bps = EXCLUDED.expected_yield_bps,
          status = EXCLUDED.status,
          submitted_at = EXCLUDED.submitted_at
      `;
    }

    await sql`
      INSERT INTO tracker_meta (key, value) VALUES ('nextProjectId', ${this.nextProjectId})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  }

  /**
   * Persist current state: write the JSON backup mirror (synchronous, as before) and
   * enqueue an async Neon flush. Called after every mutation, keeping the public API sync.
   */
  private persist(): void {
    this.saveToFile();
    this.flushChain = this.flushChain
      .then(() => this.flushToDb())
      .catch((error) => {
        console.error('[RegistrationTracker] Neon flush failed:', error);
      });
  }

  private loadFromFile(): void {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const data: TrackerData = JSON.parse(raw);
        
        // Load installers
        for (const [key, value] of Object.entries(data.installers || {})) {
          this.installers.set(key, value);
        }
        
        // Load projects
        for (const [key, value] of Object.entries(data.projects || {})) {
          this.projects.set(Number(key), value);
        }
        
        this.nextProjectId = data.nextProjectId || 1;
        
        console.log(`[RegistrationTracker] Loaded ${this.installers.size} installers, ${this.projects.size} projects from disk`);
      } else {
        console.log(`[RegistrationTracker] No existing data file, starting fresh`);
      }
    } catch (error) {
      console.error('[RegistrationTracker] Error loading data:', error);
    }
  }

  private saveToFile(): void {
    try {
      const dataDir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const data: TrackerData = {
        installers: Object.fromEntries(this.installers),
        projects: Object.fromEntries(this.projects),
        nextProjectId: this.nextProjectId,
      };
      
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      console.log(`[RegistrationTracker] Saved to disk`);
    } catch (error) {
      console.error('[RegistrationTracker] Error saving data:', error);
    }
  }

  /**
   * Register a new installer
   */
  registerInstaller(
    walletAddress: string,
    name: string,
    businessReg: string,
  ): boolean {
    const normalized = walletAddress.toLowerCase();
    
    if (this.installers.has(normalized)) {
      console.log(`[RegistrationTracker] Installer already registered: ${normalized}`);
      return false;
    }

    const installer: TrackedInstaller = {
      wallet_address: normalized,
      name,
      business_reg: businessReg,
      documents_hash: "",
      kyc_status: 0, // PENDING
      location_id: 0,
      project_id: 0,
      registered_at: Date.now(),
    };

    this.installers.set(normalized, installer);
    this.persist();
    console.log(`[RegistrationTracker] ✅ Registered: ${normalized}`);
    return true;
  }

  /**
   * Mark a wallet as registered (from on-chain E_ALREADY_REGISTERED error)
   * Creates a minimal record so we know they're registered
   */
  markAsRegistered(walletAddress: string): void {
    const normalized = walletAddress.toLowerCase();
    
    if (this.installers.has(normalized)) {
      console.log(`[RegistrationTracker] Already tracking: ${normalized}`);
      return;
    }

    const installer: TrackedInstaller = {
      wallet_address: normalized,
      name: "Unknown (on-chain)",
      business_reg: "Unknown",
      documents_hash: "",
      kyc_status: 0, // PENDING - we don't know real status yet
      location_id: 0,
      project_id: 0,
      registered_at: Date.now(),
    };

    this.installers.set(normalized, installer);
    this.persist();
    console.log(`[RegistrationTracker] ✅ Marked as registered (from on-chain): ${normalized}`);
  }

  /**
   * Get installer by wallet address
   */
  getInstaller(walletAddress: string): TrackedInstaller | null {
    return this.installers.get(walletAddress.toLowerCase()) || null;
  }

  /**
   * Submit KYC for an installer
   */
  submitKyc(
    walletAddress: string,
    docsHash: string,
    locationId: number,
  ): boolean {
    const normalized = walletAddress.toLowerCase();
    let installer = this.installers.get(normalized);

    // If installer not found, create a record (they may have registered on-chain)
    if (!installer) {
      console.log(`[RegistrationTracker] Installer not found, creating record: ${normalized}`);
      installer = {
        wallet_address: normalized,
        name: "Unknown (on-chain)",
        business_reg: "Unknown",
        documents_hash: "",
        kyc_status: 0,
        location_id: 0,
        project_id: 0,
        registered_at: Date.now(),
      };
      this.installers.set(normalized, installer);
    }

    installer.documents_hash = docsHash;
    installer.location_id = locationId;
    installer.kyc_status = 1; // SUBMITTED
    installer.kyc_submitted_at = Date.now();
    
    this.persist();
    console.log(`[RegistrationTracker] ✅ KYC submitted: ${normalized}`);
    return true;
  }

  /**
   * Approve installer KYC
   */
  approveKyc(walletAddress: string): boolean {
    const normalized = walletAddress.toLowerCase();
    const installer = this.installers.get(normalized);

    if (!installer) return false;

    installer.kyc_status = 2; // APPROVED
    this.persist();
    console.log(`[RegistrationTracker] ✅ KYC approved: ${normalized}`);
    return true;
  }

  /**
   * Reject installer KYC
   */
  rejectKyc(walletAddress: string): boolean {
    const normalized = walletAddress.toLowerCase();
    const installer = this.installers.get(normalized);

    if (!installer) return false;

    installer.kyc_status = 3; // REJECTED
    this.persist();
    console.log(`[RegistrationTracker] ✅ KYC rejected: ${normalized}`);
    return true;
  }

  /**
   * Submit a project
   */
  submitProject(
    installerAddress: string,
    name: string,
    locationId: number,
    capacityKw: number,
    costApt: string,
    description: string,
    docsHash: string,
    yieldBps: number,
  ): number {
    const normalized = installerAddress.toLowerCase();
    let installer = this.installers.get(normalized);

    // If installer not found, create a record (they may have registered on-chain)
    if (!installer) {
      console.log(`[RegistrationTracker] Installer not found, creating record for project: ${normalized}`);
      installer = {
        wallet_address: normalized,
        name: "Unknown (on-chain)",
        business_reg: "Unknown",
        documents_hash: "",
        kyc_status: 2, // Must be approved if submitting project
        location_id: locationId,
        project_id: 0,
        registered_at: Date.now(),
      };
      this.installers.set(normalized, installer);
    }

    const projectId = this.nextProjectId++;
    const project: TrackedProject = {
      project_id: projectId,
      name,
      installer: normalized,
      location_id: locationId,
      capacity_kw: capacityKw,
      cost_apt: costApt,
      description,
      documents_hash: docsHash,
      expected_yield_bps: yieldBps,
      status: 0, // PENDING
      submitted_at: Date.now(),
    };

    this.projects.set(projectId, project);
    installer.project_id = projectId;
    
    this.persist();
    console.log(`[RegistrationTracker] ✅ Project submitted: ID ${projectId} by ${normalized}`);
    return projectId;
  }

  /**
   * Get all pending KYC submissions
   */
  getPendingKycSubmissions(): TrackedInstaller[] {
    const pending: TrackedInstaller[] = [];
    
    for (const installer of this.installers.values()) {
      if (installer.kyc_status === 0 || installer.kyc_status === 1) {
        pending.push(installer);
      }
    }

    return pending;
  }

  /**
   * Get all pending projects
   */
  getPendingProjects(): TrackedProject[] {
    const pending: TrackedProject[] = [];

    for (const project of this.projects.values()) {
      if (project.status === 0) {
        pending.push(project);
      }
    }

    return pending;
  }

  /**
   * Approve a project
   */
  approveProject(projectId: number): boolean {
    const project = this.projects.get(projectId);
    if (!project) return false;

    project.status = 1; // APPROVED
    this.persist();
    console.log(`[RegistrationTracker] ✅ Project approved: ID ${projectId}`);
    return true;
  }

  /**
   * Reject a project
   */
  rejectProject(projectId: number): boolean {
    const project = this.projects.get(projectId);
    if (!project) return false;

    project.status = 2; // REJECTED
    this.persist();
    console.log(`[RegistrationTracker] ✅ Project rejected: ID ${projectId}`);
    return true;
  }

  /**
   * Get project by ID
   */
  getProject(projectId: number): TrackedProject | null {
    return this.projects.get(projectId) || null;
  }

  /**
   * Debug: Show all registered installers
   */
  getAllInstallers(): TrackedInstaller[] {
    return Array.from(this.installers.values());
  }

  /**
   * Debug: Show all projects
   */
  getAllProjects(): TrackedProject[] {
    return Array.from(this.projects.values());
  }

  /**
   * Get approved projects by location
   */
  getApprovedProjectsByLocation(locationId: number): TrackedProject[] {
    const approved: TrackedProject[] = [];
    
    for (const project of this.projects.values()) {
      if (project.status === 1 && project.location_id === locationId) {
        approved.push(project);
      }
    }

    return approved;
  }

  /**
   * Get all approved projects
   */
  getAllApprovedProjects(): TrackedProject[] {
    const approved: TrackedProject[] = [];
    
    for (const project of this.projects.values()) {
      if (project.status === 1) {
        approved.push(project);
      }
    }

    return approved;
  }
}

export const registrationTracker = new RegistrationTracker();
