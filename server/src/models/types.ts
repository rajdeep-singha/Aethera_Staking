export interface VaultInfo {
  authority: string;
  total_staked: string;
  total_staked_apt: string;
  apy_rate: number;
  vault_balance: string;
  vault_balance_apt: string;
}

export interface PlayerInfo {
  address: string;
  staked_amount: string;
  staked_amount_apt: string;
  stake_timestamp: number;
  lock_duration: number;
  unlock_timestamp: number;
  is_locked: boolean;
  time_remaining: number;
  pending_rewards: string;
  pending_rewards_apt: string;
}

export interface StakeRequest {
  player_address: string;
  amount: string;
  duration: number; // in seconds
}

export interface UnstakeRequest {
  player_address: string;
}

export interface ClaimRewardsRequest {
  player_address: string;
}

export interface ConfigRequest {
  apy_rate: number;
}

export interface DepositRequest {
  amount: string;
}

export interface TransactionResponse {
  success: boolean;
  transaction_hash?: string;
  error?: string;
  message?: string;
}

export interface StakingStats {
  total_staked: string;
  total_stakers: number;
  apy_rate: string;
  vault_balance: string;
}

export interface UserStakingInfo {
  player_info: PlayerInfo;
  vault_info: VaultInfo;
  can_unstake: boolean;
  time_until_unlock: number;
}

// Aptos SDK Types
export interface AptosAccount {
  address: string;
  publicKey: string;
  privateKey: string;
}

export interface NetworkConfig {
  name: string;
  nodeUrl: string;
  faucetUrl?: string;
}