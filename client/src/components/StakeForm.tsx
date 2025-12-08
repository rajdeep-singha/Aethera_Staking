import { useState, useEffect } from 'react';
import { simulateStake, aptToOctas, SimulationResult } from '../services/api';
import './StakeForm.css';

interface StakeFormProps {
  walletAddress: string | null;
  walletBalance: string;
  onStake?: (amount: string, duration: number) => void;
  apyRate: number;
}

const DURATION_PRESETS = [
  { label: '1 Min', value: 60, sublabel: 'Test' },
  { label: '7 Days', value: 604800, sublabel: '1 Week' },
  { label: '30 Days', value: 2592000, sublabel: '1 Month' },
  { label: '90 Days', value: 7776000, sublabel: '3 Months' },
  { label: '180 Days', value: 15552000, sublabel: '6 Months' },
  { label: '365 Days', value: 31536000, sublabel: '1 Year' },
];

export default function StakeForm({ walletAddress, walletBalance, onStake, apyRate }: StakeFormProps) {
  const [amount, setAmount] = useState<string>('');
  const [duration, setDuration] = useState<number>(604800); // 7 days default
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [staking, setStaking] = useState(false);

  // Simulate rewards when amount or duration changes
  useEffect(() => {
    const simulate = async () => {
      if (!amount || Number(amount) <= 0) {
        setSimulation(null);
        return;
      }

      try {
        setSimulating(true);
        const octas = aptToOctas(Number(amount));
        const response = await simulateStake(octas, duration);
        if (response.success && response.data) {
          setSimulation(response.data);
        }
      } catch (err) {
        console.error('Simulation failed:', err);
      } finally {
        setSimulating(false);
      }
    };

    const debounce = setTimeout(simulate, 300);
    return () => clearTimeout(debounce);
  }, [amount, duration]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmount(value);
    }
  };

  const handleMaxClick = () => {
    const maxBalance = Number(walletBalance);
    // Leave some APT for gas
    const stakeable = Math.max(0, maxBalance - 0.01);
    setAmount(stakeable.toFixed(4));
  };

  const handleStake = async () => {
    if (!amount || Number(amount) <= 0 || !walletAddress) return;

    setStaking(true);
    try {
      const octas = aptToOctas(Number(amount));
      onStake?.(octas, duration);
    } finally {
      setStaking(false);
    }
  };

  const isValidAmount = Number(amount) > 0 && Number(amount) <= Number(walletBalance);

  return (
    <div className="stake-form">
      <div className="form-header">
        <h2>💎 Stake APT</h2>
        <div className="apy-badge">
          <span className="apy-label">Current APY</span>
          <span className="apy-value">{apyRate}%</span>
        </div>
      </div>

      <div className="form-content">
        {/* Amount Input */}
        <div className="input-group">
          <label>Amount to Stake</label>
          <div className="input-wrapper">
            <input
              type="text"
              value={amount}
              onChange={handleAmountChange}
              placeholder="0.00"
              disabled={!walletAddress || staking}
            />
            <div className="input-suffix">
              <span className="currency">APT</span>
              <button 
                className="max-btn"
                onClick={handleMaxClick}
                disabled={!walletAddress}
              >
                MAX
              </button>
            </div>
          </div>
          <div className="input-hint">
            Available: {Number(walletBalance).toFixed(4)} APT
          </div>
        </div>

        {/* Duration Selection */}
        <div className="duration-group">
          <label>Lock Duration</label>
          <div className="duration-presets">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset.value}
                className={`duration-btn ${duration === preset.value ? 'active' : ''}`}
                onClick={() => setDuration(preset.value)}
                disabled={!walletAddress || staking}
              >
                <span className="duration-label">{preset.label}</span>
                <span className="duration-sublabel">{preset.sublabel}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Simulation Results */}
        {simulation && Number(amount) > 0 && (
          <div className="simulation-results">
            <div className="simulation-header">
              <span>📊 Estimated Returns</span>
              {simulating && <span className="simulating">Calculating...</span>}
            </div>
            <div className="simulation-grid">
              <div className="sim-item">
                <span className="sim-label">Staking</span>
                <span className="sim-value">{amount} APT</span>
              </div>
              <div className="sim-item">
                <span className="sim-label">APY Rate</span>
                <span className="sim-value">{simulation.apy_rate}%</span>
              </div>
              <div className="sim-item">
                <span className="sim-label">Est. Rewards</span>
                <span className="sim-value rewards">{simulation.estimated_rewards_apt} APT</span>
              </div>
              <div className="sim-item">
                <span className="sim-label">Unlock Date</span>
                <span className="sim-value date">
                  {new Date(simulation.unlock_timestamp * 1000).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Stake Button */}
        <button
          className={`stake-btn ${!walletAddress ? 'connect' : ''}`}
          onClick={handleStake}
          disabled={!walletAddress || !isValidAmount || staking}
        >
          {!walletAddress ? (
            <>🔗 Connect Wallet to Stake</>
          ) : staking ? (
            <>⏳ Staking...</>
          ) : !isValidAmount ? (
            <>Enter valid amount</>
          ) : (
            <>🚀 Stake {amount} APT</>
          )}
        </button>

        {/* Info Box */}
        <div className="info-box">
          <div className="info-item">
            <span className="info-icon">ℹ️</span>
            <span>Tokens are locked for the selected duration</span>
          </div>
          <div className="info-item">
            <span className="info-icon">💡</span>
            <span>Rewards can be claimed anytime after staking</span>
          </div>
          <div className="info-item">
            <span className="info-icon">⚠️</span>
            <span>Unstaking is only available after lock period ends</span>
          </div>
        </div>
      </div>
    </div>
  );
}

