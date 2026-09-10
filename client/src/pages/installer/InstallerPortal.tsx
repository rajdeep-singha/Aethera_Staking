import { useState, useEffect } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import type { InputTransactionData } from "@aptos-labs/wallet-adapter-react";
import { useNavigate } from "react-router-dom";
import { getInstaller, getBalance, type InstallerInfo } from "../../services/api";
import "./InstallerPortal.css";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

const REGISTRY_AUTHORITY = import.meta.env.VITE_REGISTRY_AUTHORITY || CONTRACT_ADDRESS;
const PROJECT_AUTHORITY  = import.meta.env.VITE_PROJECT_AUTHORITY  || CONTRACT_ADDRESS;

// Oracle locations pulled from your existing solar oracle
const ORACLE_LOCATIONS = [
  { id: 1, name: "San Francisco, CA" },
  { id: 2, name: "New York City, NY" },
  { id: 3, name: "Phoenix, AZ" },
];

const STEPS = ["Connect Wallet", "Register", "KYC", "Submit Project", "Status"];

export default function InstallerPortal() {
  const { connect, disconnect, account, connected, wallets, signAndSubmitTransaction } = useWallet();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installerInfo, setInstallerInfo] = useState<InstallerInfo | null>(null);
  const [balance, setBalance] = useState("0");

  // Register form
  const [name, setName] = useState("");
  const [businessReg, setBusinessReg] = useState("");

  // KYC form
  const [docsHash, setDocsHash] = useState("");
  const [locationId, setLocationId] = useState(1);

  // Project form
  const [projectName, setProjectName]       = useState("");
  const [capacityKw, setCapacityKw]         = useState("");
  const [costApt, setCostApt]               = useState("");
  const [description, setDescription]       = useState("");
  const [projectDocsHash, setProjectDocsHash] = useState("");
  const [yieldBps, setYieldBps]             = useState("800");

  const walletAddress = account?.address?.toString() || null;
  const petra = wallets?.find((w) => w.name.toLowerCase().includes("petra"));

  // Auto-advance step when wallet connects - ALWAYS fetch fresh data
  useEffect(() => {
    if (connected && walletAddress) {
      console.log(`[useEffect] Wallet connected: ${walletAddress}`);
      // Clear any stale cached data and fetch fresh
      localStorage.removeItem('installerPortalData');
      fetchInstallerData();
    }
  }, [connected, walletAddress]);

  const fetchInstallerData = async () => {
    if (!walletAddress) return;
    try {
      console.log(`[fetchInstallerData] Fetching for wallet: ${walletAddress}`);
      const [balRes, infoRes] = await Promise.all([
        getBalance(walletAddress),
        getInstaller(walletAddress),
      ]);
      
      if (balRes.success && balRes.data) {
        setBalance(balRes.data.balance_apt);
      }
      
      if (infoRes.success && infoRes.data) {
        console.log(`[fetchInstallerData] Got installer info:`, infoRes.data);
        setInstallerInfo(infoRes.data);
        
        // Store data in localStorage for persistence across refreshes
        const dataToStore = {
          installerInfo: infoRes.data,
          balance: balRes.data?.balance_apt || "0",
          timestamp: Date.now(),
        };
        localStorage.setItem('installerPortalData', JSON.stringify(dataToStore));
        console.log('[fetchInstallerData] Saved to localStorage');
        
        // Simplified logic: If KYC is approved, ALWAYS go to Submit Project (allow multiple projects)
        const info = infoRes.data;
        
        if (info.kyc_status === 2) {
          // KYC approved - go to Submit Project step (allows multiple projects)
          console.log(`[fetchInstallerData] → Step 3 (KYC approved - can submit project)`);
          setStep(3);
        } else if (info.kyc_status === 1) {
          // KYC submitted but not yet approved - wait
          console.log(`[fetchInstallerData] → Step 4 (KYC submitted - awaiting approval)`);
          setStep(4);
        } else if (info.kyc_status === 3) {
          // KYC rejected
          console.log(`[fetchInstallerData] → Step 4 (KYC rejected)`);
          setStep(4);
        } else if (info.kyc_status === 0 && info.name) {
          // Registered but no KYC submitted yet
          console.log(`[fetchInstallerData] → Step 2 (Submit KYC)`);
          setStep(2);
        } else {
          // Not registered
          console.log(`[fetchInstallerData] → Step 1 (Register)`);
          setStep(1);
        }
      } else {
        console.log(`[fetchInstallerData] Not registered - Step 1 (Register)`);
        setStep(1); // not registered yet
      }
    } catch (e) {
      console.error(`[fetchInstallerData] Error:`, e);
      setStep(1); // Default to register on error
    }
  };

  const handleConnect = async () => {
    const w = petra || wallets?.[0];
    if (!w) { window.open("https://petra.app/", "_blank"); return; }
    setLoading(true);
    try { await connect(w.name); } finally { setLoading(false); }
  };

  // Step 1 — Register
  const handleRegister = async () => {
    if (!name || !businessReg) { setError("Name and business reg are required"); return; }
    
    setLoading(true);
    setError(null);
    setTxHash(null);
    
    try {
      // First, check if already registered using backend
      console.log('[Register] Checking if wallet is already registered...');
      const checkResponse = await fetch(`http://localhost:3000/api/installer/${walletAddress}?_t=${Date.now()}`);
      const checkResult = await checkResponse.json();
      
      console.log('[Register] Backend check result:', checkResult);
      
      // If already registered, just navigate based on KYC status
      if (checkResult.success && checkResult.installer) {
        console.log('[Register] ✅ Already registered! Using KYC status to navigate...');
        setInstallerInfo(checkResult.installer);
        
        const nextStep = checkResult.next_step;
        if (nextStep === 'submit_project') {
          console.log('[Register] → KYC approved, going to project submission');
          setStep(3);
        } else if (nextStep === 'await_approval') {
          console.log('[Register] → KYC submitted, waiting for approval');
          setStep(4);
        } else if (nextStep === 'submit_kyc') {
          console.log('[Register] → Need to submit KYC');
          setStep(2);
        }
        return;
      }
      
      // Not registered, proceed with on-chain registration
      console.log('[Register] Not registered, submitting on-chain transaction...');
      
      const tx: InputTransactionData = {
        data: { 
          function: `${CONTRACT_ADDRESS}::installer_registry::register_installer` as any, 
          functionArguments: [REGISTRY_AUTHORITY, name, businessReg] 
        },
      };
      const res = await signAndSubmitTransaction(tx);
      setTxHash(res.hash);
      console.log('[Register] ✅ On-chain registration succeeded! TX:', res.hash);
      
      // Notify backend about the successful registration (for tracker)
      try {
        const notifyRes = await fetch('http://localhost:3000/api/installer/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress, name, businessReg }),
        });
        const notifyResult = await notifyRes.json();
        console.log('[Register] Backend notification result:', notifyResult);
      } catch (notifyError) {
        console.warn('[Register] Failed to notify backend (non-critical):', notifyError);
      }
      
      // Wait a bit for chain to settle
      await new Promise((r) => setTimeout(r, 3000));
      
      // Now fetch the installer data to get status and navigate
      console.log('[Register] Fetching installer status after registration...');
      const statusResponse = await fetch(`http://localhost:3000/api/installer/${walletAddress}?_t=${Date.now()}`);
      const statusResult = await statusResponse.json();
      
      console.log('[Register] Status check result:', statusResult);
      
      if (statusResult.success && statusResult.installer) {
        setInstallerInfo(statusResult.installer);
        
        // Save to localStorage
        const dataToStore = {
          installerInfo: statusResult.installer,
          balance: balance,
          timestamp: Date.now(),
        };
        localStorage.setItem('installerPortalData', JSON.stringify(dataToStore));
        console.log('[Register] Saved to localStorage:', dataToStore);
        
        const nextStep = statusResult.next_step;
        
        console.log('[Register] ✅ Registration complete! Navigating to next_step:', nextStep);
        if (nextStep === 'submit_kyc') {
          console.log('[Register] → Setting step to 2 (KYC)');
          setStep(2); // ← THIS IS THE KEY LINE - NAVIGATE TO KYC
        } else if (nextStep === 'submit_project') {
          console.log('[Register] → Setting step to 3 (Submit Project)');
          setStep(3);
        } else if (nextStep === 'await_approval') {
          console.log('[Register] → Setting step to 4 (Await Approval)');
          setStep(4);
        } else {
          console.log('[Register] → Unknown status, defaulting to step 2 (KYC)');
          setStep(2); // Default to KYC
        }
      } else {
        // If can't fetch status, default to KYC step and show the green "Proceed" button
        console.log('[Register] Could not fetch status immediately, but showing KYC button');
        // Don't change step - let user click "Proceed to KYC" button
        // But update installerInfo so button appears
        setInstallerInfo({ wallet_address: walletAddress } as any);
        setStep(2); // Or just navigate directly
      }
      
    } catch (e: any) {
      console.error('[Register] Error:', e);
      const errorMsg = e.message || JSON.stringify(e) || '';
      
      // Check if the error is E_ALREADY_REGISTERED - means user is already registered on-chain
      if (errorMsg.includes('E_ALREADY_REGISTERED') || errorMsg.includes('abort 0x2')) {
        console.log('[Register] 🔄 User is already registered on-chain! Skipping to KYC...');
        
        // Notify backend that this wallet is registered (for tracker persistence)
        try {
          await fetch('http://localhost:3000/api/installer/mark-registered', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress }),
          });
        } catch (notifyError) {
          console.warn('[Register] Failed to notify backend (non-critical):', notifyError);
        }
        
        // Create a minimal installer info for the UI
        setInstallerInfo({ 
          wallet_address: walletAddress!, 
          name: name || 'Registered User',
          kyc_status: 0, // Will be updated when they submit KYC
          kyc_status_label: 'Pending',
        } as any);
        
        // Store in localStorage
        localStorage.setItem('installerPortalData', JSON.stringify({
          installerInfo: { wallet_address: walletAddress, name: name || 'Registered User', kyc_status: 0, kyc_status_label: 'Pending' },
          balance,
          timestamp: Date.now(),
        }));
        
        // Skip directly to KYC step
        setError(null);
        setStep(2);
        return;
      }
      
      setError(e.message || 'Failed to register');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 — Submit KYC
  const handleSubmitKyc = async () => {
    if (!docsHash) { setError("IPFS documents hash is required"); return; }
    
    setLoading(true);
    setError(null);
    setTxHash(null);
    
    try {
      // First, check if KYC was already submitted
      console.log('[KYC] Checking if KYC already submitted...');
      const checkResponse = await fetch(`http://localhost:3000/api/installer/${walletAddress}?_t=${Date.now()}`);
      const checkResult = await checkResponse.json();
      
      console.log('[KYC] Backend check result:', checkResult);
      
      // If KYC already submitted, just navigate based on status
      if (checkResult.success && checkResult.installer) {
        const installer = checkResult.installer;
        if (installer.kyc_status >= 1) {
          console.log('[KYC] ✅ KYC already submitted! Using status to navigate...');
          setInstallerInfo(installer);
          
          const nextStep = checkResult.next_step;
          if (nextStep === 'submit_project') {
            console.log('[KYC] → KYC approved, going to project submission');
            setStep(3);
          } else if (nextStep === 'await_approval') {
            console.log('[KYC] → KYC submitted, waiting for approval');
            setStep(4);
          } else {
            console.log('[KYC] → Unknown status, awaiting approval');
            setStep(4);
          }
          return;
        }
      }
      
      // Not submitted yet, proceed with on-chain KYC submission
      console.log('[KYC] KYC not submitted yet, submitting on-chain...');
      
      const tx: InputTransactionData = {
        data: {
          function: `${CONTRACT_ADDRESS}::installer_registry::submit_kyc` as any,
          functionArguments: [REGISTRY_AUTHORITY, docsHash, locationId],
        },
      };
      const res = await signAndSubmitTransaction(tx);
      setTxHash(res.hash);
      console.log('[KYC] ✅ On-chain KYC submission succeeded! TX:', res.hash);
      
      // Notify backend about the successful KYC submission (for tracker)
      try {
        const notifyRes = await fetch('http://localhost:3000/api/installer/submit-kyc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress, docsHash, locationId }),
        });
        const notifyResult = await notifyRes.json();
        console.log('[KYC] Backend notification result:', notifyResult);
      } catch (notifyError) {
        console.warn('[KYC] Failed to notify backend (non-critical):', notifyError);
      }
      
      // Wait for chain to settle
      await new Promise((r) => setTimeout(r, 3000));
      
      // Fetch status after submission
      console.log('[KYC] Fetching KYC status after submission...');
      const statusResponse = await fetch(`http://localhost:3000/api/installer/${walletAddress}?_t=${Date.now()}`);
      const statusResult = await statusResponse.json();
      
      console.log('[KYC] Status check result:', statusResult);
      
      if (statusResult.success && statusResult.installer) {
        setInstallerInfo(statusResult.installer);
        
        // Save to localStorage
        const dataToStore = {
          installerInfo: statusResult.installer,
          balance: balance,
          timestamp: Date.now(),
        };
        localStorage.setItem('installerPortalData', JSON.stringify(dataToStore));
        console.log('[KYC] Saved to localStorage:', dataToStore);
        
        const nextStep = statusResult.next_step;
        
        console.log('[KYC] ✅ KYC submission complete! Navigating to next_step:', nextStep);
        if (nextStep === 'await_approval') {
          console.log('[KYC] → Setting step to 4 (Awaiting Approval)');
          setStep(4); // ← NAVIGATE TO AWAIT APPROVAL
        } else if (nextStep === 'submit_project') {
          console.log('[KYC] → Setting step to 3 (Submit Project)');
          setStep(3);
        } else {
          console.log('[KYC] → Unknown status, defaulting to step 4 (Awaiting Approval)');
          setStep(4); // Default to awaiting approval
        }
      } else {
        console.log('[KYC] Could not fetch status immediately, defaulting to step 4');
        setStep(4);
      }
    } catch (e: any) {
      console.error('[KYC] Error:', e);
      setError(e.message || 'Failed to submit KYC');
    } finally {
      setLoading(false);
    }
  };

  // Step 3 — Submit Project
  const handleSubmitProject = async (e?: React.FormEvent) => {
    // Prevent any form auto-submission
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!projectName || !capacityKw || !costApt || !description) {
      setError("All project fields are required");
      return;
    }
    
    setLoading(true);
    setError(null);
    setTxHash(null);
    
    // Helper function to submit project to backend only
    const submitToBackendOnly = async () => {
      console.log('[Project] Submitting project to backend (off-chain mode)...');
      const costOctasNum = Math.floor(Number(costApt) * 100_000_000);
      const submitRes = await fetch('http://localhost:3000/api/project/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          name: projectName,
          location_id: locationId,
          capacity_kw: Number(capacityKw),
          cost_apt: costOctasNum.toString(),
          description,
          documents_hash: projectDocsHash || "ipfs://",
          expected_yield_bps: Number(yieldBps),
        }),
      });
      const submitResult = await submitRes.json();
      console.log('[Project] Backend submission result:', submitResult);
      
      if (!submitResult.success) {
        throw new Error(submitResult.error || 'Failed to submit project to backend');
      }
      
      return submitResult;
    };
    
    // Helper to check if on-chain contracts are available
    const checkOnChainAvailable = async (): Promise<boolean> => {
      try {
        // Try to fetch installer registry to see if contracts are deployed
        const response = await fetch(`http://localhost:3000/api/installer/${walletAddress}/on-chain-status`);
        const result = await response.json();
        return result.on_chain_available === true;
      } catch {
        return false;
      }
    };
    
    try {
      // Log: This wallet is submitting a new project (multiple projects allowed)
      console.log('[Project] Submitting NEW project for wallet:', walletAddress);
      console.log('[Project] Project details:', { projectName, capacityKw, costApt, locationId });
      
      // Check if on-chain contracts are available before attempting on-chain submission
      // This prevents the wallet popup from showing an error
      console.log('[Project] Checking if on-chain contracts are available...');
      const onChainAvailable = await checkOnChainAvailable();
      
      if (!onChainAvailable) {
        // On-chain contracts not deployed - use backend-only mode directly
        console.log('[Project] ⚠️ On-chain contracts not available, using backend-only mode...');
        await submitToBackendOnly();
        console.log('[Project] ✅ Backend-only submission succeeded!');
      } else {
        // On-chain contracts available - try on-chain submission
        try {
          console.log('[Project] Attempting on-chain submission...');
          const costOctas = Math.floor(Number(costApt) * 100_000_000).toString();
          const tx: InputTransactionData = {
            data: {
              function: `${CONTRACT_ADDRESS}::project_listing::submit_project` as any,
              functionArguments: [
                PROJECT_AUTHORITY,
                projectName,
                locationId,
                Number(capacityKw),
                costOctas,
                description,
                projectDocsHash || "ipfs://",
                Number(yieldBps),
              ],
            },
          };
          const res = await signAndSubmitTransaction(tx);
          setTxHash(res.hash);
          console.log('[Project] ✅ On-chain project submission succeeded! TX:', res.hash);
          
          // Also notify backend about the successful project submission
          try {
            await submitToBackendOnly();
          } catch (notifyError) {
            console.warn('[Project] Failed to notify backend (non-critical):', notifyError);
          }
        } catch (onChainError: any) {
          const errorMsg = onChainError.message || JSON.stringify(onChainError) || '';
          console.warn('[Project] On-chain submission failed:', errorMsg);
          
          // Fall back to backend-only mode
          console.log('[Project] 🔄 Falling back to backend-only mode...');
          await submitToBackendOnly();
          console.log('[Project] ✅ Backend-only submission succeeded!');
        }
      }
      
      // Wait a moment for data to settle
      await new Promise((r) => setTimeout(r, 1000));
      
      // Fetch status after submission
      console.log('[Project] Fetching project status after submission...');
      const statusResponse = await fetch(`http://localhost:3000/api/installer/${walletAddress}?_t=${Date.now()}`);
      const statusResult = await statusResponse.json();
      
      console.log('[Project] Status check result:', statusResult);
      
      if (statusResult.success && (statusResult.data || statusResult.installer)) {
        const info = statusResult.data || statusResult.installer;
        setInstallerInfo(info);
      }
      
      // Clear form fields for next project
      setProjectName("");
      setCapacityKw("");
      setCostApt("");
      setDescription("");
      setProjectDocsHash("");
      setYieldBps("800");
      
      console.log('[Project] ✅ Project submission complete! Moving to status page...');
      setStep(4);
    } catch (e: any) {
      console.error('[Project] Error:', e);
      setError(e.message || 'Failed to submit project');
    } finally {
      setLoading(false);
    }
  };

  const kycStatusColor = (s: number) =>
    s === 2 ? "#16a34a" : s === 3 ? "#dc2626" : s === 1 ? "#d97706" : "#64748b";

  return (
    <div className="installer-portal">
      <div className="portal-bg">
        <div className="portal-orb orb-1" />
        <div className="portal-orb orb-2" />
      </div>

      <div className="portal-container">
        {/* Header */}
        <div className="portal-header">
          <button className="back-btn" onClick={() => navigate("/")}>← Back</button>
          <h1>Solar Installer Portal</h1>
          {connected && walletAddress && (
            <div className="wallet-chip">
              <span className="chip-balance">{Number(balance).toFixed(2)} APT</span>
              <span className="chip-addr">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
              <button onClick={() => { 
                disconnect(); 
                setStep(0); 
                setInstallerInfo(null);
                localStorage.removeItem('installerPortalData');
                console.log('[Disconnect] Cleared installer data and localStorage');
              }}>✕</button>
            </div>
          )}
        </div>

        {/* Progress Steps */}
        <div className="step-progress">
          {STEPS.map((s, i) => (
            <div key={i} className={`step-item ${i <= step ? "done" : ""} ${i === step ? "active" : ""}`}>
              <div className="step-dot">{i < step ? "✓" : i + 1}</div>
              <span className="step-label">{s}</span>
              {i < STEPS.length - 1 && <div className="step-line" />}
            </div>
          ))}
        </div>

        {/* Error / TX feedback */}
        {error && <div className="feedback error">⚠️ {error}</div>}
        {txHash && (
          <div className="feedback success">
            ✅ Transaction submitted!{" "}
            <a href={`https://explorer.aptoslabs.com/txn/${txHash}?network=testnet`} target="_blank" rel="noreferrer">
              View on Explorer ↗
            </a>
          </div>
        )}

        {/* ── STEP 0: Connect Wallet ── */}
        {step === 0 && (
          <div className="portal-card">
            <div className="card-icon-lg">💼</div>
            <h2>Connect Your Wallet</h2>
            <p>Connect your Petra wallet to start the installer onboarding process.</p>
            <button className="primary-btn" onClick={handleConnect} disabled={loading}>
              {loading ? "Connecting..." : "🔗 Connect Petra Wallet"}
            </button>
          </div>
        )}

        {/* ── STEP 1: Register ── */}
        {step === 1 && (
          <div className="portal-card">
            <h2>Register as Installer</h2>
            <p className="card-sub">Provide your basic business information to get started.</p>
            <div className="form-group">
              <label>Full Name / Business Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SunPower Installers Inc." />
            </div>
            <div className="form-group">
              <label>Business Registration Number</label>
              <input value={businessReg} onChange={(e) => setBusinessReg(e.target.value)} placeholder="e.g. REG-2024-001" />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
              <button className="primary-btn" onClick={handleRegister} disabled={loading} style={{ flex: 1 }}>
                {loading ? "Submitting..." : "Register on Chain →"}
              </button>
              {installerInfo && (
                <button 
                  className="primary-btn" 
                  onClick={() => setStep(2)} 
                  style={{ flex: 1, background: '#10b981' }}
                  title="Already registered? Click to proceed to KYC"
                >
                  Proceed to KYC →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 2: Submit KYC ── */}
        {step === 2 && (
          <div className="portal-card">
            <h2>Submit KYC Documents</h2>
            <p className="card-sub">Upload your documents to IPFS and paste the hash below. Also select your operating region.</p>
            <div className="form-group">
              <label>IPFS Documents Hash</label>
              <input value={docsHash} onChange={(e) => setDocsHash(e.target.value)} placeholder="ipfs://Qm..." />
              <span className="hint">Upload to <a href="https://web3.storage" target="_blank" rel="noreferrer">web3.storage</a> or Pinata, paste CID here</span>
            </div>
            <div className="form-group">
              <label>Select Your Region (Oracle Location)</label>
              <select value={locationId} onChange={(e) => setLocationId(Number(e.target.value))}>
                {ORACLE_LOCATIONS.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
              <button className="primary-btn" onClick={handleSubmitKyc} disabled={loading} style={{ flex: 1 }}>
                {loading ? "Submitting..." : "Submit KYC →"}
              </button>
              {installerInfo && installerInfo.kyc_status >= 1 && (
                <button 
                  className="primary-btn" 
                  onClick={() => {
                    if (installerInfo.kyc_status === 2) {
                      setStep(3); // KYC approved → Submit Project
                    } else {
                      setStep(4); // KYC submitted → Awaiting Approval
                    }
                  }} 
                  style={{ flex: 1, background: '#10b981' }}
                  title={installerInfo.kyc_status === 2 ? "KYC Approved - Go to Projects" : "KYC Submitted - Awaiting Approval"}
                >
                  {installerInfo.kyc_status === 2 ? "Go to Projects →" : "Awaiting Approval →"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 3: Submit Project (only after KYC approved) ── */}
        {step === 3 && (
          <div className="portal-card">
            <div className="kyc-approved-badge">✅ KYC Approved</div>
            <h2>List Your Solar Project</h2>
            <p className="card-sub">Submit your project details for admin review. Once approved, investors can fund it.</p>
            {installerInfo && installerInfo.project_id > 0 && (
              <div className="info-banner">
                ℹ️ You have previously submitted projects. You can submit additional projects below.
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); handleSubmitProject(e); }}>
              <div className="form-row">
                <div className="form-group">
                  <label>Project Name</label>
                  <input 
                    value={projectName} 
                    onChange={(e) => setProjectName(e.target.value)} 
                    placeholder="e.g. Phoenix Solar Farm #1"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Capacity (kW)</label>
                  <input 
                    type="number" 
                    value={capacityKw} 
                    onChange={(e) => setCapacityKw(e.target.value)} 
                    placeholder="e.g. 500"
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Funding Goal (APT)</label>
                  <input 
                    type="number" 
                    value={costApt} 
                    onChange={(e) => setCostApt(e.target.value)} 
                    placeholder="e.g. 1000"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Expected Yield (basis points, 800 = 8%)</label>
                  <input 
                    type="number" 
                    value={yieldBps} 
                    onChange={(e) => setYieldBps(e.target.value)} 
                    placeholder="800"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  placeholder="Describe your project, location, timeline..." 
                  rows={4}
                  required
                />
              </div>
              <div className="form-group">
                <label>Project Documents IPFS Hash (optional)</label>
                <input 
                  value={projectDocsHash} 
                  onChange={(e) => setProjectDocsHash(e.target.value)} 
                  placeholder="ipfs://..."
                />
              </div>
              <div className="form-group">
                <label>Operating Region</label>
                <select value={locationId} onChange={(e) => setLocationId(Number(e.target.value))}>
                  {ORACLE_LOCATIONS.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <button 
                type="submit" 
                className="primary-btn" 
                disabled={loading || !projectName || !capacityKw || !costApt || !description}
              >
                {loading ? "Submitting..." : "Submit Project →"}
              </button>
            </form>
          </div>
        )}

        {/* ── STEP 4: Status Dashboard ── */}
        {step === 4 && installerInfo && (
          <div className="portal-card status-card">
            <h2>Your Status Dashboard</h2>
            <div className="status-grid">
              <div className="status-item">
                <span className="status-label">Wallet</span>
                <span className="status-value mono">{walletAddress?.slice(0, 10)}...{walletAddress?.slice(-6)}</span>
              </div>
              <div className="status-item">
                <span className="status-label">Name</span>
                <span className="status-value">{installerInfo.name}</span>
              </div>
              <div className="status-item">
                <span className="status-label">KYC Status</span>
                <span className="status-value" style={{ color: kycStatusColor(installerInfo.kyc_status), fontWeight: 700 }}>
                  {installerInfo.kyc_status_label}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Region</span>
                <span className="status-value">{ORACLE_LOCATIONS.find(l => l.id === installerInfo.location_id)?.name || `Location #${installerInfo.location_id}`}</span>
              </div>
              <div className="status-item">
                <span className="status-label">Latest Project</span>
                <span className="status-value">{installerInfo.project_id > 0 ? `#${installerInfo.project_id}` : "Not submitted yet"}</span>
              </div>
            </div>

            {/* Actions based on KYC status */}
            {installerInfo.kyc_status === 0 && (
              <div className="status-action pending">⏳ Registration submitted. Please submit KYC documents.</div>
            )}
            {installerInfo.kyc_status === 1 && (
              <div className="status-action pending">⏳ KYC documents submitted. Awaiting admin approval.</div>
            )}
            {installerInfo.kyc_status === 2 && (
              <>
                {installerInfo.project_id > 0 && (
                  <div className="status-action success">
                    ✅ Project #{installerInfo.project_id} submitted and under admin review.
                    <br />Once approved, investors can stake APT on your project.
                  </div>
                )}
                <button className="primary-btn" onClick={() => setStep(3)}>
                  🌞 {installerInfo.project_id > 0 ? "Submit Another Project" : "Submit Your Project"} →
                </button>
              </>
            )}
            {installerInfo.kyc_status === 3 && (
              <div className="status-action error">
                ❌ KYC rejected. Please contact support.
              </div>
            )}

            <div className="status-actions-row">
              <button className="secondary-btn" onClick={fetchInstallerData}>🔄 Refresh Status</button>
              {installerInfo.kyc_status === 0 && (
                <button className="primary-btn" onClick={() => setStep(2)}>📄 Submit KYC →</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}