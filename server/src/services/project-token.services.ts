import { aptos, TOKEN_FUNCTIONS, VIEW_FUNCTIONS, CONTRACT_CONFIG, formatApt } from '../config/aptos.config';
import { Account } from '@aptos-labs/ts-sdk';
import {
  TransactionResponse,
  TokenBalanceInfo,
  TokenNavInfo,
  TokenLifecycleInfo,
  PendingYieldInfo,
  Lifecycle,
} from '../models/types';

type EntryFn = `${string}::${string}::${string}`;

const LIFECYCLE_LABELS: Record<number, string> = {
  0: 'PreLaunch',
  1: 'Funding',
  2: 'Active',
  3: 'Matured',
  4: 'Closed',
};

/**
 * project_token.move integration.
 *
 * ProjectTokenState lives inside a `Table` on ProjectTokenHub, which does NOT
 * serialize into the resource JSON — so every read here goes through a #[view]
 * call (aptos.view) rather than the resource-scraping trick the staking service
 * uses for its SimpleMap-backed state.
 */
export class ProjectTokenService {

  // ── Reads (view functions) 
  /** Investor's project-token balance (whole tokens; FA decimals = 0). */
  async getTokenBalance(address: string, projectId: number): Promise<TokenBalanceInfo | null> {
    try {
      const [balance] = await aptos.view({
        payload: {
          function: VIEW_FUNCTIONS.GET_TOKEN_BALANCE as EntryFn,
          functionArguments: [address, CONTRACT_CONFIG.HUB_AUTHORITY, projectId],
        },
      });
      return { address, project_id: projectId, balance: String(balance) };
    } catch (error: any) {
      console.error('[ProjectTokenService.getTokenBalance] Error:', error.message || error);
      return null;
    }
  }

  /** Current NAV (octas per token) for a project. */
  async getNav(projectId: number): Promise<TokenNavInfo | null> {
    try {
      const [nav] = await aptos.view({
        payload: {
          function: VIEW_FUNCTIONS.GET_NAV as EntryFn,
          functionArguments: [CONTRACT_CONFIG.HUB_AUTHORITY, projectId],
        },
      });
      return {
        project_id: projectId,
        nav_per_token: String(nav),
        nav_per_token_apt: formatApt(String(nav)),
      };
    } catch (error: any) {
      console.error('[ProjectTokenService.getNav] Error:', error.message || error);
      return null;
    }
  }

  /** Current lifecycle stage for a project. */
  async getLifecycle(projectId: number): Promise<TokenLifecycleInfo | null> {
    try {
      const [lifecycle] = await aptos.view({
        payload: {
          function: VIEW_FUNCTIONS.GET_LIFECYCLE as EntryFn,
          functionArguments: [CONTRACT_CONFIG.HUB_AUTHORITY, projectId],
        },
      });
      const stage = Number(lifecycle) as Lifecycle;
      return {
        project_id: projectId,
        lifecycle: stage,
        lifecycle_label: LIFECYCLE_LABELS[stage] ?? 'Unknown',
      };
    } catch (error: any) {
      console.error('[ProjectTokenService.getLifecycle] Error:', error.message || error);
      return null;
    }
  }

  /** Investor's unclaimed APT yield (octas) for a project. */
  async getPendingYield(address: string, projectId: number): Promise<PendingYieldInfo | null> {
    try {
      const [pending] = await aptos.view({
        payload: {
          function: VIEW_FUNCTIONS.GET_PENDING_YIELD as EntryFn,
          functionArguments: [address, CONTRACT_CONFIG.HUB_AUTHORITY, projectId],
        },
      });
      return {
        address,
        project_id: projectId,
        pending_yield: String(pending),
        pending_yield_apt: formatApt(String(pending)),
      };
    } catch (error: any) {
      console.error('[ProjectTokenService.getPendingYield] Error:', error.message || error);
      return null;
    }
  }

  // ── Investor writes 

  /** Investor — claim accrued APT yield for a project. */
  async claimYield(userAccount: Account, projectId: number): Promise<TransactionResponse> {
    return this.submit(userAccount, TOKEN_FUNCTIONS.CLAIM_YIELD, [
      CONTRACT_CONFIG.HUB_AUTHORITY,
      projectId,
    ], 'Yield claimed successfully');
  }

  // ── Admin writes

  /** Admin — stand up a brand-new fungible asset for one project. */
  async initializeProjectToken(
    adminAccount: Account,
    projectId: number,
    maxSupply: string,
    navPerToken: string,
    maxStalenessSeconds: number,
  ): Promise<TransactionResponse> {
    return this.submit(adminAccount, TOKEN_FUNCTIONS.INITIALIZE_PROJECT_TOKEN, [
      CONTRACT_CONFIG.HUB_AUTHORITY,
      projectId,
      maxSupply,
      navPerToken,
      maxStalenessSeconds,
    ], 'Project token created');
  }

  /** Admin — update NAV (octas per token). */
  async updateNav(
    adminAccount: Account,
    projectId: number,
    newNav: string,
    sourceHash: string,
  ): Promise<TransactionResponse> {
    return this.submit(adminAccount, TOKEN_FUNCTIONS.UPDATE_NAV, [
      CONTRACT_CONFIG.HUB_AUTHORITY,
      projectId,
      newNav,
      sourceHash,
    ], 'NAV updated');
  }

  /** Admin — retune the NAV staleness window (seconds) for an existing project. */
  async setMaxStaleness(
    adminAccount: Account,
    projectId: number,
    maxStalenessSeconds: number,
  ): Promise<TransactionResponse> {
    return this.submit(adminAccount, TOKEN_FUNCTIONS.SET_MAX_STALENESS, [
      CONTRACT_CONFIG.HUB_AUTHORITY,
      projectId,
      maxStalenessSeconds,
    ], 'NAV staleness window updated');
  }

  /** Admin — advance lifecycle (strictly increasing on-chain). */
  async setLifecycle(
    adminAccount: Account,
    projectId: number,
    newLifecycle: number,
  ): Promise<TransactionResponse> {
    return this.submit(adminAccount, TOKEN_FUNCTIONS.SET_LIFECYCLE, [
      CONTRACT_CONFIG.HUB_AUTHORITY,
      projectId,
      newLifecycle,
    ], 'Lifecycle updated');
  }

  /** Admin — distribute revenue as yield (APT pulled from the admin wallet). */
  async distributeYield(
    adminAccount: Account,
    projectId: number,
    yieldAmount: string,
  ): Promise<TransactionResponse> {
    return this.submit(adminAccount, TOKEN_FUNCTIONS.DISTRIBUTE_YIELD, [
      CONTRACT_CONFIG.HUB_AUTHORITY,
      projectId,
      yieldAmount,
    ], 'Yield distributed');
  }

  /** Admin — compliance force-burn from a holder's store. */
  async adminForceBurn(
    adminAccount: Account,
    projectId: number,
    holder: string,
    amount: string,
    reasonCode: number,
  ): Promise<TransactionResponse> {
    return this.submit(adminAccount, TOKEN_FUNCTIONS.ADMIN_FORCE_BURN, [
      CONTRACT_CONFIG.HUB_AUTHORITY,
      projectId,
      holder,
      amount,
      reasonCode,
    ], 'Tokens force-burned');
  }

  // ── Startup─────

  /**
   * Initialize the ProjectTokenHub on-chain once (guarded by a 404 check on the
   * resource). Mirrors ProjectService.initializeRegistry. Must run before any
   * project token can be created, and before the marketplace — whose place/fill
   * paths call project_token::get_lifecycle — can function.
   */
  async initializeHub(): Promise<boolean> {
    try {
      const resourceType =
        `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::project_token::ProjectTokenHub` as EntryFn;

      try {
        const resource = await aptos.getAccountResource({
          accountAddress: CONTRACT_CONFIG.HUB_AUTHORITY,
          resourceType,
        });
        if (resource) {
          console.log('[ProjectTokenService.initializeHub] Hub already initialized');
          return true;
        }
      } catch (e: any) {
        if (e.status !== 404) throw e;
      }

      const adminAccount = this.getAdminAccount();
      if (!adminAccount) {
        console.error('[ProjectTokenService.initializeHub] ADMIN_PRIVATE_KEY not set');
        return false;
      }

      const transaction = await aptos.transaction.build.simple({
        sender: adminAccount.accountAddress,
        data: {
          function: TOKEN_FUNCTIONS.INITIALIZE as EntryFn,
          // initialize(admin, project_authority) — project_authority = ProjectRegistry addr
          functionArguments: [CONTRACT_CONFIG.PROJECT_AUTHORITY],
        },
      });

      const committed = await aptos.signAndSubmitTransaction({ signer: adminAccount, transaction });
      await aptos.waitForTransaction({ transactionHash: committed.hash });
      console.log('[ProjectTokenService.initializeHub] ✅ Hub initialized! TX:', committed.hash);
      return true;
    } catch (error: any) {
      console.error('[ProjectTokenService.initializeHub] Error:', error.message || error);
      return false;
    }
  }

  // ── Internal helpers ─

  private getAdminAccount(): Account | null {
    let pk = process.env.ADMIN_PRIVATE_KEY;
    if (!pk) return null;
    if (pk.startsWith('ed25519-priv-')) pk = pk.replace('ed25519-priv-', '');
    try {
      const { Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');
      return Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(pk) });
    } catch {
      return null;
    }
  }

  private async submit(
    signer: Account,
    fn: string,
    functionArguments: (string | number)[],
    successMessage: string,
  ): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: signer.accountAddress,
        data: { function: fn as EntryFn, functionArguments },
      });
      const committed = await aptos.signAndSubmitTransaction({ signer, transaction });
      const executed = await aptos.waitForTransaction({ transactionHash: committed.hash });
      return {
        success: executed.success,
        transaction_hash: committed.hash,
        message: successMessage,
      };
    } catch (error: any) {
      console.error(`[ProjectTokenService.submit] ${fn} failed:`, error.message || error);
      return { success: false, error: error.message || 'Transaction failed' };
    }
  }
}

export const projectTokenService = new ProjectTokenService();
