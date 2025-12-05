export interface VaultInfo {
  authority: string;
  staked_amount: string;
  apy_rate: string;
  vault_balance: string;
}

export interface PlayerInfo {
  staked_time: string;
  staked_amount: string;
  reward_time: string;
  duration_time: string;
  reward_amount: string;
  pending_rewards?: string;
  unlock_time?: string;
  is_unlocked?: boolean;
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