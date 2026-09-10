import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import type { InputTransactionData } from "@aptos-labs/wallet-adapter-react";
import {
  getProject,
  getProjectVault,
  getPlayerProjectStake,
  getBalance,
  simulateStake,
  type ProjectInfo,
  type ProjectVaultInfo,
  type ProjectPlayerStake,
} from "../../services/api";
import "./ProjectStake.css";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const HUB_AUTHORITY = import.meta.env.VITE_HUB_AUTHORITY || CONTRACT_ADDRESS;

const DURATION_PRESETS = [
  { label: "1 Min", value: 60, sublabel: "Test" },
  { label: "7 Days", value: 604800, sublabel: "1 Week" },
  { label: "30 Days", value: 2592000, sublabel: "1 Month" },
  { label: "90 Days", value: 7776000, sublabel: "3 Months" },
  { label: "180 Days", value: 15552000, sublabel: "6 Months" },
  { label: "365 Days", value: 31536000, sublabel: "1 Year" },
];

const aptToOctas = (apt: number) => Math.floor(apt * 1e8).toString();
const formatSeconds = (s: number) => {
  if (s <= 0) return "Unlocked";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${Math.floor(s / 3600)}h`;
};

export default function ProjectStake() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const projId = Number(projectId);

  const {
    connect,
    disconnect,
    account,
    connected,
    wallets,
    signAndSubmitTransaction,
    network,
  } = useWallet();

  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [vault, setVault] = useState<ProjectVaultInfo | null>(null);
  const [playerStake, setPlayerStake] = useState<ProjectPlayerStake | null>(
    null,
  );
  const [balance, setBalance] = useState("0");
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Stake form state
  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState(604800);
  const [simResult, setSimResult] = useState<any>(null);

  const walletAddress = account?.address?.toString() || null;
  const petra = wallets?.find((w) => w.name.toLowerCase().includes("petra"));

  // Load project + vault data
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Independent fetches: a not-yet-created vault (404) must not blank the project.
        const pRes = await getProject(projId).catch(() => null);
        if (pRes?.success && pRes.data) setProject(pRes.data);
        const vRes = await getProjectVault(projId).catch(() => null);
        if (vRes?.success && vRes.data) setVault(vRes.data);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projId, refreshKey]);

  // Load player stake when wallet connects
  useEffect(() => {
    if (!walletAddress) return;
    const load = async () => {
      const bRes = await getBalance(walletAddress).catch(() => null);
      if (bRes?.success && bRes.data) setBalance(bRes.data.balance_apt);
      const sRes = await getPlayerProjectStake(walletAddress, projId).catch(() => null);
      if (sRes?.success && sRes.data) setPlayerStake(sRes.data);
    };
    load();
  }, [walletAddress, projId, refreshKey]);

  // Simulate rewards on amount/duration change
  useEffect(() => {
    if (!amount || Number(amount) <= 0 || !vault) {
      setSimResult(null);
      return;
    }
    const t = setTimeout(async () => {
      const days = Math.round(duration / 86400) || 1;
      const res = await simulateStake(
        aptToOctas(Number(amount)),
        vault.apy_rate,
        days,
      );
      if (res.success && res.data) setSimResult(res.data);
    }, 300);
    return () => clearTimeout(t);
  }, [amount, duration, vault]);

  const handleConnect = async () => {
    const w = petra || wallets?.[0];
    if (!w) {
      window.open("https://petra.app/", "_blank");
      return;
    }
    await connect(w.name);
  };

  const submitTx = async (fn: string, args: any[]) => {
    setTxLoading(true);
    setError(null);
    setTxHash(null);
    try {
      const tx: InputTransactionData = {
        data: { function: fn as any, functionArguments: args },
      };
      const res = await signAndSubmitTransaction(tx);
      setTxHash(res.hash);
      await new Promise((r) => setTimeout(r, 2500));
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      setError(e.message || "Transaction failed");
    } finally {
      setTxLoading(false);
    }
  };

  const handleStake = async () => {
    if (!amount || Number(amount) <= 0) return;
    await submitTx(`${CONTRACT_ADDRESS}::state::sol_stake`, [
      HUB_AUTHORITY,
      projId,
      aptToOctas(Number(amount)),
      duration,
    ]);
    setAmount("");
  };

  const handleUnstake = async () => {
    await submitTx(`${CONTRACT_ADDRESS}::state::sol_unstake`, [
      HUB_AUTHORITY,
      projId,
    ]);
  };

  const handleClaim = async () => {
    await submitTx(`${CONTRACT_ADDRESS}::state::claim_rewards`, [
      HUB_AUTHORITY,
      projId,
    ]);
  };

  if (loading)
    return <div className="stake-loading">Loading project data...</div>;
  if (!project)
    return (
      <div className="stake-loading">
        Project not found.{" "}
        <button onClick={() => navigate("/invest")}>Go back</button>
      </div>
    );

  return (
    <div className="project-stake-page">
      {/* Background */}
      <div className="stake-bg">
        <div className="stake-orb orb-1" />
        <div className="stake-orb orb-2" />
        <div className="stake-grid" />
      </div>

      {/* Header */}
      <header className="stake-header">
        <div className="stake-logo">
          <span>⚡</span>
          <span className="logo-text">Aethera</span>
          <span className="logo-badge">Staking</span>
        </div>
        <nav className="stake-nav">
          <button onClick={() => navigate("/invest")} className="nav-link">
            ← Projects
          </button>
          <button
            onClick={() => navigate(`/invest/project/${projId}/trade`)}
            className="nav-link"
          >
            📈 Trade Tokens
          </button>
          <button onClick={() => navigate("/")} className="nav-link">
            Home
          </button>
          <a
            href={`https://explorer.aptoslabs.com/account/${CONTRACT_ADDRESS}?network=testnet`}
            target="_blank"
            rel="noreferrer"
            className="nav-link"
          >
            Explorer ↗
          </a>
        </nav>
        <div className="stake-wallet">
          {connected && walletAddress ? (
            <div className="wallet-connected">
              <span className="net-badge">{network?.name}</span>
              <span className="bal">{Number(balance).toFixed(2)} APT</span>
              <span className="addr">
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </span>
              <button className="disc-btn" onClick={() => disconnect()}>
                ✕
              </button>
            </div>
          ) : (
            <button className="connect-btn" onClick={handleConnect}>
              🔗 Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Project title */}
      <div className="project-hero">
        <h1>
          Stake APT. <span className="green-text">Earn Rewards.</span>
        </h1>
        <p>
          Project: <strong>{project.name}</strong> · {project.capacity_kw} kW ·{" "}
          <span className="apy-highlight">{vault?.apy_rate ?? project.expected_yield_bps / 100}% APY</span>
        </p>
      </div>

      {/* Feedback */}
      {error && (
        <div
          className="feedback error"
          style={{ maxWidth: 900, margin: "0 auto 12px", padding: "0 24px" }}
        >
          ⚠️ {error}
        </div>
      )}
      {txHash && (
        <div
          className="feedback success"
          style={{ maxWidth: 900, margin: "0 auto 12px", padding: "0 24px" }}
        >
          ✅ Tx submitted!{" "}
          <a
            href={`https://explorer.aptoslabs.com/txn/${txHash}?network=testnet`}
            target="_blank"
            rel="noreferrer"
          >
            View ↗
          </a>
        </div>
      )}

      {/* Main grid — same 2-col layout as Image 4 */}
      <div className="stake-grid-layout">
        {/* LEFT: Stake Form */}
        <div className="stake-form-card">
          <div className="form-top">
            <h2>💎 Stake APT</h2>
            <div className="apy-badge">
              <span>Current APY</span>
              <strong>{vault?.apy_rate ?? "—"}%</strong>
            </div>
          </div>

          <div className="input-group">
            <label>Amount to Stake</label>
            <div className="input-row">
              <input
                type="text"
                value={amount}
                onChange={(e) => {
                  if (/^\d*\.?\d*$/.test(e.target.value))
                    setAmount(e.target.value);
                }}
                placeholder="0.00"
                disabled={!connected || txLoading}
              />
              <div className="input-right">
                <span>APT</span>
                <button
                  onClick={() =>
                    setAmount(Math.max(0, Number(balance) - 0.01).toFixed(4))
                  }
                  disabled={!connected}
                >
                  MAX
                </button>
              </div>
            </div>
            <span className="input-hint">
              Available: {Number(balance).toFixed(4)} APT
            </span>
          </div>

          <div className="duration-section">
            <label>Lock Duration</label>
            <div className="duration-grid">
              {DURATION_PRESETS.map((p) => (
                <button
                  key={p.value}
                  className={`dur-btn ${duration === p.value ? "active" : ""}`}
                  onClick={() => setDuration(p.value)}
                  disabled={!connected || txLoading}
                >
                  <span>{p.label}</span>
                  <small>{p.sublabel}</small>
                </button>
              ))}
            </div>
          </div>

          {/* Simulation */}
          {simResult && Number(amount) > 0 && (
            <div className="sim-box">
              <span className="sim-title">📊 Estimated Returns</span>
              <div className="sim-grid">
                <div>
                  <span>Staking</span>
                  <strong>{amount} APT</strong>
                </div>
                <div>
                  <span>APY Rate</span>
                  <strong>{simResult.apy_rate}%</strong>
                </div>
                <div>
                  <span>Est. Rewards</span>
                  <strong className="green-text">
                    {simResult.estimated_reward_apt} APT
                  </strong>
                </div>
                <div>
                  <span>Total Return</span>
                  <strong>{simResult.total_return_apt} APT</strong>
                </div>
              </div>
            </div>
          )}

          {/* Stake Button */}
          <button
            className={`stake-action-btn ${!connected ? "connect" : ""}`}
            onClick={connected ? handleStake : handleConnect}
            disabled={
              connected && (!amount || Number(amount) <= 0 || txLoading)
            }
          >
            {txLoading
              ? "⏳ Processing..."
              : !connected
                ? "🔗 Connect Wallet to Stake"
                : !amount
                  ? "Enter amount"
                  : `🚀 Stake ${amount} APT`}
          </button>

          <div className="info-notes">
            <span>ℹ️ Tokens are locked for the selected duration</span>
            <span>💡 Rewards can be claimed anytime after staking</span>
            <span>⚠️ Unstaking only available after lock period ends</span>
          </div>
        </div>

        {/* RIGHT: Vault Stats + Your Staking */}
        <div className="right-col">
          {/* Vault Stats */}
          <div className="info-card">
            <h3>🏦 Vault Statistics</h3>
            {vault ? (
              <div className="vault-stats">
                <div className="stat-row">
                  <span>Project</span>
                  <strong>
                    #{project.project_id} — {project.name}
                  </strong>
                </div>
                <div className="stat-row">
                  <span>Total Staked</span>
                  <strong>{vault.total_staked_apt} APT</strong>
                </div>
                <div className="stat-row">
                  <span>APY Rate</span><strong className="green-text">{vault.apy_rate}%</strong>
                </div>
                <div className="stat-row">
                  <span>Capacity</span>
                  <strong>{project.capacity_kw} kW</strong>
                </div>
                <div className="stat-row">
                  <span>Funding Goal</span>
                  <strong>{project.cost_apt_human}</strong>
                </div>
              </div>
            ) : (
              <div className="card-loading">⏳ Loading vault data...</div>
            )}
          </div>

          {/* Your Staking */}
          <div className="info-card">
            <h3>👤 Your Staking</h3>
            {!connected ? (
              <div className="card-empty">
                <span>🔗</span>
                <p>Connect your wallet to view staking info</p>
              </div>
            ) : !playerStake || Number(playerStake.staked_amount) === 0 ? (
              <div className="card-empty">
                <span>💤</span>
                <p>You haven't staked on this project yet</p>
              </div>
            ) : (
              <div className="player-stats">
                <div className="stat-row">
                  <span>Staked</span>
                  <strong>{playerStake.staked_amount_apt} APT</strong>
                </div>
                <div className="stat-row">
                  <span>Status</span>
                  <strong
                    style={{
                      color: playerStake.is_locked ? "#f59e0b" : "#4ade80",
                    }}
                  >
                    {playerStake.is_locked
                      ? `🔒 Locked (${formatSeconds(playerStake.time_remaining)} left)`
                      : "🔓 Unlocked"}
                  </strong>
                </div>
                <div className="stat-row">
                  <span>Pending Rewards</span>
                  <strong className="green-text">
                    {playerStake.pending_rewards_apt} APT
                  </strong>
                </div>

                <div className="action-btns">
                  <button
                    className="claim-btn"
                    onClick={handleClaim}
                    disabled={
                      txLoading || Number(playerStake.pending_rewards) === 0
                    }
                  >
                    {txLoading ? "..." : "💰 Claim Rewards"}
                  </button>
                  <button
                    className="unstake-btn"
                    onClick={handleUnstake}
                    disabled={txLoading || playerStake.is_locked}
                    title={
                      playerStake.is_locked
                        ? "Lock period not expired"
                        : "Unstake your APT"
                    }
                  >
                    {txLoading ? "..." : "↩ Unstake"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
