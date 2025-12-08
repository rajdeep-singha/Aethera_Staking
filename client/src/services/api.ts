import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  },
});

// Types
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

export interface StakingStats {
  total_staked: string;
  total_staked_apt: string;
  apy_rate: number;
  vault_balance: string;
  vault_balance_apt: string;
  active_stakers?: number;
}

export interface SimulationResult {
  amount: string;
  duration_seconds: number;
  apy_rate: number;
  estimated_rewards: string;
  estimated_rewards_apt: string;
  unlock_timestamp: number;
}

export interface BalanceInfo {
  address: string;
  balance: string;
  balance_apt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// API Functions
export const getVaultInfo = async (): Promise<ApiResponse<VaultInfo>> => {
  const response = await api.get(`/vault/info?_t=${Date.now()}`);
  return response.data;
};

export const getPlayerInfo = async (address: string): Promise<ApiResponse<PlayerInfo>> => {
  const response = await api.get(`/player/${address}?_t=${Date.now()}`);
  return response.data;
};

export const getStats = async (): Promise<ApiResponse<StakingStats>> => {
  const response = await api.get(`/stats?_t=${Date.now()}`);
  return response.data;
};

export const getBalance = async (address: string): Promise<ApiResponse<BalanceInfo>> => {
  // Add timestamp to bust cache
  const response = await api.get(`/balance/${address}?_t=${Date.now()}`);
  return response.data;
};

export const simulateStake = async (
  amount: string,
  durationSeconds: number
): Promise<ApiResponse<SimulationResult>> => {
  const response = await api.post('/stake/simulate', {
    amount,
    duration_seconds: durationSeconds,
  });
  return response.data;
};

// Admin endpoints (if needed)
export const adminDeposit = async (amount: string): Promise<ApiResponse<any>> => {
  const response = await api.post('/admin/deposit', { amount });
  return response.data;
};

export const adminWithdraw = async (): Promise<ApiResponse<any>> => {
  const response = await api.post('/admin/withdraw');
  return response.data;
};

export const adminUpdateConfig = async (apyRate: number): Promise<ApiResponse<any>> => {
  const response = await api.post('/admin/config', { apy_rate: apyRate });
  return response.data;
};

// Utility functions
export const formatApt = (octas: string | number): string => {
  const value = Number(octas) / 100_000_000;
  return value.toLocaleString(undefined, { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 4 
  });
};

export const aptToOctas = (apt: number): string => {
  return Math.floor(apt * 100_000_000).toString();
};

export const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return 'Unlocked';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export const formatTimestamp = (timestamp: number): string => {
  return new Date(timestamp * 1000).toLocaleString();
};

export default api;

