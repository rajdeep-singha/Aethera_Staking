import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { stakingController } from "./controllers/staking.controllers";
import {
  register,
  submitKyc,
  getInstaller,
  markRegistered,
} from "./controllers/installer.controllers";
import { projectController } from "./controllers/project.contollers";
import { adminController } from "./controllers/admin.controllers";

// Load environment variables
dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3000;


// Security
app.use(helmet());

// CORS
const allowedOrigins: string[] = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, Postman, server-to-server)
      if (!origin) return callback(null, true);

      if (allowedOrigins.length === 0) {
        // No origins configured — open in development, blocked in production
        if (process.env.NODE_ENV === "production") {
          return callback(
            new Error(
              `CORS: no allowed origins configured. Set CORS_ORIGIN env var.`,
            ),
            false,
          );
        }
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error(`CORS: origin "${origin}" is not allowed.`),
        false,
      );
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Cache-Control",
      "Pragma",
      "Expires",
    ],
  }),
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan("combined"));

// Rate limiting
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
});

// Relaxed limiter for public APIs
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
});

app.use("/api/admin", adminLimiter);
app.use("/api", publicLimiter);

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Aethera Staking API is running",
    timestamp: new Date().toISOString(),
  });
});

// Debug endpoint — exposes config state, NO secrets
app.get("/debug", (req: Request, res: Response) => {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const vaultAuthority = process.env.VAULT_AUTHORITY_ADDRESS;
  const network = process.env.APTOS_NETWORK;
  const nodeUrl = process.env.APTOS_NODE_URL;
  const corsOrigin = process.env.CORS_ORIGIN;

  // Derive what fullnode URL the SDK will actually use
  const resolvedNodeUrl =
    nodeUrl ||
    (network?.toLowerCase() === "devnet"
      ? "https://api.devnet.aptoslabs.com/v1"
      : network?.toLowerCase() === "testnet"
        ? "https://fullnode.testnet.aptoslabs.com/v1"
        : network?.toLowerCase() === "mainnet"
          ? "https://fullnode.mainnet.aptoslabs.com/v1"
          : "(SDK default — APTOS_NETWORK not set)");

  // Collect ALL env vars that start with APTOS_ so we can see everything Render injects
  const aptosEnvVars: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("APTOS_")) {
      aptosEnvVars[key] = value ?? "(empty string)";
    }
  }

  res.json({
    env: {
      NODE_ENV: process.env.NODE_ENV || "(not set)",
      APTOS_NETWORK: process.env.APTOS_NETWORK || "(not set)",
      CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS
        ? `${process.env.CONTRACT_ADDRESS.slice(0, 10)}...`
        : "(not set)",
      HUB_AUTHORITY_ADDRESS: process.env.HUB_AUTHORITY_ADDRESS
        ? `${process.env.HUB_AUTHORITY_ADDRESS.slice(0, 10)}...`
        : "(not set)",
      REGISTRY_AUTHORITY_ADDRESS: process.env.REGISTRY_AUTHORITY_ADDRESS
        ? `${process.env.REGISTRY_AUTHORITY_ADDRESS.slice(0, 10)}...`
        : "(not set)",
      PROJECT_AUTHORITY_ADDRESS: process.env.PROJECT_AUTHORITY_ADDRESS
        ? `${process.env.PROJECT_AUTHORITY_ADDRESS.slice(0, 10)}...`
        : "(not set)",
    },
  });
});


//  Installer Registry (installer_registry.move) 
// POST  /api/installer/register        → register wallet + basic info
// POST  /api/installer/submit-kyc      → upload IPFS doc hash + pick location
// POST  /api/installer/mark-registered → mark wallet as registered (from on-chain error)
// GET   /api/installer/:address        → get installer info + KYC status
// GET   /api/installer/:address/on-chain-status → check if on-chain contracts available
app.post("/api/installer/register", register);
app.post("/api/installer/submit-kyc", submitKyc);
app.post("/api/installer/mark-registered", markRegistered);
app.get("/api/installer/:address/on-chain-status", async (req, res) => {
  // Check if on-chain contracts are deployed and accessible
  try {
    const { address } = req.params;
    console.log(`[on-chain-status] Checking for address: ${address}`);

    // Try to fetch installer info from on-chain
    const installerService = new (
      await import("./controllers/installer.controllers")
    ).InstallerService();
    const onChainInfo = await installerService.getInstallerInfo(address);

    if (onChainInfo) {
      console.log(`[on-chain-status] ✅ On-chain data found`);
      res.json({
        success: true,
        on_chain_available: true,
        kyc_status: onChainInfo.kyc_status,
      });
    } else {
      console.log(
        `[on-chain-status] ❌ No on-chain data (contracts may not be deployed)`,
      );
      res.json({
        success: true,
        on_chain_available: false,
        reason: "No on-chain data found - contracts may not be deployed",
      });
    }
  } catch (error: any) {
    console.log(`[on-chain-status] ❌ Error checking on-chain:`, error.message);
    res.json({
      success: true,
      on_chain_available: false,
      reason: error.message || "Failed to check on-chain status",
    });
  }
});
app.get("/api/installer/:address", getInstaller);

// ── Project Listing (project_listing.move) ───────────────────────────────────
// GET   /api/project/locations                → get all oracle locations
// POST  /api/project/submit                   → KYC-approved installer submits project
// GET   /api/project/location/:location_id    → get all approved projects for a location
// GET   /api/project/:project_id              → get single project details
app.get(
  "/api/project/locations",
  projectController.getLocations.bind(projectController),
);
app.post(
  "/api/project/submit",
  projectController.submitProject.bind(projectController),
);
app.get(
  "/api/project/location/:location_id",
  projectController.getProjectsByLocation.bind(projectController),
);
app.get(
  "/api/project/:project_id",
  projectController.getProject.bind(projectController),
);

// ── Per-Project Staking (state.move updated) ─────────────────────────────────
// POST  /api/staking/stake                            → stake APT on a project
// POST  /api/staking/unstake                          → unstake after lock expires
// POST  /api/staking/claim                            → claim APY rewards
// GET   /api/staking/project/:project_id              → vault info for a project
// GET   /api/staking/player/:address/project/:id      → player's stake in a project
// POST  /api/staking/simulate                         → estimate rewards (no tx)
app.post("/api/staking/stake", stakingController.stake.bind(stakingController));
app.post(
  "/api/staking/unstake",
  stakingController.unstake.bind(stakingController),
);
app.post(
  "/api/staking/claim",
  stakingController.claimRewards.bind(stakingController),
);
app.get(
  "/api/staking/project/:project_id",
  stakingController.getProjectVault.bind(stakingController),
);
app.get(
  "/api/staking/player/:address/project/:project_id",
  stakingController.getPlayerStake.bind(stakingController),
);
app.post(
  "/api/staking/simulate",
  stakingController.simulateStake.bind(stakingController),
);

// ── Admin (all 3 contracts) ───────────────────────────────────────────────────
// KYC Submissions
// GET   /api/admin/kyc/submissions      → get all pending/submitted KYC applications
// POST  /api/admin/kyc/approve          → approve installer KYC
// POST  /api/admin/kyc/reject           → reject installer KYC
// Projects
// GET   /api/admin/projects/pending     → get all projects awaiting approval
// POST  /api/admin/project/approve      → approve project (makes it visible to investors)
// POST  /api/admin/project/reject       → reject project
// Vaults
// POST  /api/admin/vault/create         → create staking vault for approved project
// POST  /api/admin/vault/deposit        → deposit APT into reward pool
// POST  /api/admin/vault/withdraw       → withdraw from vault
// POST  /api/admin/vault/config         → update APY rate for a project
app.get(
  "/api/admin/kyc/submissions",
  adminController.getKycSubmissions.bind(adminController),
);
app.post(
  "/api/admin/kyc/approve",
  adminController.approveKyc.bind(adminController),
);
app.post(
  "/api/admin/kyc/reject",
  adminController.rejectKyc.bind(adminController),
);
app.get(
  "/api/admin/projects/pending",
  adminController.getPendingProjects.bind(adminController),
);
app.get(
  "/api/admin/projects/all",
  adminController.getAllProjects.bind(adminController),
);
app.post(
  "/api/admin/project/approve",
  adminController.approveProject.bind(adminController),
);
app.post(
  "/api/admin/project/reject",
  adminController.rejectProject.bind(adminController),
);
app.post(
  "/api/admin/vault/create",
  adminController.createVault.bind(adminController),
);
app.post(
  "/api/admin/vault/deposit",
  adminController.depositRewards.bind(adminController),
);
app.post(
  "/api/admin/vault/withdraw",
  adminController.withdraw.bind(adminController),
);
app.post(
  "/api/admin/vault/config",
  adminController.updateConfig.bind(adminController),
);

// ── Legacy routes (your original endpoints — kept for backward compat) ────────
app.get(
  "/api/vault/info",
  stakingController.getVaultInfo.bind(stakingController),
);
app.get(
  "/api/player/:address",
  stakingController.getPlayerInfo.bind(stakingController),
);
app.get("/api/stats", stakingController.getStats.bind(stakingController));
app.get(
  "/api/balance/:address",
  stakingController.getBalance.bind(stakingController),
);


app.use((req: Request, res: Response) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Error:", err);
  res
    .status(500)
    .json({ success: false, error: err.message || "Internal server error" });
});

// ============ Start ============

app.listen(PORT, async () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║        Aethera API Server             ║
  ╠═══════════════════════════════════════╣
  ║  ENV:      ${process.env.NODE_ENV || "development"}
  ║  PORT:     ${PORT}
  ║  NETWORK:  ${process.env.APTOS_NETWORK || "devnet"}
  ╚═══════════════════════════════════════╝
  `);

  // Initialize registries on startup
  console.log("\\n[Startup] Initializing smart contract registries...");
  const { installerService } = await import("./services/installer.services");
  const { projectService } = await import("./services/project.services");

  const installerOk = await installerService.initializeRegistry();
  const projectOk = await projectService.initializeRegistry();

  if (installerOk && projectOk) {
    console.log("[Startup] ✅ All registries initialized");
  } else {
    console.warn(
      "[Startup] ⚠️ Some registries could not be initialized (may already exist)",
    );
  }
});
