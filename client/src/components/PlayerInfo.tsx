import { useEffect, useState } from 'react';
import { getPlayerInfo, getBalance, formatDuration } from '../services/api';
import type { PlayerInfo as PlayerInfoType, BalanceInfo } from '../services/api';
import './PlayerInfo.css';

interface PlayerInfoProps {
  walletAddress: string | null;
  onClaimRewards?: () => void;
}

export default function PlayerInfo({ walletAddress, onClaimRewards }: PlayerInfoProps) {
  const [player, setPlayer] = useState<PlayerInfoType | null>(null);
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [_error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  const fetchPlayerData = async () => {
    if (!walletAddress) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const [playerRes, balanceRes] = await Promise.all([
        getPlayerInfo(walletAddress).catch(() => ({ success: false, data: null })),
        getBalance(walletAddress),
      ]);

      if (balanceRes.success && balanceRes.data) {
        setBalance(balanceRes.data);
      }

      if (playerRes.success && playerRes.data) {
        setPlayer(playerRes.data);
        setTimeRemaining(playerRes.data.time_remaining);
      } else {
        setPlayer(null); // User hasn't staked yet
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayerData();
    const interval = setInterval(fetchPlayerData, 15000);
    return () => clearInterval(interval);
  }, [walletAddress]);

  // Countdown timer
  useEffect(() => {
    if (timeRemaining <= 0) return;
    
    const timer = setInterval(() => {
      setTimeRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining]);

  if (!walletAddress) {
    return (
      <div className="player-info">
        <div className="player-header">
          <h2>👤 Your Staking</h2>
        </div>
        <div className="connect-prompt">
          <div className="prompt-icon">🔗</div>
          <p>Connect your wallet to view staking info</p>
        </div>
      </div>
    );
  }

  if (loading && !player && !balance) {
    return (
      <div className="player-info">
        <div className="player-header">
          <h2>👤 Your Staking</h2>
        </div>
        <div className="player-loading">
          <div className="loading-spinner"></div>
          <p>Loading your data...</p>
        </div>
      </div>
    );
  }

  const hasStake = player && Number(player.staked_amount) > 0;
  const canUnstake = hasStake && !player.is_locked;
  const pendingRewards = player ? Number(player.pending_rewards_apt) : 0;

  return (
    <div className="player-info">
      <div className="player-header">
        <h2>👤 Your Staking</h2>
        <button 
          onClick={fetchPlayerData} 
          className="refresh-btn"
          disabled={loading}
        >
          {loading ? '↻' : '🔄'}
        </button>
      </div>

      <div className="wallet-badge">
        <span className="badge-icon">💳</span>
        <span className="wallet-address">
          {walletAddress.slice(0, 10)}...{walletAddress.slice(-8)}
        </span>
      </div>

      <div className="player-stats">
        <div className="stat-row">
          <div className="stat-item">
            <span className="stat-label">Wallet Balance</span>
            <span className="stat-value">{balance?.balance_apt || '0.00'} APT</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Staked Amount</span>
            <span className="stat-value staked">{player?.staked_amount_apt || '0.00'} APT</span>
          </div>
        </div>

        {hasStake && (
          <>
            <div className="stat-row">
              <div className="stat-item">
                <span className="stat-label">Pending Rewards</span>
                <span className="stat-value rewards">
                  {player?.pending_rewards_apt || '0.00000000'} APT
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Lock Status</span>
                <span className={`stat-value status ${canUnstake ? 'unlocked' : 'locked'}`}>
                  {canUnstake ? '🔓 Unlocked' : '🔒 Locked'}
                </span>
              </div>
            </div>

            {player.is_locked && timeRemaining > 0 && (
              <div className="countdown-section">
                <div className="countdown-label">Time until unlock</div>
                <div className="countdown-timer">
                  {formatDuration(timeRemaining)}
                </div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ 
                      width: `${Math.max(0, 100 - (timeRemaining / player.lock_duration) * 100)}%` 
                    }}
                  ></div>
                </div>
              </div>
            )}

            <div className="action-buttons">
              {pendingRewards > 0 && (
                <button 
                  className="claim-btn"
                  onClick={onClaimRewards}
                >
                  🎁 Claim {player?.pending_rewards_apt} APT
                </button>
              )}
              {canUnstake && (
                <button className="unstake-btn">
                  🔓 Unstake All
                </button>
              )}
            </div>
          </>
        )}

        {!hasStake && (
          <div className="no-stake-message">
            <div className="message-icon">📊</div>
            <p>You haven't staked any tokens yet.</p>
            <p className="hint">Start staking to earn rewards!</p>
          </div>
        )}
      </div>
    </div>
  );
}

