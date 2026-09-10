import axios from "axios";

if (!import.meta.env.VITE_API_URL && import.meta.env.PROD) {
  throw new Error("[api.ts] VITE_API_URL is not set.");
}

// VITE_API_URL may hold a comma-separated list (e.g. "local,prod"); use the first.
const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:3000/api")
  .split(",")[0]
  .trim();

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  },
});

// ── Shared ───
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ── Existing types (unchanged) ────────────────────────────────────────────────
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

export interface SimulationResult {
  principal_apt: string;
  estimated_reward_apt: string;
  total_return_apt: string;
  apy_rate: number;
  duration_days: number;
}

export interface BalanceInfo {
  address: string;
  balance: string;
  balance_apt: string;
}

// ── New types 
export interface InstallerInfo {
  wallet: string;
  name: string;
  business_reg: string;
  documents_hash: string;
  kyc_status: number;     // 0=Pending 1=Submitted 2=Approved 3=Rejected
  kyc_status_label: string;
  location_id: number;
  project_id: number;
}

export interface ProjectInfo {
  project_id: number;
  name: string;
  location_id: number;
  capacity_kw: number;
  cost_apt: string;
  cost_apt_human: string;
  description: string;
  documents_hash: string;
  expected_yield_bps: number;
  expected_yield_pct: string;
  installer: string;
  status: number;
  status_label: string;
}

export interface ProjectVaultInfo {
  project_id: number;
  authority: string;
  total_staked: string;
  total_staked_apt: string;
  apy_rate: number;
}

export interface ProjectPlayerStake {
  player_address: string;
  project_id: number;
  staked_amount: string;
  staked_amount_apt: string;
  staked_time: number;
  lock_duration: number;
  unlock_time: number;
  is_locked: boolean;
  time_remaining: number;
  pending_rewards: string;
  pending_rewards_apt: string;
}

// ── Project Token + Marketplace types (project_token.move / marketplace.move) ──
export const Lifecycle = {
  PRE_LAUNCH: 0,
  FUNDING: 1,
  ACTIVE: 2,
  MATURED: 3,
  CLOSED: 4,
} as const;
export const LIFECYCLE_LABELS: Record<number, string> = {
  0: "PreLaunch",
  1: "Funding",
  2: "Active",
  3: "Matured",
  4: "Closed",
};

export const OrderSide = { BID: 0, ASK: 1 } as const;
export const OrderStatus = { OPEN: 0, FILLED: 1, CANCELLED: 2 } as const;
export const ORDER_STATUS_LABELS: Record<number, string> = {
  0: "Open",
  1: "Filled",
  2: "Cancelled",
};

export interface TokenBalanceInfo {
  address: string;
  project_id: number;
  balance: string; // whole tokens (FA decimals = 0)
}

export interface TokenNavInfo {
  project_id: number;
  nav_per_token: string;
  nav_per_token_apt: string;
}

export interface TokenLifecycleInfo {
  project_id: number;
  lifecycle: number;
  lifecycle_label: string;
}

export interface PendingYieldInfo {
  address: string;
  project_id: number;
  pending_yield: string;
  pending_yield_apt: string;
}

export interface MarketOrder {
  order_id: number;
  project_id: number;
  maker: string;
  side: number; // 0 = BID, 1 = ASK
  price_per_token: string;
  quantity: string;
  status: number; // 0 OPEN, 1 FILLED, 2 CANCELLED
  created_at: number;
}

export interface OrderBookResponse {
  project_id: number;
  bids: MarketOrder[];
  asks: MarketOrder[];
  updated_at: number;
}

// ── Existing API calls (unchanged) ───────────────────────────────────────────
export const getVaultInfo = async (): Promise<ApiResponse<VaultInfo>> => {
  const r = await api.get(`/vault/info?_t=${Date.now()}`);
  return r.data;
};

export const getPlayerInfo = async (address: string): Promise<ApiResponse<PlayerInfo>> => {
  const r = await api.get(`/player/${address}?_t=${Date.now()}`);
  return r.data;
};

export const getBalance = async (address: string): Promise<ApiResponse<BalanceInfo>> => {
  const r = await api.get(`/balance/${address}?_t=${Date.now()}`);
  return r.data;
};

export const simulateStake = async (
  amount: string,
  apyRate: number,
  durationDays: number,
): Promise<ApiResponse<SimulationResult>> => {
  const r = await api.post("/staking/simulate", { amount, apy_rate: apyRate, duration_days: durationDays });
  return r.data;
};

// ── Installer API ─────────────────────────────────────────────────────────────
export const getInstaller = async (address: string): Promise<ApiResponse<InstallerInfo>> => {
  const r = await api.get(`/installer/${address}?_t=${Date.now()}`);
  return r.data;
};

// ── Project API ───────────────────────────────────────────────────────────────
export const getProjectsByLocation = async (locationId: number): Promise<ApiResponse<{ location_id: number; projects: ProjectInfo[]; total: number }>> => {
  const r = await api.get(`/project/location/${locationId}?_t=${Date.now()}`);
  return r.data;
};

export const getProject = async (projectId: number): Promise<ApiResponse<ProjectInfo>> => {
  const r = await api.get(`/project/${projectId}?_t=${Date.now()}`);
  return r.data;
};

// ── Staking API ───────────────────────────────────────────────────────────────
export const getProjectVault = async (projectId: number): Promise<ApiResponse<ProjectVaultInfo>> => {
  const r = await api.get(`/staking/project/${projectId}?_t=${Date.now()}`);
  return r.data;
};

export const getPlayerProjectStake = async (address: string, projectId: number): Promise<ApiResponse<ProjectPlayerStake>> => {
  const r = await api.get(`/staking/player/${address}/project/${projectId}?_t=${Date.now()}`);
  return r.data;
};

// ── Admin API 
export const adminApproveKyc = async (installerAddress: string): Promise<ApiResponse<any>> => {
  const r = await api.post("/admin/kyc/approve", { installer_address: installerAddress });
  return r.data;
};

export const adminRejectKyc = async (installerAddress: string): Promise<ApiResponse<any>> => {
  const r = await api.post("/admin/kyc/reject", { installer_address: installerAddress });
  return r.data;
};

export const adminApproveProject = async (projectId: number): Promise<ApiResponse<any>> => {
  const r = await api.post("/admin/project/approve", { project_id: projectId });
  return r.data;
};

export const adminRejectProject = async (projectId: number): Promise<ApiResponse<any>> => {
  const r = await api.post("/admin/project/reject", { project_id: projectId });
  return r.data;
};

export const adminCreateVault = async (projectId: number, apyRate: number): Promise<ApiResponse<any>> => {
  const r = await api.post("/admin/vault/create", { project_id: projectId, apy_rate: apyRate });
  return r.data;
};

export const adminDepositRewards = async (projectId: number, amount: string): Promise<ApiResponse<any>> => {
  const r = await api.post("/admin/vault/deposit", { project_id: projectId, amount });
  return r.data;
};

export const adminUpdateConfig = async (projectId: number, newApyRate: number): Promise<ApiResponse<any>> => {
  const r = await api.post("/admin/vault/config", { project_id: projectId, new_apy_rate: newApyRate });
  return r.data;
};

// ── Project Token API (reads) ─────────────────────────────────────────────────
export const getTokenBalance = async (address: string, projectId: number): Promise<ApiResponse<TokenBalanceInfo>> => {
  const r = await api.get(`/token/balance/${address}/project/${projectId}?_t=${Date.now()}`);
  return r.data;
};

export const getTokenNav = async (projectId: number): Promise<ApiResponse<TokenNavInfo>> => {
  const r = await api.get(`/token/nav/${projectId}?_t=${Date.now()}`);
  return r.data;
};

export const getTokenLifecycle = async (projectId: number): Promise<ApiResponse<TokenLifecycleInfo>> => {
  const r = await api.get(`/token/lifecycle/${projectId}?_t=${Date.now()}`);
  return r.data;
};

export const getPendingYield = async (address: string, projectId: number): Promise<ApiResponse<PendingYieldInfo>> => {
  const r = await api.get(`/token/pending-yield/${address}/project/${projectId}?_t=${Date.now()}`);
  return r.data;
};

// ── Marketplace API (reads) ───────────────────────────────────────────────────
export const getOrder = async (projectId: number, orderId: number): Promise<ApiResponse<MarketOrder>> => {
  const r = await api.get(`/marketplace/order/${projectId}/${orderId}?_t=${Date.now()}`);
  return r.data;
};

export const getOrderBook = async (projectId: number): Promise<ApiResponse<OrderBookResponse>> => {
  const r = await api.get(`/marketplace/orderbook/${projectId}?_t=${Date.now()}`);
  return r.data;
};

// ── Admin Token API (server-signed) ───────────────────────────────────────────
export const adminInitProjectToken = async (
  projectId: number,
  maxSupply: string,
  navPerToken: string,
  maxStalenessSeconds: number,
): Promise<ApiResponse<any>> => {
  const r = await api.post("/admin/token/init-project", {
    project_id: projectId,
    max_supply: maxSupply,
    nav_per_token: navPerToken,
    max_staleness_seconds: maxStalenessSeconds,
  });
  return r.data;
};

export const adminUpdateNav = async (projectId: number, newNav: string, sourceHash?: string): Promise<ApiResponse<any>> => {
  const r = await api.post("/admin/token/update-nav", { project_id: projectId, new_nav: newNav, source_hash: sourceHash });
  return r.data;
};

export const adminSetLifecycle = async (projectId: number, newLifecycle: number): Promise<ApiResponse<any>> => {
  const r = await api.post("/admin/token/set-lifecycle", { project_id: projectId, new_lifecycle: newLifecycle });
  return r.data;
};

export const adminDistributeYield = async (projectId: number, yieldAmount: string): Promise<ApiResponse<any>> => {
  const r = await api.post("/admin/token/distribute-yield", { project_id: projectId, yield_amount: yieldAmount });
  return r.data;
};

// ── Admin Marketplace API (server-signed) ─────────────────────────────────────
export const adminInitMarket = async (projectId: number): Promise<ApiResponse<any>> => {
  const r = await api.post("/admin/marketplace/init-project", { project_id: projectId });
  return r.data;
};

export const adminUpdateFee = async (newFeeBps: number): Promise<ApiResponse<any>> => {
  const r = await api.post("/admin/marketplace/fee", { new_fee_bps: newFeeBps });
  return r.data;
};

// ── Helpers ──
export const formatApt = (octas: string | number): string => {
  return (Number(octas) / 100_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
};

export const aptToOctas = (apt: number): string =>
  Math.floor(apt * 100_000_000).toString();

export const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return "Unlocked";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export const formatTimestamp = (timestamp: number): string =>
  new Date(timestamp * 1000).toLocaleString();

export default api;