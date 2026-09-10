import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  adminApproveKyc,
  adminRejectKyc,
  adminApproveProject,
  adminRejectProject,
  adminCreateVault,
  adminDepositRewards,
  adminUpdateConfig,
  adminInitProjectToken,
  adminSetLifecycle,
  adminUpdateNav,
  adminDistributeYield,
  adminInitMarket,
  adminUpdateFee,
} from "../../services/api";
import "./Admin.css";

type Tab = "kyc" | "projects" | "vaults" | "tokens";

interface KycSubmission {
  wallet: string;
  name: string;
  business_reg: string;
  documents_hash: string;
  kyc_status: number;
  kyc_status_label: string;
  location_id: number;
  project_id: number;
}

interface ProjectSubmission {
  project_id: number;
  name: string;
  location_id: number;
  capacity_kw: number;
  cost_apt: string;
  description: string;
  documents_hash: string;
  expected_yield_bps: number;
  installer: string;
  status: number;
  status_label: string;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("kyc");
  const [loading, setLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err";
    msg: string;
  } | null>(null);

  // Data states
  const [kycSubmissions, setKycSubmissions] = useState<KycSubmission[]>([]);
  const [projects, setProjects] = useState<ProjectSubmission[]>([]);
  const [allProjects, setAllProjects] = useState<ProjectSubmission[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Vault form
  const [vaultProjectId, setVaultProjectId] = useState("");
  const [vaultApyRate, setVaultApyRate] = useState(""); // auto-filled from the selected project's expected_yield_bps
  const [depositProjectId, setDepositProjectId] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [configProjectId, setConfigProjectId] = useState("");
  const [configApy, setConfigApy] = useState("");

  // Token & Market forms
  const [tokProjectId, setTokProjectId] = useState("");
  const [tokMaxSupply, setTokMaxSupply] = useState("0");
  const [tokNav, setTokNav] = useState("100000000");
  const [tokStaleness, setTokStaleness] = useState("86400");
  const [lcProjectId, setLcProjectId] = useState("");
  const [lcStage, setLcStage] = useState("1");
  const [navProjectId, setNavProjectId] = useState("");
  const [navValue, setNavValue] = useState("");
  const [yieldProjectId, setYieldProjectId] = useState("");
  const [yieldAmount, setYieldAmount] = useState("");
  const [marketProjectId, setMarketProjectId] = useState("");
  const [feeBps, setFeeBps] = useState("50");

  // Guard
  useEffect(() => {
    if (localStorage.getItem("aethera_admin") !== "true") navigate("/admin");
  }, []);

  // Fetch KYC submissions
  const fetchKycSubmissions = async () => {
    setDataLoading(true);
    try {
      const response = await fetch("http://localhost:3000/api/admin/kyc/submissions");
      if (!response.ok) throw new Error("Failed to fetch KYC submissions");
      const data = await response.json();
      setKycSubmissions(data.data || []);
    } catch (error: any) {
      console.error("[fetchKycSubmissions]", error);
      setFeedback({ type: "err", msg: "Failed to load KYC submissions" });
    } finally {
      setDataLoading(false);
    }
  };

  // Fetch pending projects
  const fetchPendingProjects = async () => {
    setDataLoading(true);
    try {
      const response = await fetch("http://localhost:3000/api/admin/projects/pending");
      if (!response.ok) throw new Error("Failed to fetch pending projects");
      const data = await response.json();
      setProjects(data.data || []);
    } catch (error: any) {
      console.error("[fetchPendingProjects]", error);
      setFeedback({ type: "err", msg: "Failed to load pending projects" });
    } finally {
      setDataLoading(false);
    }
  };

  // Fetch all projects (including approved)
  const fetchAllProjects = async () => {
    try {
      const response = await fetch("http://localhost:3000/api/admin/projects/all");
      if (!response.ok) throw new Error("Failed to fetch all projects");
      const data = await response.json();
      setAllProjects(data.data || []);
    } catch (error: any) {
      console.error("[fetchAllProjects]", error);
    }
  };

  // Load data on tab change
  useEffect(() => {
    if (tab === "kyc") fetchKycSubmissions();
    else if (tab === "projects") {
      fetchPendingProjects();
      fetchAllProjects();
    } else if (tab === "vaults" || tab === "tokens") {
      // Vaults/Tokens forms auto-fill from project data (e.g. APY from expected_yield_bps).
      fetchAllProjects();
    }
  }, [tab]);

  // Auto-fill the vault APY from the selected project's declared expected_yield_bps
  // (bps → %). Kept editable — admin can still override before submitting.
  useEffect(() => {
    const p = allProjects.find((x) => x.project_id === Number(vaultProjectId));
    if (p) setVaultApyRate((Number(p.expected_yield_bps) / 100).toString());
  }, [vaultProjectId, allProjects]);

  const handleLogout = () => {
    localStorage.removeItem("aethera_admin");
    navigate("/admin");
  };

  const call = async (fn: () => Promise<any>, label: string) => {
    setLoading(label);
    setFeedback(null);
    try {
      const res = await fn();
      setFeedback({ type: "ok", msg: res.message || `${label} successful` });
      // Refresh data after action
      if (tab === "kyc") fetchKycSubmissions();
      else if (tab === "projects") {
        fetchPendingProjects();
        fetchAllProjects();
      }
    } catch (e: any) {
      setFeedback({ type: "err", msg: e.message || `${label} failed` });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="admin-dash">
      {/* Header */}
      <header className="dash-header">
        <div className="dash-brand">
          🛡️ <span>Aethera Admin</span>
        </div>
        <div className="dash-tabs">
          {(["kyc", "projects", "vaults", "tokens"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`dash-tab ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "kyc"
                ? "🪪 KYC Review"
                : t === "projects"
                  ? "📋 Projects"
                  : t === "vaults"
                    ? "🏦 Vaults"
                    : "🪙 Tokens & Market"}
            </button>
          ))}
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          Logout →
        </button>
      </header>

      <div className="dash-content">
        {/* Feedback */}
        {feedback && (
          <div className={`dash-feedback ${feedback.type}`}>
            {feedback.type === "ok" ? "✅" : "⚠️"} {feedback.msg}
          </div>
        )}

        {/* ── KYC Tab ── */}
        {tab === "kyc" && (
          <div className="dash-section">
            <h2>KYC Submissions</h2>
            <p className="dash-sub">
              Review and approve or reject installer KYC documents.
            </p>
            {dataLoading ? (
              <p className="loading-text">Loading KYC submissions...</p>
            ) : kycSubmissions.length === 0 ? (
              <p className="empty-text">No pending KYC submissions</p>
            ) : (
              <div className="admin-table">
                <div className="table-head">
                  <span>Installer</span>
                  <span>Name</span>
                  <span>Business Reg</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>
                {kycSubmissions.map((k) => (
                  <div className="table-row" key={k.wallet}>
                    <span className="mono">{k.wallet.slice(0, 10)}...</span>
                    <span>{k.name}</span>
                    <span>{k.business_reg}</span>
                    <span
                      className={`status-chip ${k.kyc_status_label.toLowerCase()}`}
                    >
                      {k.kyc_status_label}
                    </span>
                    <div className="row-actions">
                      <button
                        className="approve-btn"
                        disabled={loading === `kyc-approve-${k.wallet}`}
                        onClick={() =>
                          call(
                            () => adminApproveKyc(k.wallet),
                            `kyc-approve-${k.wallet}`,
                          )
                        }
                      >
                        {loading === `kyc-approve-${k.wallet}`
                          ? "..."
                          : "✅ Approve"}
                      </button>
                      <button
                        className="reject-btn"
                        disabled={loading === `kyc-reject-${k.wallet}`}
                        onClick={() =>
                          call(
                            () => adminRejectKyc(k.wallet),
                            `kyc-reject-${k.wallet}`,
                          )
                        }
                      >
                        {loading === `kyc-reject-${k.wallet}`
                          ? "..."
                          : "❌ Reject"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Manual address input for real on-chain data */}
            <div className="manual-action">
              <h3>Manual Action by Address</h3>
              <div className="manual-row">
                <input
                  id="kyc-addr"
                  placeholder="0x installer wallet address..."
                />
                <button
                  onClick={() =>
                    call(
                      () =>
                        adminApproveKyc(
                          (
                            document.getElementById(
                              "kyc-addr",
                            ) as HTMLInputElement
                          ).value,
                        ),
                      "kyc-approve",
                    )
                  }
                >
                  Approve KYC
                </button>
                <button
                  className="reject-btn"
                  onClick={() =>
                    call(
                      () =>
                        adminRejectKyc(
                          (
                            document.getElementById(
                              "kyc-addr",
                            ) as HTMLInputElement
                          ).value,
                        ),
                      "kyc-reject",
                    )
                  }
                >
                  Reject KYC
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Projects Tab ── */}
        {tab === "projects" && (
          <div className="dash-section">
            {/* Pending Projects Section */}
            <h2>🔄 Pending Projects</h2>
            <p className="dash-sub">
              Approve projects to make them visible to investors. Approved
              projects can have vaults created.
            </p>
            {dataLoading ? (
              <p className="loading-text">Loading pending projects...</p>
            ) : projects.length === 0 ? (
              <p className="empty-text">
                No pending projects awaiting approval
              </p>
            ) : (
              <div className="admin-table">
                <div className="table-head">
                  <span>ID</span>
                  <span>Name</span>
                  <span>Installer</span>
                  <span>Capacity</span>
                  <span>Expected Yield</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>
                {projects.map((p) => (
                  <div className="table-row" key={p.project_id}>
                    <span className="mono">#{p.project_id}</span>
                    <span>{p.name}</span>
                    <span className="mono">{p.installer.slice(0, 10)}...</span>
                    <span>{p.capacity_kw} kW</span>
                    <span>
                      {(Number(p.expected_yield_bps) / 100).toFixed(2)}%
                    </span>
                    <span
                      className={`status-chip ${p.status_label.toLowerCase()}`}
                    >
                      {p.status_label}
                    </span>
                    <div className="row-actions">
                      <button
                        className="approve-btn"
                        disabled={!!loading}
                        onClick={() =>
                          call(
                            () => adminApproveProject(p.project_id),
                            `proj-${p.project_id}`,
                          )
                        }
                      >
                        {loading === `proj-${p.project_id}`
                          ? "..."
                          : "✅ Approve"}
                      </button>
                      <button
                        className="reject-btn"
                        disabled={!!loading}
                        onClick={() =>
                          call(
                            () => adminRejectProject(p.project_id),
                            `proj-rej-${p.project_id}`,
                          )
                        }
                      >
                        {loading === `proj-rej-${p.project_id}`
                          ? "..."
                          : "❌ Reject"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Approved Projects Section */}
            <h2 style={{ marginTop: 40 }}>
              ✅ Approved Projects (Live for Investors)
            </h2>
            <p className="dash-sub">
              These projects are visible at /invest and available for staking.
            </p>
            {allProjects.filter((p) => p.status === 1).length === 0 ? (
              <p className="empty-text">No approved projects yet</p>
            ) : (
              <div className="admin-table">
                <div className="table-head">
                  <span>ID</span>
                  <span>Name</span>
                  <span>Location</span>
                  <span>Capacity</span>
                  <span>Expected Yield</span>
                  <span>Status</span>
                  <span>Invest Link</span>
                </div>
                {allProjects
                  .filter((p) => p.status === 1)
                  .map((p) => (
                    <div className="table-row approved" key={p.project_id}>
                      <span className="mono">#{p.project_id}</span>
                      <span>{p.name}</span>
                      <span>Location #{p.location_id}</span>
                      <span>{p.capacity_kw} kW</span>
                      <span>
                        {(Number(p.expected_yield_bps) / 100).toFixed(2)}%
                      </span>
                      <span className="status-chip approved">
                        ✅ {p.status_label}
                      </span>
                      <a
                        href={`/invest/location/${p.location_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="invest-link"
                      >
                        View in Invest →
                      </a>
                    </div>
                  ))}
              </div>
            )}

            {/* Rejected Projects Section (collapsed) */}
            {allProjects.filter((p) => p.status === 2).length > 0 && (
              <>
                <h2 style={{ marginTop: 40 }}>❌ Rejected Projects</h2>
                <div className="admin-table">
                  <div className="table-head">
                    <span>ID</span>
                    <span>Name</span>
                    <span>Installer</span>
                    <span>Capacity</span>
                    <span>Status</span>
                  </div>
                  {allProjects
                    .filter((p) => p.status === 2)
                    .map((p) => (
                      <div className="table-row rejected" key={p.project_id}>
                        <span className="mono">#{p.project_id}</span>
                        <span>{p.name}</span>
                        <span className="mono">
                          {p.installer.slice(0, 10)}...
                        </span>
                        <span>{p.capacity_kw} kW</span>
                        <span className="status-chip rejected">
                          ❌ Rejected
                        </span>
                      </div>
                    ))}
                </div>
              </>
            )}

            <div className="manual-action">
              <h3>Manual Action by Project ID</h3>
              <div className="manual-row">
                <input
                  id="proj-id"
                  type="number"
                  placeholder="Project ID..."
                  style={{ width: 120 }}
                />
                <button
                  onClick={() =>
                    call(
                      () =>
                        adminApproveProject(
                          Number(
                            (
                              document.getElementById(
                                "proj-id",
                              ) as HTMLInputElement
                            ).value,
                          ),
                        ),
                      "proj-approve",
                    )
                  }
                >
                  Approve Project
                </button>
                <button
                  className="reject-btn"
                  onClick={() =>
                    call(
                      () =>
                        adminRejectProject(
                          Number(
                            (
                              document.getElementById(
                                "proj-id",
                              ) as HTMLInputElement
                            ).value,
                          ),
                        ),
                      "proj-reject",
                    )
                  }
                >
                  Reject Project
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Vaults Tab ── */}
        {tab === "vaults" && (
          <div className="dash-section">
            <h2>Vault Management</h2>
            <p className="dash-sub">
              Create and manage per-project staking vaults. Must approve project
              first.
            </p>
            <div className="vault-forms">
              {/* Create Vault */}
              <div className="vault-form-card">
                <h3>🏗️ Create Project Vault</h3>
                <p>Creates a staking vault for an already-approved project. APY
                  defaults to the project's declared yield — override if needed.</p>
                <div className="vault-form-row">
                  <div className="vf-group">
                    <label>Project</label>
                    <select
                      value={vaultProjectId}
                      onChange={(e) => setVaultProjectId(e.target.value)}
                    >
                      <option value="">Select approved project…</option>
                      {allProjects
                        .filter((p) => p.status === 1)
                        .map((p) => (
                          <option key={p.project_id} value={p.project_id}>
                            #{p.project_id} — {p.name} (
                            {(Number(p.expected_yield_bps) / 100).toFixed(2)}%)
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="vf-group">
                    <label>APY Rate (%)</label>
                    <input
                      type="number"
                      value={vaultApyRate}
                      onChange={(e) => setVaultApyRate(e.target.value)}
                      placeholder="from project yield"
                    />
                  </div>
                </div>
                <button
                  className="vault-btn"
                  disabled={!!loading}
                  onClick={() =>
                    call(
                      () =>
                        adminCreateVault(
                          Number(vaultProjectId),
                          Number(vaultApyRate),
                        ),
                      "vault-create",
                    )
                  }
                >
                  {loading === "vault-create"
                    ? "Creating..."
                    : "Create Vault →"}
                </button>
              </div>

              {/* Deposit Rewards */}
              <div className="vault-form-card">
                <h3>💰 Deposit Reward APT</h3>
                <p>
                  Top up a project vault's reward pool so investors can claim
                  yield.
                </p>
                <div className="vault-form-row">
                  <div className="vf-group">
                    <label>Project ID</label>
                    <input
                      type="number"
                      value={depositProjectId}
                      onChange={(e) => setDepositProjectId(e.target.value)}
                      placeholder="e.g. 1"
                    />
                  </div>
                  <div className="vf-group">
                    <label>Amount (octas)</label>
                    <input
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="e.g. 100000000 = 1 APT"
                    />
                  </div>
                </div>
                <button
                  className="vault-btn"
                  disabled={!!loading}
                  onClick={() =>
                    call(
                      () =>
                        adminDepositRewards(
                          Number(depositProjectId),
                          depositAmount,
                        ),
                      "vault-deposit",
                    )
                  }
                >
                  {loading === "vault-deposit"
                    ? "Depositing..."
                    : "Deposit Rewards →"}
                </button>
              </div>

              {/* Update APY */}
              <div className="vault-form-card">
                <h3>⚙️ Update APY Rate</h3>
                <p>Adjust the APY rate for a project vault after creation.</p>
                <div className="vault-form-row">
                  <div className="vf-group">
                    <label>Project ID</label>
                    <input
                      type="number"
                      value={configProjectId}
                      onChange={(e) => setConfigProjectId(e.target.value)}
                      placeholder="e.g. 1"
                    />
                  </div>
                  <div className="vf-group">
                    <label>New APY (%)</label>
                    <input
                      type="number"
                      value={configApy}
                      onChange={(e) => setConfigApy(e.target.value)}
                      placeholder="e.g. 10"
                    />
                  </div>
                </div>
                <button
                  className="vault-btn"
                  disabled={!!loading}
                  onClick={() =>
                    call(
                      () =>
                        adminUpdateConfig(
                          Number(configProjectId),
                          Number(configApy),
                        ),
                      "vault-config",
                    )
                  }
                >
                  {loading === "vault-config" ? "Updating..." : "Update APY →"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Tokens & Market Tab ── */}
        {tab === "tokens" && (
          <div className="dash-section">
            <h2>Project Token & Marketplace</h2>
            <p className="dash-sub">
              Lifecycle order: create token → Funding (staking mints) → Active →
              init market. Trading only works while the project is Active.
            </p>
            <div className="vault-forms">
              {/* Create Project Token */}
              <div className="vault-form-card">
                <h3>🪙 Create Project Token</h3>
                <p>
                  Stands up the fungible asset. Project must already exist in the
                  registry (reads its token params on-chain).
                </p>
                <div className="vault-form-row">
                  <div className="vf-group">
                    <label>Project ID</label>
                    <input
                      type="number"
                      value={tokProjectId}
                      onChange={(e) => setTokProjectId(e.target.value)}
                      placeholder="e.g. 1"
                    />
                  </div>
                  <div className="vf-group">
                    <label>Max Supply (0 = uncapped)</label>
                    <input
                      value={tokMaxSupply}
                      onChange={(e) => setTokMaxSupply(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="vault-form-row">
                  <div className="vf-group">
                    <label>NAV per Token (octas)</label>
                    <input
                      value={tokNav}
                      onChange={(e) => setTokNav(e.target.value)}
                      placeholder="100000000 = 1 APT"
                    />
                  </div>
                  <div className="vf-group">
                    <label>Max Staleness (seconds)</label>
                    <input
                      value={tokStaleness}
                      onChange={(e) => setTokStaleness(e.target.value)}
                      placeholder="86400 = 1 day"
                    />
                  </div>
                </div>
                <button
                  className="vault-btn"
                  disabled={!!loading}
                  onClick={() =>
                    call(
                      () =>
                        adminInitProjectToken(
                          Number(tokProjectId),
                          tokMaxSupply,
                          tokNav,
                          Number(tokStaleness),
                        ),
                      "token-init",
                    )
                  }
                >
                  {loading === "token-init" ? "Creating..." : "Create Token →"}
                </button>
              </div>

              {/* Set Lifecycle */}
              <div className="vault-form-card">
                <h3>🔄 Set Lifecycle Stage</h3>
                <p>
                  Strictly increasing: 0 PreLaunch · 1 Funding · 2 Active · 3
                  Matured · 4 Closed.
                </p>
                <div className="vault-form-row">
                  <div className="vf-group">
                    <label>Project ID</label>
                    <input
                      type="number"
                      value={lcProjectId}
                      onChange={(e) => setLcProjectId(e.target.value)}
                      placeholder="e.g. 1"
                    />
                  </div>
                  <div className="vf-group">
                    <label>New Stage</label>
                    <select
                      value={lcStage}
                      onChange={(e) => setLcStage(e.target.value)}
                    >
                      <option value="1">1 — Funding</option>
                      <option value="2">2 — Active</option>
                      <option value="3">3 — Matured</option>
                      <option value="4">4 — Closed</option>
                    </select>
                  </div>
                </div>
                <button
                  className="vault-btn"
                  disabled={!!loading}
                  onClick={() =>
                    call(
                      () =>
                        adminSetLifecycle(Number(lcProjectId), Number(lcStage)),
                      "token-lifecycle",
                    )
                  }
                >
                  {loading === "token-lifecycle"
                    ? "Updating..."
                    : "Set Lifecycle →"}
                </button>
              </div>

              {/* Update NAV */}
              <div className="vault-form-card">
                <h3>📈 Update NAV</h3>
                <p>Sets the net asset value (octas per token).</p>
                <div className="vault-form-row">
                  <div className="vf-group">
                    <label>Project ID</label>
                    <input
                      type="number"
                      value={navProjectId}
                      onChange={(e) => setNavProjectId(e.target.value)}
                      placeholder="e.g. 1"
                    />
                  </div>
                  <div className="vf-group">
                    <label>New NAV (octas)</label>
                    <input
                      value={navValue}
                      onChange={(e) => setNavValue(e.target.value)}
                      placeholder="100000000 = 1 APT"
                    />
                  </div>
                </div>
                <button
                  className="vault-btn"
                  disabled={!!loading}
                  onClick={() =>
                    call(
                      () => adminUpdateNav(Number(navProjectId), navValue),
                      "token-nav",
                    )
                  }
                >
                  {loading === "token-nav" ? "Updating..." : "Update NAV →"}
                </button>
              </div>

              {/* Distribute Yield */}
              <div className="vault-form-card">
                <h3>💸 Distribute Yield</h3>
                <p>
                  Pulls APT from the admin wallet into the project's yield vault
                  (project must be Active or Matured).
                </p>
                <div className="vault-form-row">
                  <div className="vf-group">
                    <label>Project ID</label>
                    <input
                      type="number"
                      value={yieldProjectId}
                      onChange={(e) => setYieldProjectId(e.target.value)}
                      placeholder="e.g. 1"
                    />
                  </div>
                  <div className="vf-group">
                    <label>Amount (octas)</label>
                    <input
                      value={yieldAmount}
                      onChange={(e) => setYieldAmount(e.target.value)}
                      placeholder="10000000 = 0.1 APT"
                    />
                  </div>
                </div>
                <button
                  className="vault-btn"
                  disabled={!!loading}
                  onClick={() =>
                    call(
                      () =>
                        adminDistributeYield(Number(yieldProjectId), yieldAmount),
                      "token-yield",
                    )
                  }
                >
                  {loading === "token-yield"
                    ? "Distributing..."
                    : "Distribute Yield →"}
                </button>
              </div>

              {/* Init Market */}
              <div className="vault-form-card">
                <h3>🏪 Initialize Market</h3>
                <p>
                  Creates the order book + escrow for a project. Do this once the
                  project is Active.
                </p>
                <div className="vault-form-row">
                  <div className="vf-group">
                    <label>Project ID</label>
                    <input
                      type="number"
                      value={marketProjectId}
                      onChange={(e) => setMarketProjectId(e.target.value)}
                      placeholder="e.g. 1"
                    />
                  </div>
                </div>
                <button
                  className="vault-btn"
                  disabled={!!loading}
                  onClick={() =>
                    call(
                      () => adminInitMarket(Number(marketProjectId)),
                      "market-init",
                    )
                  }
                >
                  {loading === "market-init"
                    ? "Initializing..."
                    : "Init Market →"}
                </button>
              </div>

              {/* Update Fee */}
              <div className="vault-form-card">
                <h3>⚙️ Update Protocol Fee</h3>
                <p>Basis points, capped at 1000 (10%). 50 = 0.50%.</p>
                <div className="vault-form-row">
                  <div className="vf-group">
                    <label>Fee (bps)</label>
                    <input
                      type="number"
                      value={feeBps}
                      onChange={(e) => setFeeBps(e.target.value)}
                      placeholder="50"
                    />
                  </div>
                </div>
                <button
                  className="vault-btn"
                  disabled={!!loading}
                  onClick={() =>
                    call(() => adminUpdateFee(Number(feeBps)), "market-fee")
                  }
                >
                  {loading === "market-fee" ? "Updating..." : "Update Fee →"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
