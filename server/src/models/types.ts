
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


export enum KycStatus {
  PENDING   = 0,   // registered, docs not uploaded yet
  SUBMITTED = 1,   // docs uploaded, waiting for admin
  APPROVED  = 2,   // admin approved
  REJECTED  = 3,   // admin rejected
}

// PROJECT STATUS ENUM  (mirrors on-chain constants)

export enum ProjectStatus {
  PENDING  = 0,
  APPROVED = 1,
  REJECTED = 2,
}

// INSTALLER REGISTRY — installer_registry.move

// POST /api/installer/register
export interface RegisterInstallerRequest {
  wallet_address: string;   // installer's Aptos wallet
  name: string;
  business_reg: string;     // business registration number
}

// POST /api/installer/submit-kyc
export interface SubmitKycRequest {
  wallet_address: string;
  documents_hash: string;   // IPFS hash of uploaded KYC docs
  location_id: number;      // on-chain oracle location id chosen by installer
}

// Response shape for installer info (read from chain)
export interface InstallerInfo {
  wallet: string;
  name: string;
  business_reg: string;
  documents_hash: string;
  kyc_status: KycStatus;
  kyc_status_label: string; // human-readable: "Pending" | "Submitted" | "Approved" | "Rejected"
  location_id: number;
  project_id: number;       // 0 = no project listed yet
}

// PROJECT LISTING — project_listing.move

// POST /api/project/submit
export interface SubmitProjectRequest {
  installer_address: string;
  name: string;
  location_id: number;
  capacity_kw: number;
  cost_apt: string;           // in octas as string to avoid JS bigint issues
  description: string;
  documents_hash: string;     // IPFS hash for project docs / images
  expected_yield_bps: number; // basis points: 800 = 8% APY
}

// Response shape for a single project (read from chain)
export interface ProjectInfo {
  project_id: number;
  name: string;
  location_id: number;
  capacity_kw: number;
  cost_apt: string;
  cost_apt_human: string;     // formatted: "12.5 APT"
  description: string;
  documents_hash: string;
  expected_yield_bps: number;
  expected_yield_pct: string; // formatted: "8.00%"
  installer: string;
  status: ProjectStatus;
  status_label: string;       // "Pending" | "Approved" | "Rejected"
}

// GET /api/project/location/:location_id
export interface ProjectsByLocationResponse {
  location_id: number;
  projects: ProjectInfo[];
  total: number;
}

// PER-PROJECT STAKING — state.move (updated)

// POST /api/staking/stake
export interface ProjectStakeRequest {
  player_address: string;
  hub_authority: string;      // address where StakingHub is stored (admin addr)
  project_id: number;
  amount: string;             // in octas as string
  duration: number;           // lock period in seconds
}

// POST /api/staking/unstake
export interface ProjectUnstakeRequest {
  player_address: string;
  hub_authority: string;
  project_id: number;
}

// POST /api/staking/claim
export interface ProjectClaimRequest {
  player_address: string;
  hub_authority: string;
  project_id: number;
}

// GET /api/staking/project/:project_id
export interface ProjectVaultInfo {
  project_id: number;
  authority: string;
  total_staked: string;
  total_staked_apt: string;
  apy_rate: number;
}

// GET /api/staking/player/:address/project/:project_id
export interface ProjectPlayerStake {
  player_address: string;
  project_id: number;
  staked_amount: string;
  staked_amount_apt: string;
  staked_time: number;
  lock_duration: number;
  unlock_time: number;
  is_locked: boolean;
  time_remaining: number;     // seconds until unlock, 0 if unlocked
  pending_rewards: string;
  pending_rewards_apt: string;
}

// GET /api/staking/simulate
export interface SimulateStakeRequest {
  amount: string;             // in octas
  apy_rate: number;
  duration_days: number;
}

export interface SimulateStakeResponse {
  principal_apt: string;
  estimated_reward_apt: string;
  total_return_apt: string;
  apy_rate: number;
  duration_days: number;
}

// ADMIN — covers all 3 contracts

// POST /api/admin/kyc/approve  or  /api/admin/kyc/reject
export interface AdminKycActionRequest {
  installer_address: string;   // wallet address of the installer to approve/reject
}

// POST /api/admin/project/approve  or  /api/admin/project/reject
export interface AdminProjectActionRequest {
  project_id: number;
}

// POST /api/admin/vault/create
export interface AdminCreateVaultRequest {
  project_id: number;
  apy_rate: number;
}

// POST /api/admin/vault/deposit-rewards
export interface AdminDepositRewardsRequest {
  project_id: number;
  amount: string;              // in octas
}

// POST /api/admin/vault/config
export interface AdminConfigRequest {
  project_id: number;
  new_apy_rate: number;
}

// POST /api/admin/vault/withdraw
export interface AdminWithdrawRequest {
  project_id: number;
}

// PROJECT TOKEN — project_token.move

// Lifecycle stages (mirrors on-chain constants in project_token.move)
export enum Lifecycle {
  PRE_LAUNCH = 0,
  FUNDING    = 1,
  ACTIVE     = 2,
  MATURED    = 3,
  CLOSED     = 4,
}

// GET /api/token/balance/:address/project/:project_id
export interface TokenBalanceInfo {
  address: string;
  project_id: number;
  balance: string;            // whole tokens (FA decimals = 0)
}

// GET /api/token/nav/:project_id
export interface TokenNavInfo {
  project_id: number;
  nav_per_token: string;      // octas per token
  nav_per_token_apt: string;  // formatted APT
}

// GET /api/token/lifecycle/:project_id
export interface TokenLifecycleInfo {
  project_id: number;
  lifecycle: Lifecycle;
  lifecycle_label: string;    // "PreLaunch" | "Funding" | "Active" | "Matured" | "Closed"
}

// GET /api/token/pending-yield/:address/project/:project_id
export interface PendingYieldInfo {
  address: string;
  project_id: number;
  pending_yield: string;      // octas
  pending_yield_apt: string;  // formatted APT
}

// POST /api/token/claim-yield
export interface ClaimYieldRequest {
  private_key: string;
  project_id: number;
}

// POST /api/admin/token/init-project
export interface AdminInitProjectTokenRequest {
  project_id: number;
  max_supply: string;            // 0 = uncapped
  nav_per_token: string;         // octas per token
  max_staleness_seconds: number;
}

// POST /api/admin/token/update-nav
export interface AdminUpdateNavRequest {
  project_id: number;
  new_nav: string;               // octas per token
  source_hash?: string;          // optional off-chain audit reference
}

// POST /api/admin/token/set-lifecycle
export interface AdminSetLifecycleRequest {
  project_id: number;
  new_lifecycle: Lifecycle;      // must be strictly greater than current stage
}

// POST /api/admin/token/distribute-yield
export interface AdminDistributeYieldRequest {
  project_id: number;
  yield_amount: string;          // octas
}

// POST /api/admin/token/force-burn
export interface AdminForceBurnRequest {
  project_id: number;
  holder: string;
  amount: string;                // whole tokens
  reason_code: number;           // 0 = AML, 1 = court_order, 2 = compliance
}

// MARKETPLACE — marketplace.move

export enum OrderSide { BID = 0, ASK = 1 }
export enum OrderStatus { OPEN = 0, FILLED = 1, CANCELLED = 2 }

// POST /api/marketplace/order
export interface PlaceOrderRequest {
  private_key: string;
  project_id: number;
  side: OrderSide;
  price_per_token: string;       // octas per token
  quantity: string;              // whole tokens
}

// POST /api/marketplace/order/cancel
export interface CancelOrderRequest {
  private_key: string;
  project_id: number;
  order_id: number;
}

// POST /api/marketplace/order/fill
export interface FillOrderRequest {
  private_key: string;
  project_id: number;
  order_id: number;
  fill_quantity: string;         // whole tokens
}

// GET /api/marketplace/order/:project_id/:order_id
export interface MarketOrder {
  order_id: number;
  project_id: number;
  maker: string;
  side: OrderSide;
  price_per_token: string;       // octas per token
  quantity: string;              // remaining unfilled quantity, in tokens
  status: OrderStatus;
  created_at: number;
}

// GET /api/marketplace/orderbook/:project_id (served from the off-chain event index)
export interface OrderBookResponse {
  project_id: number;
  bids: MarketOrder[];   // side = BID, sorted price_per_token descending (best bid first)
  asks: MarketOrder[];   // side = ASK, sorted price_per_token ascending (best ask first)
  updated_at: number;    // ms epoch of the last index reconciliation
}

// POST /api/admin/marketplace/init-project
export interface AdminInitMarketRequest {
  project_id: number;
}

// POST /api/admin/marketplace/fee
export interface AdminUpdateFeeRequest {
  new_fee_bps: number;           // capped at 1000 (10%) on-chain
}

// SHARED API RESPONSE WRAPPER

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}