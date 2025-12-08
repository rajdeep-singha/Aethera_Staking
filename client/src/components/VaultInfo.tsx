import { useEffect, useState } from 'react';
import { getVaultInfo } from '../services/api';
import type { VaultInfo as VaultInfoType } from '../services/api';
import './VaultInfo.css';

interface VaultInfoProps {
  onRefresh?: () => void;
}

export default function VaultInfo({ onRefresh }: VaultInfoProps) {
  const [vault, setVault] = useState<VaultInfoType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVaultInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getVaultInfo();
      if (response.success && response.data) {
        setVault(response.data);
      } else {
        setError(response.error || 'Failed to fetch vault info');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVaultInfo();
    const interval = setInterval(fetchVaultInfo, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading && !vault) {
    return (
      <div className="vault-info">
        <div className="vault-header">
          <h2>🏦 Vault Statistics</h2>
        </div>
        <div className="vault-loading">
          <div className="loading-spinner"></div>
          <p>Loading vault data...</p>
        </div>
      </div>
    );
  }

  if (error && !vault) {
    return (
      <div className="vault-info">
        <div className="vault-header">
          <h2>🏦 Vault Statistics</h2>
        </div>
        <div className="vault-error">
          <p>⚠️ {error}</p>
          <button onClick={fetchVaultInfo} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="vault-info">
      <div className="vault-header">
        <h2>🏦 Vault Statistics</h2>
        <button 
          onClick={() => { fetchVaultInfo(); onRefresh?.(); }} 
          className="refresh-btn"
          disabled={loading}
        >
          {loading ? '↻' : '🔄'}
        </button>
      </div>

      <div className="vault-stats">
        <div className="stat-card apy">
          <div className="stat-icon">📈</div>
          <div className="stat-content">
            <span className="stat-label">APY Rate</span>
            <span className="stat-value highlight">{vault?.apy_rate}%</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <span className="stat-label">Total Staked</span>
            <span className="stat-value">{vault?.total_staked_apt} APT</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🏧</div>
          <div className="stat-content">
            <span className="stat-label">Vault Balance</span>
            <span className="stat-value">{vault?.vault_balance_apt} APT</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🔐</div>
          <div className="stat-content">
            <span className="stat-label">Authority</span>
            <span className="stat-value address">
              {vault?.authority.slice(0, 8)}...{vault?.authority.slice(-6)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

