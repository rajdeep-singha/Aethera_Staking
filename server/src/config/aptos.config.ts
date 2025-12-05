import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import * as dotenv from 'dotenv';

dotenv.config();

// Network configuration
const getNetwork = (): Network => {
  const network = process.env.APTOS_NETWORK?.toLowerCase();
  switch (network) {
    case 'mainnet':
      return Network.MAINNET;
    case 'testnet':
      return Network.TESTNET;
    case 'devnet':
      return Network.DEVNET;
    default:
      return Network.TESTNET;
  }
};

// Initialize Aptos configuration
const config = new AptosConfig({
  network: getNetwork(),
  fullnode: process.env.APTOS_NODE_URL,
  faucet: process.env.APTOS_FAUCET_URL,
});

// Create Aptos client
export const aptos = new Aptos(config);

// Contract addresses
export const CONTRACT_CONFIG = {
  CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS!,
  VAULT_AUTHORITY: process.env.VAULT_AUTHORITY_ADDRESS!,
  MODULE_NAME: 'aethera_staking',
};

// Module functions
export const MODULE_FUNCTIONS = {
  INITIALIZE: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::initialize`,
  SOL_STAKE: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::sol_stake`,
  SOL_UNSTAKE: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::sol_unstake`,
  CLAIM_REWARDS: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::claim_rewards`,
  CONFIG: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::config`,
  DEPOSIT: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::deposit`,
  WITHDRAW: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::withdraw`,
};

// View functions (to add them to  Move contract)
export const VIEW_FUNCTIONS = {
  GET_VAULT_INFO: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::get_vault_info`,
  GET_PLAYER_INFO: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::get_player_info`,
};

// Constants
export const CONSTANTS = {
  OCTAS_PER_APT: 100_000_000,
  SECONDS_PER_YEAR: 31_536_000,
  BASIS_POINTS_DIVISOR: 10_000,
};

// Helper functions
export const aptToOctas = (apt: number): bigint => {
  return BigInt(Math.floor(apt * CONSTANTS.OCTAS_PER_APT));
};

export const octasToApt = (octas: bigint | string): number => {
  return Number(octas) / CONSTANTS.OCTAS_PER_APT;
};

export const apyBasisPointsToPercent = (basisPoints: number): number => {
  return basisPoints / 100;
};

// Validation
if (!process.env.CONTRACT_ADDRESS) {
  throw new Error('CONTRACT_ADDRESS is not defined in environment variables');
}

if (!process.env.VAULT_AUTHORITY_ADDRESS) {
  throw new Error('VAULT_AUTHORITY_ADDRESS is not defined in environment variables');
}

console.log(`🚀 Aptos SDK initialized on ${getNetwork()}`);
console.log(`📝 Contract Address: ${CONTRACT_CONFIG.CONTRACT_ADDRESS}`);
console.log(`🏦 Vault Authority: ${CONTRACT_CONFIG.VAULT_AUTHORITY}`);