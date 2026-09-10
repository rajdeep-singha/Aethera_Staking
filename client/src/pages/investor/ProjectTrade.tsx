import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import type { InputTransactionData } from "@aptos-labs/wallet-adapter-react";
import {
  getProject,
  getTokenBalance,
  getTokenNav,
  getTokenLifecycle,
  getPendingYield,
  getOrderBook,
  OrderSide,
  LIFECYCLE_LABELS,
  Lifecycle,
  type ProjectInfo,
  type MarketOrder,
} from "../../services/api";
import "./ProjectTrade.css";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const HUB_AUTHORITY = import.meta.env.VITE_HUB_AUTHORITY || CONTRACT_ADDRESS;

const octasToApt = (o: string | number) => (Number(o) / 1e8).toFixed(4);
const aptToOctas = (apt: number) => Math.floor(apt * 1e8).toString();

export default function ProjectTrade() {
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
  const [tokenBalance, setTokenBalance] = useState("0");
  const [nav, setNav] = useState<string>("0");
  const [lifecycle, setLifecycle] = useState<number | null>(null);
  const [pendingYield, setPendingYield] = useState("0");
  const [bids, setBids] = useState<MarketOrder[]>([]);
  const [asks, setAsks] = useState<MarketOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Order form
  const [side, setSide] = useState<number>(OrderSide.ASK);
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");

  const walletAddress = account?.address?.toString() || null;
  const petra = wallets?.find((w) => w.name.toLowerCase().includes("petra"));
  const isActive = lifecycle === Lifecycle.ACTIVE;

  // Load project + market data
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Independent fetches: a not-yet-created token (nav/lifecycle 404) must
        // not blank the project. Each failure degrades to null, not a dead page.
        const [pRes, nRes, lRes, obRes] = await Promise.all([
          getProject(projId).catch(() => null),
          getTokenNav(projId).catch(() => null),
          getTokenLifecycle(projId).catch(() => null),
          getOrderBook(projId).catch(() => null),
        ]);
        if (pRes?.success && pRes.data) setProject(pRes.data);
        if (nRes?.success && nRes.data) setNav(nRes.data.nav_per_token);
        if (lRes?.success && lRes.data) setLifecycle(lRes.data.lifecycle);
        if (obRes?.success && obRes.data) {
          setBids(obRes.data.bids);
          setAsks(obRes.data.asks);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projId, refreshKey]);

  // Load wallet-specific data
  useEffect(() => {
    if (!walletAddress) return;
    const load = async () => {
      const bRes = await getTokenBalance(walletAddress, projId).catch(() => null);
      if (bRes?.success && bRes.data) setTokenBalance(bRes.data.balance);
      const yRes = await getPendingYield(walletAddress, projId).catch(() => null);
      if (yRes?.success && yRes.data) setPendingYield(yRes.data.pending_yield);
    };
    load();
  }, [walletAddress, projId, refreshKey]);

  // Poll order book every 8s (matches the server indexer cadence)
  useEffect(() => {
    const t = setInterval(async () => {
      const obRes = await getOrderBook(projId).catch(() => null);
      if (obRes?.success && obRes.data) {
        setBids(obRes.data.bids);
        setAsks(obRes.data.asks);
      }
    }, 8000);
    return () => clearInterval(t);
  }, [projId]);

  const handleConnect = async () => {
    const w = petra || wallets?.[0];
    if (!w) {
      window.open("https://petra.app/", "_blank");
      return;
    }
    await connect(w.name);
  };

  const submitTx = useCallback(
    async (fn: string, args: any[]) => {
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
    },
    [signAndSubmitTransaction],
  );

  const handlePlaceOrder = async () => {
    if (!price || !qty || Number(price) <= 0 || Number(qty) <= 0) return;
    // place_order(maker, hub_authority, project_id, side, price_per_token, quantity)
    await submitTx(`${CONTRACT_ADDRESS}::marketplace::place_order`, [
      HUB_AUTHORITY,
      projId,
      side,
      aptToOctas(Number(price)), // price_per_token in octas
      qty, // whole tokens
    ]);
    setPrice("");
    setQty("");
  };

  const handleFill = async (order: MarketOrder) => {
    // fill_order(taker, hub_authority, project_id, order_id, fill_quantity)
    await submitTx(`${CONTRACT_ADDRESS}::marketplace::fill_order`, [
      HUB_AUTHORITY,
      projId,
      order.order_id,
      order.quantity, // fill the full remaining quantity
    ]);
  };

  const handleCancel = async (order: MarketOrder) => {
    // cancel_order(maker, hub_authority, project_id, order_id)
    await submitTx(`${CONTRACT_ADDRESS}::marketplace::cancel_order`, [
      HUB_AUTHORITY,
      projId,
      order.order_id,
    ]);
  };

  const handleClaimYield = async () => {
    // claim_yield(investor, hub_authority, project_id)
    await submitTx(`${CONTRACT_ADDRESS}::project_token::claim_yield`, [
      HUB_AUTHORITY,
      projId,
    ]);
  };

  if (loading) return <div className="trade-loading">Loading market data...</div>;
  if (!project)
    return (
      <div className="trade-loading">
        Project not found.{" "}
        <button onClick={() => navigate("/invest")}>Go back</button>
      </div>
    );

  const isMine = (o: MarketOrder) =>
    walletAddress && o.maker.toLowerCase() === walletAddress.toLowerCase();

  return (
    <div className="project-trade-page">
      {/* Header */}
      <header className="trade-header">
        <div className="trade-logo">
          <span>⚡</span>
          <span className="logo-text">Aethera</span>
          <span className="logo-badge">Market</span>
        </div>
        <nav className="trade-nav">
          <button onClick={() => navigate(`/invest/project/${projId}`)} className="nav-link">
            ← Stake
          </button>
          <button onClick={() => navigate("/invest")} className="nav-link">
            Projects
          </button>
        </nav>
        <div className="trade-wallet">
          {connected && walletAddress ? (
            <div className="wallet-connected">
              <span className="net-badge">{network?.name}</span>
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

      {/* Title */}
      <div className="trade-hero">
        <h1>
          Trade <span className="green-text">{project.name}</span> tokens
        </h1>
        <p>
          Project #{project.project_id} ·{" "}
          <span className="apy-highlight">
            NAV {octasToApt(nav)} APT/token
          </span>{" "}
          ·{" "}
          <span className={`lc-chip lc-${lifecycle}`}>
            {lifecycle !== null ? LIFECYCLE_LABELS[lifecycle] : "—"}
          </span>
        </p>
      </div>

      {!isActive && (
        <div className="trade-banner warn" style={{ maxWidth: 1000, margin: "0 auto 12px" }}>
          ⚠️ Trading is only available while the project is <strong>Active</strong>.
          Orders can't be placed or filled right now.
        </div>
      )}
      {error && (
        <div className="trade-banner error" style={{ maxWidth: 1000, margin: "0 auto 12px" }}>
          ⚠️ {error}
        </div>
      )}
      {txHash && (
        <div className="trade-banner success" style={{ maxWidth: 1000, margin: "0 auto 12px" }}>
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

      <div className="trade-grid-layout">
        {/* LEFT: Place order + wallet */}
        <div className="trade-form-card">
          <div className="form-top">
            <h2>📝 Place Order</h2>
          </div>

          <div className="wallet-stats">
            <div className="stat-row">
              <span>Your Token Balance</span>
              <strong>{connected ? tokenBalance : "—"}</strong>
            </div>
            <div className="stat-row">
              <span>Pending Yield</span>
              <strong className="green-text">
                {connected ? `${octasToApt(pendingYield)} APT` : "—"}
              </strong>
            </div>
            <button
              className="claim-btn"
              onClick={handleClaimYield}
              disabled={!connected || txLoading || Number(pendingYield) === 0}
            >
              {txLoading ? "..." : "💰 Claim Yield"}
            </button>
          </div>

          <div className="side-toggle">
            <button
              className={`side-btn ${side === OrderSide.BID ? "active bid" : ""}`}
              onClick={() => setSide(OrderSide.BID)}
              disabled={txLoading}
            >
              Buy (Bid)
            </button>
            <button
              className={`side-btn ${side === OrderSide.ASK ? "active ask" : ""}`}
              onClick={() => setSide(OrderSide.ASK)}
              disabled={txLoading}
            >
              Sell (Ask)
            </button>
          </div>

          <div className="input-group">
            <label>Price per Token (APT)</label>
            <input
              type="text"
              value={price}
              onChange={(e) => {
                if (/^\d*\.?\d*$/.test(e.target.value)) setPrice(e.target.value);
              }}
              placeholder="0.00"
              disabled={!connected || txLoading}
            />
          </div>

          <div className="input-group">
            <label>Quantity (tokens)</label>
            <input
              type="text"
              value={qty}
              onChange={(e) => {
                if (/^\d*$/.test(e.target.value)) setQty(e.target.value);
              }}
              placeholder="0"
              disabled={!connected || txLoading}
            />
            {price && qty && (
              <span className="input-hint">
                Total: {(Number(price) * Number(qty)).toFixed(4)} APT
                {side === OrderSide.BID ? " (escrowed now)" : " (you deliver tokens on fill)"}
              </span>
            )}
          </div>

          <button
            className={`trade-action-btn ${!connected ? "connect" : ""}`}
            onClick={connected ? handlePlaceOrder : handleConnect}
            disabled={
              connected &&
              (!isActive || !price || !qty || Number(price) <= 0 || Number(qty) <= 0 || txLoading)
            }
          >
            {txLoading
              ? "⏳ Processing..."
              : !connected
                ? "🔗 Connect Wallet"
                : !isActive
                  ? "Trading not active"
                  : side === OrderSide.BID
                    ? `🟢 Place Bid`
                    : `🔴 Place Ask`}
          </button>
        </div>

        {/* RIGHT: Order book */}
        <div className="orderbook-col">
          <div className="ob-card">
            <h3>🔴 Asks (Sell orders)</h3>
            {asks.length === 0 ? (
              <div className="ob-empty">No sell orders</div>
            ) : (
              <div className="ob-table">
                <div className="ob-head">
                  <span>Price (APT)</span>
                  <span>Qty</span>
                  <span>Maker</span>
                  <span></span>
                </div>
                {asks.map((o) => (
                  <div className="ob-row ask" key={o.order_id}>
                    <span>{octasToApt(o.price_per_token)}</span>
                    <span>{o.quantity}</span>
                    <span className="mono">{o.maker.slice(0, 6)}…</span>
                    <span>
                      {isMine(o) ? (
                        <button
                          className="ob-cancel"
                          onClick={() => handleCancel(o)}
                          disabled={txLoading}
                        >
                          Cancel
                        </button>
                      ) : (
                        <button
                          className="ob-fill buy"
                          onClick={() => handleFill(o)}
                          disabled={!connected || !isActive || txLoading}
                        >
                          Buy
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ob-card">
            <h3>🟢 Bids (Buy orders)</h3>
            {bids.length === 0 ? (
              <div className="ob-empty">No buy orders</div>
            ) : (
              <div className="ob-table">
                <div className="ob-head">
                  <span>Price (APT)</span>
                  <span>Qty</span>
                  <span>Maker</span>
                  <span></span>
                </div>
                {bids.map((o) => (
                  <div className="ob-row bid" key={o.order_id}>
                    <span>{octasToApt(o.price_per_token)}</span>
                    <span>{o.quantity}</span>
                    <span className="mono">{o.maker.slice(0, 6)}…</span>
                    <span>
                      {isMine(o) ? (
                        <button
                          className="ob-cancel"
                          onClick={() => handleCancel(o)}
                          disabled={txLoading}
                        >
                          Cancel
                        </button>
                      ) : (
                        <button
                          className="ob-fill sell"
                          onClick={() => handleFill(o)}
                          disabled={!connected || !isActive || txLoading}
                        >
                          Sell
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="ob-note">
            ℹ️ Order book is served from the off-chain event index and refreshes every ~8s.
          </p>
        </div>
      </div>
    </div>
  );
}
