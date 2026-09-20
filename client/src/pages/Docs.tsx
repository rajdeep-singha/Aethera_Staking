import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Docs.css";

/* ── Table of contents ── */
const TOC = [
  { id: "overview", label: "Overview" },
  { id: "principles", label: "Design Principles" },
  { id: "architecture", label: "System Architecture" },
  { id: "tokens", label: "Token Model" },
  { id: "workflows", label: "Workflows" },
  { id: "yield", label: "Yield Flow" },
  { id: "treasury", label: "Treasury" },
  { id: "compliance", label: "Compliance" },
  { id: "liquidity", label: "Liquidity Phases" },
  { id: "risk", label: "Risk Controls" },
  { id: "status", label: "Implementation Status" },
  { id: "reference", label: "Contracts & API" },
];

type Status = "live" | "partial" | "planned";
const Badge = ({ s }: { s: Status }) => {
  const label = s === "live" ? "Live" : s === "partial" ? "Partial" : "Planned";
  return <span className={`badge ${s}`}>{label}</span>;
};

/* ── Engineering principles (spec §1) ── */
const PRINCIPLES = [
  { t: "Funds safety > feature velocity", d: "Treasury and distribution contracts are immutable after audit; new features ship as separate modules." },
  { t: "Auditability by non-engineers", d: "Every on-chain state change maps to a real-world event — kWh generated or a DISCOM payment received." },
  { t: "Graceful degradation", d: "If the oracle fails, yield distribution pauses rather than distributing wrong amounts." },
  { t: "Compliance-first design", d: "KYC / whitelist enforcement lives in the token transfer layer, not as an app-level check." },
  { t: "No single points of failure", d: "Multisig on all privileged operations; timelock on all upgrades." },
  { t: "Aptos-native resources", d: "Solar tokens are modeled as controlled Move resources with explicit ownership and transfer rules." },
];

/* ── Five architecture layers (spec: Core System Structure) ── */
const LAYERS = [
  { name: "Legal Layer", tag: "Off-chain", desc: "Each solar project sits inside a bankruptcy-remote SPV that holds the project rights, PPA cash flows and obligations. The token is a legally defined claim on that SPV." },
  { name: "Asset Layer", tag: "Physical", desc: "Solar generation monitored via meters and inverter telemetry. DISCOM / offtaker payments arrive off-chain in fiat and are converted into settlement inputs." },
  { name: "Aptos On-Chain Layer", tag: "Settlement rail", desc: "Aptos holds the canonical token state — balances, transfer restrictions, distribution snapshots and treasury movements. Compliance is enforced at the protocol level." },
  { name: "Off-Chain Infra Layer", tag: "Services", desc: "KYC/AML, sanctions screening, onboarding, document storage and underwriting. Oracle services bridge verified energy output and payment receipts into on-chain events." },
  { name: "Application Layer", tag: "This app", desc: "Investor dashboard, installer portal, compliance console and reporting — presentation & orchestration on top of chain state, not a source of truth." },
];

/* ── Role-based workflows, mapped to real on-chain entry functions ── */
const FLOWS: Record<string, { role: string; steps: { t: string; d: string; fn?: string; status: Status }[] }> = {
  installer: {
    role: "Solar Installer",
    steps: [
      { t: "Connect wallet", d: "Installer connects an Aptos wallet (Petra) in the Installer Portal.", status: "live" },
      { t: "Register profile", d: "Submit business name and registration details to create an on-chain installer record.", fn: "installer_registry::register_installer", status: "live" },
      { t: "Submit KYC", d: "Upload verification documents; a document hash is committed on-chain, status → Submitted.", fn: "installer_registry::submit_kyc", status: "live" },
      { t: "Await approval", d: "Platform admin reviews and approves KYC before the installer can list projects.", fn: "installer_registry::approve_kyc", status: "live" },
      { t: "Submit project", d: "List a solar project — capacity, cost, location, expected yield and document hash.", fn: "project_listing::submit_project", status: "live" },
      { t: "Get funded", d: "Once approved and tokenized, the project raises capital from investors and disburses to the installer.", status: "partial" },
    ],
  },
  investor: {
    role: "Investor",
    steps: [
      { t: "Browse locations", d: "Explore vetted solar sites with live irradiance data from the Solar Oracle.", fn: "GET /projects/location/:id", status: "live" },
      { t: "Open a project", d: "Review capacity, expected yield, NAV and lifecycle stage (PreLaunch → Funding → Active → Matured → Closed).", fn: "project_token::get_nav / lifecycle", status: "live" },
      { t: "Stake / invest", d: "Stake APT into the project vault (or receive project tokens) to gain economic exposure to the SPV.", fn: "state::sol_stake / project_token::mint_to_investor", status: "live" },
      { t: "Earn yield", d: "Admin distributes energy revenue pro-rata to holders; pending yield accrues per wallet.", fn: "project_token::distribute_yield", status: "live" },
      { t: "Claim rewards", d: "Claim accrued yield / staking rewards to your wallet at any time.", fn: "project_token::claim_yield / state::claim_rewards", status: "live" },
      { t: "Trade on marketplace", d: "Place bid / ask orders on the on-chain order book for compliant secondary transfers.", fn: "marketplace::place_order / fill_order", status: "live" },
    ],
  },
  admin: {
    role: "Platform Admin",
    steps: [
      { t: "Review KYC", d: "Approve or reject installer KYC submissions from the admin console.", fn: "installer_registry::approve_kyc / reject_kyc", status: "live" },
      { t: "Approve projects", d: "Vet and approve (or reject) submitted solar projects before tokenization.", fn: "project_listing::approve_project", status: "live" },
      { t: "Set token params & mint", d: "Configure token parameters and initialize the per-project token.", fn: "project_listing::set_token_params / project_token::initialize_project_token", status: "live" },
      { t: "Create staking vault", d: "Spin up the project vault and configure APY for staking.", fn: "state::create_project_vault", status: "live" },
      { t: "Update NAV & lifecycle", d: "Push oracle-verified NAV updates and advance the project lifecycle stage.", fn: "project_token::update_nav / set_lifecycle", status: "live" },
      { t: "Distribute yield", d: "Deposit and distribute energy revenue to token holders pro-rata.", fn: "project_token::distribute_yield", status: "live" },
      { t: "Manage market & fees", d: "Initialize the per-project market and update marketplace fee (bps).", fn: "marketplace::init_project_market / update_fee", status: "live" },
    ],
  },
};

/* ── Implementation status matrix ── */
const STATUS_ROWS: { area: string; detail: string; s: Status }[] = [
  { area: "Installer registry & KYC", detail: "register_installer, submit_kyc, approve/reject KYC", s: "live" },
  { area: "Project listing", detail: "submit_project, approve/reject, set_token_params", s: "live" },
  { area: "Per-project yield token", detail: "NAV, lifecycle, mint, distribute & claim yield, staleness guard", s: "live" },
  { area: "APT staking vaults", detail: "create vault, sol_stake / unstake, claim_rewards, APY config", s: "live" },
  { area: "On-chain marketplace", detail: "order book — place / cancel / fill orders, fee (bps)", s: "live" },
  { area: "Solar Oracle integration", detail: "irradiance (DNI/GHI) feeds surfaced in the app", s: "live" },
  { area: "Fiat → USDC on-ramp", detail: "licensed custodian settlement into the distribution vault", s: "planned" },
  { area: "$AETH protocol token", detail: "governance, fee switch, buyback & burn, staker priority", s: "planned" },
  { area: "Transfer-layer compliance", detail: "whitelist / lockups enforced at token transfer time", s: "partial" },
];

/* ── Contract & API reference ── */
const MODULES = [
  { name: "installer_registry.move", fns: ["register_installer", "submit_kyc", "approve_kyc", "reject_kyc"] },
  { name: "project_listing.move", fns: ["submit_project", "approve_project", "reject_project", "set_token_params"] },
  { name: "project_token.move", fns: ["initialize_project_token", "mint_to_investor", "update_nav", "set_lifecycle", "distribute_yield", "claim_yield", "burn_from_investor"] },
  { name: "marketplace.move", fns: ["init_project_market", "place_order", "cancel_order", "fill_order", "update_fee"] },
  { name: "state.move", fns: ["create_project_vault", "sol_stake", "sol_unstake", "claim_rewards", "config"] },
];

export default function Docs() {
  const navigate = useNavigate();
  const [role, setRole] = useState<keyof typeof FLOWS>("investor");
  const [active, setActive] = useState<string>("overview");
  const contentRef = useRef<HTMLDivElement>(null);

  // Highlight the TOC entry for the section currently in view
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 }
    );
    TOC.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="docs">
      <div className="docs-bg">
        <div className="docs-orb a" />
        <div className="docs-orb b" />
      </div>

      {/* Top bar */}
      <nav className="docs-nav">
        <div className="docs-brand" onClick={() => navigate("/")}>
          <div className="docs-logo" />
          <span className="docs-brand-text"><span>Aethera</span> Docs</span>
        </div>
        <div className="docs-nav-actions">
          <button className="docs-nav-link" onClick={() => navigate("/")}>← Home</button>
          <button className="docs-nav-cta" onClick={() => navigate("/installer")}>Launch App</button>
        </div>
      </nav>

      <div className="docs-shell">
        {/* Sidebar TOC */}
        <aside className="docs-toc">
          <div className="docs-toc-title">On this page</div>
          <ul>
            {TOC.map(({ id, label }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className={active === id ? "active" : ""}
                  onClick={(e) => { e.preventDefault(); go(id); }}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </aside>

        {/* Content */}
        <div className="docs-content" ref={contentRef}>
          <header className="docs-hero">
            <span className="docs-eyebrow">TECHNICAL DOCUMENTATION</span>
            <h1>Decentralized solar financing, built on Aptos.</h1>
            <p>
              Aethera is a real-world-asset issuance and settlement system where Aptos is the
              canonical execution layer for token ownership, transfer restrictions, treasury logic
              and distribution state. The blockchain is not the product , it's the settlement rail
              that makes solar cash flows programmable and auditable.
            </p>
          </header>

          {/* Overview */}
          <section id="overview" className="docs-section">
            <h2>Overview</h2>
            <p className="lead">
              Aethera turns operating solar projects into compliant, yield-bearing tokens. Installers
              raise capital against real generation, investors earn distributions backed by measurable
              solar output, and every state change on-chain maps to a real-world event.
            </p>
            <div className="docs-grid cols-3">
              <div className="docs-tile">
                <span className="tile-num">☀</span>
                <h4>For Installers</h4>
                <p>Register, pass KYC, list a solar project, and get funded by a global investor pool.</p>
              </div>
              <div className="docs-tile">
                <span className="tile-num">📈</span>
                <h4>For Investors</h4>
                <p>Discover vetted projects, stake into tokenized assets, and earn transparent yield.</p>
              </div>
              <div className="docs-tile">
                <span className="tile-num">🛡</span>
                <h4>For Admins</h4>
                <p>Approve KYC & projects, mint tokens, push NAV, and distribute energy revenue.</p>
              </div>
            </div>
            <div className="docs-callout">
              <span className="callout-icon"></span>
              <p><strong>Positioning:</strong> a solar project-finance rail and compliance-first RWA
                issuance system — <em>not</em> a crypto speculation vehicle, meme token, or generic DeFi yield farm.</p>
            </div>
          </section>

          {/* Design Principles */}
          <section id="principles" className="docs-section">
            <h2>Design Principles</h2>
            <p className="lead">Non-negotiable engineering constraints that every design decision must satisfy.</p>
            <div className="docs-grid cols-2">
              {PRINCIPLES.map((p, i) => (
                <div className="docs-tile" key={i}>
                  <span className="tile-num">{i + 1}</span>
                  <h4>{p.t}</h4>
                  <p>{p.d}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Architecture */}
          <section id="architecture" className="docs-section">
            <h2>System Architecture</h2>
            <p className="lead">The system is described in five layers. Aptos is the settlement &amp; ownership
              layer; everything around it forms the regulated financial stack.</p>
            <div className="docs-layers">
              {LAYERS.map((l, i) => (
                <div className="docs-layer" key={i}>
                  <div>
                    <div className="layer-name">{l.name}</div>
                    <div className="layer-tag">{l.tag}</div>
                  </div>
                  <div className="layer-desc">{l.desc}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Token Model */}
          <section id="tokens" className="docs-section">
            <h2>Token Model</h2>
            <p className="lead">A two-layer token model separates <strong>asset ownership</strong> from
              <strong> platform governance</strong> — conflating them is the #1 design failure in RWA protocols.</p>

            <div className="docs-grid cols-2">
              <div className="docs-card">
                <h3>$AETH-E — Energy Yield Token <Badge s="live" /></h3>
                <p>The core product token. Each solar project issues its own per-project variant
                  (e.g. <span className="docs-inline-code">AETH-PUNE-01</span>).</p>
                <ul>
                  <li><strong>Not speculative</strong> — value pegged to the NPV of remaining PPA cash flows.</li>
                  <li><strong>Yield-bearing</strong> — holders receive distributions proportional to energy revenue.</li>
                  <li><strong>Non-transferable during lock-in</strong> — reflects project stabilization period.</li>
                  <li><strong>Redeemable at NAV</strong> — after lock-in, at discounted cash-flow value.</li>
                </ul>
              </div>
              <div className="docs-card">
                <h3>$AETH — Protocol Governance Token <Badge s="planned" /></h3>
                <p>The protocol-layer token, entirely separate from project yield. It does not accrue
                  project cash flow directly — this separation is the legal firewall.</p>
                <ul>
                  <li><strong>Fee switch</strong> — a share of protocol revenue flows to an on-chain treasury.</li>
                  <li><strong>Governance</strong> — whitelist projects, set fees, manage treasury allocation.</li>
                  <li><strong>Staking priority</strong> — stakers get priority allocation in oversubscribed launches.</li>
                  <li><strong>Buyback &amp; burn</strong> — protocol fees buy and burn $AETH quarterly.</li>
                </ul>
              </div>
            </div>

            <div className="docs-card">
              <h3>Pricing formula (per-project NAV)</h3>
              <div className="docs-code">{`P_token = (1 / N_tokens) × Σ [ R_t / (1 + d)^t ]   for t = 1..T

  R_t  = projected monthly revenue from energy sales
  d    = risk-adjusted discount rate
  T    = remaining PPA tenure
  N    = total tokens issued for that project`}</div>
              <p>Value accrual comes from actual project yield, controlled NAV appreciation, and redemption
                value tied to the asset lifecycle — the token tracks cash flow, not hype.</p>
            </div>
          </section>

          {/* Workflows */}
          <section id="workflows" className="docs-section">
            <h2>Workflows</h2>
            <p className="lead">Three role-based flows, each mapped to the on-chain entry functions and
              API calls that power it in this build.</p>

            <div className="docs-tabs">
              {(Object.keys(FLOWS) as (keyof typeof FLOWS)[]).map((k) => (
                <button
                  key={k}
                  className={`docs-tab ${role === k ? "active" : ""}`}
                  onClick={() => setRole(k)}
                >
                  {FLOWS[k].role}
                </button>
              ))}
            </div>

            <div className="docs-flow">
              {FLOWS[role].steps.map((s, i) => (
                <div className="docs-step" key={i}>
                  <div className="step-rail">
                    <div className="step-bubble">{i + 1}</div>
                    <div className="step-line" />
                  </div>
                  <div className="step-body">
                    <h4>{s.t} <Badge s={s.status} /></h4>
                    <p>{s.d}</p>
                    {s.fn && <div style={{ marginTop: 8 }}><code>{s.fn}</code></div>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Yield Flow */}
          <section id="yield" className="docs-section">
            <h2>Yield Flow</h2>
            <p className="lead">The engine of the entire system — the lifecycle of yield from photon to wallet.</p>
            <div className="docs-code">{`Solar farm  →  generates kWh
    ↓
DISCOM / offtaker pays under PPA
    ↓
Revenue lands in SPV bank account (fiat)
    ↓
Fiat  →  on-ramped to USDC via licensed custodian
    ↓
Distribution Vault (smart contract) receives USDC
    ↓
Protocol fee (2–3%)      →  Aethera Treasury
Governance fee (0.5%)    →  $AETH staker pool
    ↓
Remaining ~97% distributed pro-rata  →  $AETH-E holders
    ↓
Holders claim USDC / rewards to their wallet`}</div>
            <div className="docs-callout">
              <span className="callout-icon">⚙</span>
              <p>In the current build, distributions and claims run through
                <span className="docs-inline-code">distribute_yield</span> /
                <span className="docs-inline-code">claim_yield</span>. The fiat→USDC custodian on-ramp is the planned production settlement path.</p>
            </div>
          </section>

          {/* Treasury */}
          <section id="treasury" className="docs-section">
            <h2>Treasury Structure</h2>
            <p className="lead">Two separate treasuries with distinct mandates — never one blended pool.</p>
            <div className="docs-grid cols-2">
              <div className="docs-card">
                <h3>Protocol Treasury</h3>
                <p>Funded by platform fees (2–3% of energy distributions). Allocation mandate:</p>
                <ul>
                  <li><strong>40%</strong> — liquidity reserve, backstop for delayed DISCOM payments</li>
                  <li><strong>30%</strong> — new project pipeline funding (SPV formation, legal, IoT)</li>
                  <li><strong>20%</strong> — $AETH buyback &amp; burn, executed quarterly on-chain</li>
                  <li><strong>10%</strong> — insurance fund, first-loss capital for underperformers</li>
                </ul>
              </div>
              <div className="docs-card">
                <h3>Project Reserve (per-SPV)</h3>
                <p>Each SPV retains a <strong>3-month operating-expense reserve</strong> at all times.
                  Token holders cannot claim it.</p>
                <ul>
                  <li>Absorbs payment delays and O&amp;M shortfalls</li>
                  <li>Protects against inverter failure &amp; grid curtailment</li>
                  <li>Standard project-finance practice, critical for future credit ratings</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Compliance */}
          <section id="compliance" className="docs-section">
            <h2>Compliance Model</h2>
            <p className="lead">Compliance is part of the protocol design, not a back-office function.
              It is stateful and enforceable at transfer time.</p>
            <div className="docs-card">
              <ul>
                <li><strong>Wallet whitelisting</strong> — only approved addresses can hold the asset</li>
                <li><strong>KYC &amp; AML checks</strong> — enforced before onboarding and transfer</li>
                <li><strong>Sanctions &amp; jurisdiction restrictions</strong> — geography-aware transfer gating</li>
                <li><strong>Investor category restrictions</strong> — accredited / institutional gating</li>
                <li><strong>Transfer lockups</strong> — non-transferable during the project lock-in period</li>
                <li><strong>Redemption eligibility</strong> — NAV redemption gated to eligible holders</li>
              </ul>
            </div>
            <div className="docs-callout">
              <span className="callout-icon">🔒</span>
              <p>If a wallet is not allowed to hold the asset, the system <strong>prevents the transfer</strong>
                rather than trying to fix it later.</p>
            </div>
          </section>

          {/* Liquidity */}
          <section id="liquidity" className="docs-section">
            <h2>Liquidity Phases</h2>
            <p className="lead">Liquidity is controlled, not hyped. Too much liquidity too early creates
              speculative noise; controlled liquidity creates credibility.</p>
            <div className="docs-grid cols-2">
              {[
                { p: "Phase 1", d: "Primary issuance only." },
                { p: "Phase 2", d: "Restricted OTC transfers among approved participants." },
                { p: "Phase 3", d: "Compliant secondary market / internal matching (on-chain order book)." },
                { p: "Phase 4", d: "Broader institutional liquidity — only if regulation and market depth support it." },
              ].map((x, i) => (
                <div className="docs-tile" key={i}>
                  <span className="tile-num">{i + 1}</span>
                  <h4>{x.p}</h4>
                  <p>{x.d}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Risk */}
          <section id="risk" className="docs-section">
            <h2>Risk Controls</h2>
            <p className="lead">The philosophy is simple: never let one failure mode cascade into investor
              loss or broken settlement.</p>
            <div className="docs-grid cols-2">
              {[
                ["Payment delay risk", "Reserve buffers absorb late DISCOM payments."],
                ["Operational risk", "Project-level diversification and insurance."],
                ["Oracle risk", "Multi-source verification; distribution pauses on failure."],
                ["Compliance risk", "Strict transfer gating at the token layer."],
                ["Custody risk", "Institutional-grade key management & multisig."],
                ["Governance risk", "Limited permissions and upgrade timelocks."],
                ["Smart-contract risk", "Conservative module design and external audits."],
              ].map(([t, d], i) => (
                <div className="docs-card" key={i}>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Status */}
          <section id="status" className="docs-section">
            <h2>Implementation Status</h2>
            <p className="lead">What is live in this build today versus what is on the roadmap.</p>
            <table className="docs-table">
              <thead>
                <tr><th>Area</th><th>Detail</th><th>Status</th></tr>
              </thead>
              <tbody>
                {STATUS_ROWS.map((r, i) => (
                  <tr key={i}>
                    <td>{r.area}</td>
                    <td>{r.detail}</td>
                    <td><Badge s={r.s} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="docs-grid cols-3" style={{ marginTop: 16 }}>
              <div className="docs-tile"><h4>Chain</h4><p>Aptos (Move) — devnet/testnet. Modules under <span className="docs-inline-code">aethera_staking</span>.</p></div>
              <div className="docs-tile"><h4>Backend</h4><p>Node + Express service orchestrating chain calls and trackers.</p></div>
              <div className="docs-tile"><h4>Frontend</h4><p>React + Vite + React Router, Aptos wallet adapter (Petra).</p></div>
            </div>
          </section>

          {/* Reference */}
          <section id="reference" className="docs-section">
            <h2>Contracts &amp; API</h2>
            <p className="lead">On-chain Move modules and their public entry functions in this build.</p>
            <div className="docs-card">
              {MODULES.map((m, i) => (
                <div className="ref-mod" key={i}>
                  <div className="ref-name">{m.name}</div>
                  <div className="ref-fns">
                    {m.fns.map((f) => <span className="fn" key={f}>{f}</span>)}
                  </div>
                </div>
              ))}
            </div>
            <div className="docs-callout">
              <span className="callout-icon">🔌</span>
              <p>The REST layer mirrors these on <span className="docs-inline-code">/api</span> — e.g.
                <span className="docs-inline-code">GET /projects/location/:id</span>,
                <span className="docs-inline-code">GET /token/:projectId/nav</span>,
                <span className="docs-inline-code">POST /admin/distribute-yield</span>.</p>
            </div>
          </section>
        </div>
      </div>

      <footer className="docs-footer">
        © 2026 Aethera · Solar project-finance rail on Aptos · Built for compliance-first RWA issuance.
      </footer>
    </div>
  );
}
