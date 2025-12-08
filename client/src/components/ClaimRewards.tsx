import { useState } from 'react';
import './ClaimRewards.css';

interface ClaimRewardsProps {
  walletAddress: string | null;
  pendingRewards: string;
  onClaim?: () => void;
}

export default function ClaimRewards({ walletAddress, pendingRewards, onClaim }: ClaimRewardsProps) {
  const [claiming, setClaiming] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const hasRewards = Number(pendingRewards) > 0;

  const handleClaim = async () => {
    if (!walletAddress || !hasRewards) return;

    setClaiming(true);
    try {
      onClaim?.();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } finally {
      setClaiming(false);
    }
  };

  if (!walletAddress) {
    return null;
  }

  return (
    <div className={`claim-rewards ${hasRewards ? 'has-rewards' : ''}`}>
      <div className="rewards-content">
        <div className="rewards-icon">
          {hasRewards ? '🎁' : '📭'}
        </div>
        <div className="rewards-info">
          <span className="rewards-label">
            {hasRewards ? 'Claimable Rewards' : 'No Rewards Yet'}
          </span>
          <span className={`rewards-amount ${hasRewards ? 'highlight' : ''}`}>
            {pendingRewards} APT
          </span>
        </div>
      </div>

      {hasRewards && (
        <button
          className={`claim-btn ${claiming ? 'claiming' : ''}`}
          onClick={handleClaim}
          disabled={claiming}
        >
          {claiming ? (
            <>
              <span className="btn-spinner"></span>
              Claiming...
            </>
          ) : (
            <>🎉 Claim Rewards</>
          )}
        </button>
      )}

      {showSuccess && (
        <div className="success-toast">
          ✅ Rewards claimed successfully!
        </div>
      )}
    </div>
  );
}

