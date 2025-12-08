import { useState, useEffect } from 'react';
import VaultInfo from './components/VaultInfo';
import PlayerInfo from './components/PlayerInfo';
import StakeForm from './components/StakeForm';
import ClaimRewards from './components/ClaimRewards';
import { getVaultInfo, getPlayerInfo, getBalance } from './services/api';
import './App.css';

// Contract address
const CONTRACT_ADDRESS = '0x3894481b4dab10b691e954de7836b39fab6ea587861a613792aabd2f21008747';

function App() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<string>('0');
  const [apyRate, setApyRate] = useState<number>(10);
  const [pendingRewards, setPendingRewards] = useState<string>('0.00000000');
  const [connecting, setConnecting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [walletNetwork, setWalletNetwork] = useState<string>('unknown');

  // Check if Petra wallet is available
  const isPetraAvailable = () => {
    return typeof window !== 'undefined' && 'aptos' in window;
  };

  // Connect wallet
  const connectWallet = async () => {
    if (!isPetraAvailable()) {
      window.open('https://petra.app/', '_blank');
      return;
    }

    setConnecting(true);
    try {
      const petra = (window as any).aptos;
      
      // Check network - try to get network info
      try {
        const network = await petra.network();
        console.log('Petra wallet network:', network);
        setWalletNetwork(network || 'unknown');
        if (network && network.toLowerCase() !== 'devnet') {
          alert(`⚠️ Please switch your Petra wallet to Devnet!\n\nCurrent network: ${network}\nRequired: Devnet\n\nGo to Petra → Settings → Network → Devnet`);
        }
      } catch (e) {
        console.log('Could not detect network');
        setWalletNetwork('unknown');
      }
      
      const response = await petra.connect();
      console.log('Connected wallet address:', response.address);
      setWalletAddress(response.address);
      
      // Fetch balance
      const balanceRes = await getBalance(response.address);
      console.log('Balance response:', balanceRes);
      if (balanceRes.success && balanceRes.data) {
        setWalletBalance(balanceRes.data.balance_apt);
      }

      // Fetch player info for pending rewards
      const playerRes = await getPlayerInfo(response.address);
      if (playerRes.success && playerRes.data) {
        setPendingRewards(playerRes.data.pending_rewards_apt);
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    } finally {
      setConnecting(false);
    }
  };

  // Disconnect wallet
  const disconnectWallet = async () => {
    try {
      if (isPetraAvailable()) {
        await (window as any).aptos.disconnect();
      }
      setWalletAddress(null);
      setWalletBalance('0');
      setPendingRewards('0.00000000');
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  };

  // Fetch APY rate on mount
  useEffect(() => {
    const fetchApy = async () => {
      try {
        const vaultRes = await getVaultInfo();
        if (vaultRes.success && vaultRes.data) {
          setApyRate(vaultRes.data.apy_rate);
        }
      } catch (error) {
        console.error('Failed to fetch APY:', error);
      }
    };
    fetchApy();
  }, []);

  // Auto-connect if already connected
  useEffect(() => {
    const autoConnect = async () => {
      if (isPetraAvailable()) {
        try {
          const petra = (window as any).aptos;
          const isConnected = await petra.isConnected();
          if (isConnected) {
            // Check network
            try {
              const network = await petra.network();
              console.log('Petra wallet network:', network);
              setWalletNetwork(network || 'unknown');
              if (network && network.toLowerCase() !== 'devnet') {
                console.warn(`⚠️ Petra is on ${network}, not devnet!`);
              }
            } catch (e) {
              console.log('Could not detect network');
              setWalletNetwork('unknown');
            }
            
            const account = await petra.account();
            console.log('Auto-connected wallet:', account.address);
            setWalletAddress(account.address);
            
            const balanceRes = await getBalance(account.address);
            console.log('Balance from API:', balanceRes);
            if (balanceRes.success && balanceRes.data) {
              setWalletBalance(balanceRes.data.balance_apt);
            }
          }
        } catch (error) {
          console.error('Auto-connect failed:', error);
        }
      }
    };
    autoConnect();
  }, []);

  // Handle stake action
  const handleStake = async (amountOctas: string, durationSeconds: number) => {
    if (!walletAddress || !isPetraAvailable()) return;

    try {
      const petra = (window as any).aptos;
      
      const payload = {
        type: 'entry_function_payload',
        function: `${CONTRACT_ADDRESS}::state::sol_stake`,
        type_arguments: [],
        arguments: [CONTRACT_ADDRESS, amountOctas, durationSeconds.toString()],
      };

      const response = await petra.signAndSubmitTransaction(payload);
      console.log('Stake transaction:', response);
      
      // Refresh data after staking
      setRefreshKey((prev) => prev + 1);
      
      // Refetch balance
      const balanceRes = await getBalance(walletAddress);
      if (balanceRes.success && balanceRes.data) {
        setWalletBalance(balanceRes.data.balance_apt);
      }
    } catch (error) {
      console.error('Staking failed:', error);
    }
  };

  // Handle claim rewards
  const handleClaimRewards = async () => {
    if (!walletAddress || !isPetraAvailable()) return;

    try {
      const petra = (window as any).aptos;
      
      const payload = {
        type: 'entry_function_payload',
        function: `${CONTRACT_ADDRESS}::state::claim_rewards`,
        type_arguments: [],
        arguments: [CONTRACT_ADDRESS],
      };

      const response = await petra.signAndSubmitTransaction(payload);
      console.log('Claim transaction:', response);
      
      // Refresh data
      setRefreshKey((prev) => prev + 1);
      setPendingRewards('0.00000000');
      
      // Refetch balance
      const balanceRes = await getBalance(walletAddress);
      if (balanceRes.success && balanceRes.data) {
        setWalletBalance(balanceRes.data.balance_apt);
      }
    } catch (error) {
      console.error('Claim failed:', error);
    }
  };

  return (
    <div className="app">
      {/* Background Effects */}
      <div className="bg-effects">
        <div className="gradient-orb orb-1"></div>
        <div className="gradient-orb orb-2"></div>
        <div className="gradient-orb orb-3"></div>
        <div className="grid-pattern"></div>
      </div>

      {/* Header */}
      <header className="header">
        <div className="logo">
          <span className="logo-icon">⚡</span>
          <span className="logo-text">Aethera</span>
          <span className="logo-badge">Staking</span>
        </div>
        
        <nav className="nav-links">
          <a href="#stake" className="nav-link active">Stake</a>
          <a href="#stats" className="nav-link">Stats</a>
          <a 
            href={`https://explorer.aptoslabs.com/account/${CONTRACT_ADDRESS}?network=devnet`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="nav-link"
          >
            Explorer ↗
          </a>
        </nav>

        <div className="wallet-section">
          {walletAddress ? (
            <div className="wallet-connected">
              <span className={`network-badge ${walletNetwork.toLowerCase() === 'devnet' ? 'devnet' : 'wrong-network'}`}>
                {walletNetwork}
              </span>
              <div className="wallet-info">
                <span className="wallet-balance">{Number(walletBalance).toFixed(2)} APT</span>
                <span className="wallet-address-short">
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </span>
              </div>
              <button className="disconnect-btn" onClick={disconnectWallet}>
                Disconnect
              </button>
            </div>
          ) : (
            <button 
              className="connect-btn" 
              onClick={connectWallet}
              disabled={connecting}
            >
              {connecting ? (
                <>
                  <span className="btn-spinner"></span>
                  Connecting...
                </>
              ) : isPetraAvailable() ? (
                <>🔗 Connect Petra</>
              ) : (
                <>📥 Install Petra</>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Hero Section */}
        <section className="hero">
          <h1>
            Stake APT. <span className="gradient-text">Earn Rewards.</span>
          </h1>
          <p className="hero-subtitle">
            Secure your tokens and earn up to <span className="highlight">{apyRate}% APY</span> with Aethera Staking on Aptos
          </p>
        </section>

        {/* Dashboard Grid */}
        <div className="dashboard-grid" key={refreshKey}>
          {/* Left Column - Staking Form */}
          <div className="dashboard-left">
            <StakeForm
              walletAddress={walletAddress}
              walletBalance={walletBalance}
              onStake={handleStake}
              apyRate={apyRate}
            />
          </div>

          {/* Right Column - Info Cards */}
          <div className="dashboard-right">
            <VaultInfo />
            <PlayerInfo 
              walletAddress={walletAddress} 
              onClaimRewards={handleClaimRewards}
            />
            <ClaimRewards
              walletAddress={walletAddress}
              pendingRewards={pendingRewards}
              onClaim={handleClaimRewards}
            />
          </div>
        </div>

        {/* Info Cards */}
        <section className="info-cards">
          <div className="info-card">
            <div className="info-card-icon">🔒</div>
            <h3>Secure Staking</h3>
            <p>Your tokens are secured by Move smart contracts on the Aptos blockchain</p>
          </div>
          <div className="info-card">
            <div className="info-card-icon">📈</div>
            <h3>Competitive APY</h3>
            <p>Earn rewards with our industry-leading annual percentage yield</p>
          </div>
          <div className="info-card">
            <div className="info-card-icon">⚡</div>
            <h3>Fast & Cheap</h3>
            <p>Enjoy sub-second transactions with minimal gas fees on Aptos</p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-brand">
            <span className="logo-icon">⚡</span> Aethera Staking
          </div>
          <div className="footer-links">
            <a href={`https://explorer.aptoslabs.com/account/${CONTRACT_ADDRESS}?network=devnet`} target="_blank" rel="noopener noreferrer">
              Contract
            </a>
            <a href="https://aptos.dev" target="_blank" rel="noopener noreferrer">
              Aptos Docs
            </a>
            <a href="https://petra.app" target="_blank" rel="noopener noreferrer">
              Petra Wallet
            </a>
          </div>
          <div className="footer-note">
            Built on Aptos • Devnet
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
