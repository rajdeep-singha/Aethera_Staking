import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import * as dotenv from "dotenv";
dotenv.config();

const getNetwork = (): Network => {
  const network = process.env.APTOS_NETWORK?.toLowerCase();
  switch (network) {
    case "mainnet":
      return Network.MAINNET;
    case "devnet":
      return Network.DEVNET;
    case "testnet":
    default:
      return Network.TESTNET; // contracts are on testnet
  }
};

const getFullnodeUrl = (): string | undefined => {
  if (process.env.APTOS_NODE_URL) return process.env.APTOS_NODE_URL;
  const network = process.env.APTOS_NETWORK?.toLowerCase();
  if (network === "devnet") return "https://api.devnet.aptoslabs.com/v1";
  if (network === "mainnet") return "https://api.mainnet.aptoslabs.com/v1";
  // default → testnet (contracts are deployed on testnet)
  return "https://api.testnet.aptoslabs.com/v1";
};

const config = new AptosConfig({
  network: getNetwork(),
  fullnode: getFullnodeUrl(),
  faucet: process.env.APTOS_FAUCET_URL,
});

export const aptos = new Aptos(config);

// ── Contract Config ───────────────────────────────────────────────────────────
// All 3 contracts are deployed from the same admin wallet so the authority
// address is the same for all. Use separate env vars for clarity / flexibility.
export const CONTRACT_CONFIG = {
  CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS!,
  MODULE_NAME: "aethera_staking",

  // All 3 contracts deployed from the same admin wallet — fall back to
  // CONTRACT_ADDRESS if the specific authority env var is not set.
  HUB_AUTHORITY:
    process.env.HUB_AUTHORITY_ADDRESS || process.env.CONTRACT_ADDRESS!,

  REGISTRY_AUTHORITY:
    process.env.REGISTRY_AUTHORITY_ADDRESS || process.env.CONTRACT_ADDRESS!,

  PROJECT_AUTHORITY:
    process.env.PROJECT_AUTHORITY_ADDRESS || process.env.CONTRACT_ADDRESS!,

  // kept for legacy routes
  VAULT_AUTHORITY:
    process.env.VAULT_AUTHORITY_ADDRESS || process.env.CONTRACT_ADDRESS!,
};

// ── Module Functions — state.move (updated) ───────────────────────────────────
export const MODULE_FUNCTIONS = {
  // Admin
  INITIALIZE: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::initialize`,
  CREATE_PROJECT_VAULT: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::create_project_vault`,
  DEPOSIT_REWARDS: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::deposit`,
  WITHDRAW: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::withdraw`,
  CONFIG: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::config`,
  // Investor
  SOL_STAKE: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::sol_stake`,
  SOL_UNSTAKE: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::sol_unstake`,
  CLAIM_REWARDS: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::claim_rewards`,
  // Legacy (kept for backward compat)
  DEPOSIT: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::deposit`,
};

// ── Module Functions — installer_registry.move ────────────────────────────────
export const INSTALLER_FUNCTIONS = {
  INITIALIZE: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::installer_registry::initialize`,
  REGISTER: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::installer_registry::register_installer`,
  SUBMIT_KYC: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::installer_registry::submit_kyc`,
  APPROVE_KYC: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::installer_registry::approve_kyc`,
  REJECT_KYC: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::installer_registry::reject_kyc`,
};

// ── Module Functions — project_listing.move ───────────────────────────────────
export const PROJECT_FUNCTIONS = {
  INITIALIZE: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_listing::initialize`,
  SUBMIT_PROJECT: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_listing::submit_project`,
  APPROVE_PROJECT: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_listing::approve_project`,
  REJECT_PROJECT: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_listing::reject_project`,
};


export const TOKEN_FUNCTIONS = {
  INITIALIZE: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_token::initialize`,
  INITIALIZE_PROJECT_TOKEN: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_token::initialize_project_token`,
  SET_LIFECYCLE: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_token::set_lifecycle`,
  UPDATE_NAV: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_token::update_nav`,
  DISTRIBUTE_YIELD: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_token::distribute_yield`,
  ADMIN_FORCE_BURN: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_token::admin_force_burn`,
  CLAIM_YIELD: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_token::claim_yield`,
};

export const MARKETPLACE_FUNCTIONS = {
  INITIALIZE: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::marketplace::initialize`,
  INIT_PROJECT_MARKET: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::marketplace::init_project_market`,
  UPDATE_FEE: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::marketplace::update_fee`,
  PLACE_ORDER: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::marketplace::place_order`,
  CANCEL_ORDER: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::marketplace::cancel_order`,
  FILL_ORDER: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::marketplace::fill_order`,
};


// ── View Functions 
export const VIEW_FUNCTIONS = {
  // state.move
  GET_PROJECT_TOTAL_STAKED: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::get_project_total_staked`,
  GET_PROJECT_APY: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::get_project_apy`,
  GET_PLAYER_STAKE: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::get_player_stake`,
  // installer_registry.move
  GET_KYC_STATUS: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::installer_registry::get_kyc_status`,
  IS_KYC_APPROVED: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::installer_registry::is_kyc_approved`,
  GET_INSTALLER_LOCATION: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::installer_registry::get_installer_location`,
  // project_listing.move
  IS_PROJECT_APPROVED: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_listing::is_project_approved`,
  GET_PROJECT_STATUS: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_listing::get_project_status`,
  GET_PROJECT_COST: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_listing::get_project_cost`,
  GET_PROJECT_LOCATION: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_listing::get_project_location`,
  GET_EXPECTED_YIELD: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_listing::get_expected_yield`,
  GET_TOKEN_BALANCE:       `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_token::get_token_balance`,
  GET_NAV:                 `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_token::get_nav`,
  GET_LIFECYCLE:            `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_token::get_lifecycle`,
  GET_PENDING_YIELD:        `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_token::get_pending_yield`,
  GET_TOKEN_METADATA_ADDR:  `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_token::get_token_metadata_addr`, // the new view
  GET_MARKET_ORDER:         `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::marketplace::get_order`,
  GET_MARKET_ESCROW_ADDR:   `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::marketplace::get_escrow_address`,
};

// Constants 
export const CONSTANTS = {
  OCTAS_PER_APT: 100_000_000,
  SECONDS_PER_YEAR: 31_536_000,
  BASIS_POINTS_DIVISOR: 10_000,
};

//  Helpers 
export const aptToOctas = (apt: number): bigint =>
  BigInt(Math.floor(apt * CONSTANTS.OCTAS_PER_APT));

export const octasToApt = (octas: bigint | string): number =>
  Number(octas) / CONSTANTS.OCTAS_PER_APT;

export const bpsToPercent = (bps: number): string =>
  (bps / 100).toFixed(2) + "%";

export const formatApt = (octas: string | number): string =>
  (Number(octas) / CONSTANTS.OCTAS_PER_APT).toFixed(8);

// ── Validation ────────────────────────────────────────────────────────────────
if (!process.env.CONTRACT_ADDRESS)
  throw new Error("CONTRACT_ADDRESS is not set");

// All authority addresses fall back to CONTRACT_ADDRESS since all 3 contracts
// are deployed from the same admin wallet on testnet.
if (!process.env.HUB_AUTHORITY_ADDRESS && !process.env.CONTRACT_ADDRESS)
  throw new Error("HUB_AUTHORITY_ADDRESS is not set");
if (!process.env.REGISTRY_AUTHORITY_ADDRESS && !process.env.CONTRACT_ADDRESS)
  throw new Error("REGISTRY_AUTHORITY_ADDRESS is not set");
if (!process.env.PROJECT_AUTHORITY_ADDRESS && !process.env.CONTRACT_ADDRESS)
  throw new Error("PROJECT_AUTHORITY_ADDRESS is not set");

console.log(`🚀 Aptos SDK initialized on ${getNetwork()}`);
console.log(`📝 Contract:           ${CONTRACT_CONFIG.CONTRACT_ADDRESS}`);
console.log(`🏦 Hub Authority:      ${CONTRACT_CONFIG.HUB_AUTHORITY}`);
console.log(`📋 Registry Authority: ${CONTRACT_CONFIG.REGISTRY_AUTHORITY}`);
console.log(`🏗️  Project Authority:  ${CONTRACT_CONFIG.PROJECT_AUTHORITY}`);
