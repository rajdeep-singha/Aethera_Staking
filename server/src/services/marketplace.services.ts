import { aptos, MARKETPLACE_FUNCTIONS, VIEW_FUNCTIONS, CONTRACT_CONFIG } from '../config/aptos.config';
import { Account } from '@aptos-labs/ts-sdk';
import {
  TransactionResponse,
  MarketOrder,
  OrderSide,
  OrderStatus,
} from '../models/types';

type EntryFn = `${string}::${string}::${string}`;

/**
 * marketplace.move integration.
 *
 * Orders live inside a `Table` on each project's escrow account — Tables do not
 * serialize their entries into resource JSON, so a single order is read via the
 * get_order #[view] (get_order works fine; enumerating "all open orders" does
 * NOT — that requires the off-chain event index, Phase 2).
 */
export class MarketplaceService {

  // ── Reads (view functions) ──────────────────────────────────────────────────

  /** Live on-chain status of a single resting order. */
  async getOrder(projectId: number, orderId: number): Promise<MarketOrder | null> {
    try {
      const [order] = await aptos.view({
        payload: {
          function: VIEW_FUNCTIONS.GET_MARKET_ORDER as EntryFn,
          functionArguments: [CONTRACT_CONFIG.HUB_AUTHORITY, projectId, orderId],
        },
      });
      return this.mapOrder(order);
    } catch (error: any) {
      console.error('[MarketplaceService.getOrder] Error:', error.message || error);
      return null;
    }
  }

  /** Escrow resource-account address for a project's order book. */
  async getEscrowAddress(projectId: number): Promise<string | null> {
    try {
      const [addr] = await aptos.view({
        payload: {
          function: VIEW_FUNCTIONS.GET_MARKET_ESCROW_ADDR as EntryFn,
          functionArguments: [CONTRACT_CONFIG.HUB_AUTHORITY, projectId],
        },
      });
      return String(addr);
    } catch (error: any) {
      console.error('[MarketplaceService.getEscrowAddress] Error:', error.message || error);
      return null;
    }
  }

  // ── Trader writes ─────────────────────────────────────────────────────────────

  /** Place a resting limit order (escrows APT for BID, tokens for ASK). */
  async placeOrder(
    maker: Account,
    projectId: number,
    side: OrderSide,
    pricePerToken: string,
    quantity: string,
  ): Promise<TransactionResponse> {
    return this.submit(maker, MARKETPLACE_FUNCTIONS.PLACE_ORDER, [
      CONTRACT_CONFIG.HUB_AUTHORITY,
      projectId,
      side,
      pricePerToken,
      quantity,
    ], 'Order placed');
  }

  /** Cancel a still-open order and refund whatever remains escrowed. */
  async cancelOrder(
    maker: Account,
    projectId: number,
    orderId: number,
  ): Promise<TransactionResponse> {
    return this.submit(maker, MARKETPLACE_FUNCTIONS.CANCEL_ORDER, [
      CONTRACT_CONFIG.HUB_AUTHORITY,
      projectId,
      orderId,
    ], 'Order cancelled');
  }

  /**
   * Fill (fully or partially) a resting order.
   *
   * A live get_order check runs first so a stale client / order-book index can't
   * make a taker sign a fill against an order that's already cancelled or fully
   * filled — the contract would abort anyway, but this returns a cleaner error
   * without burning a transaction.
   */
  async fillOrder(
    taker: Account,
    projectId: number,
    orderId: number,
    fillQuantity: string,
  ): Promise<TransactionResponse> {
    const order = await this.getOrder(projectId, orderId);
    if (!order) {
      return { success: false, error: `Order ${orderId} not found for project ${projectId}` };
    }
    if (order.status !== OrderStatus.OPEN) {
      return { success: false, error: `Order ${orderId} is not open (status: ${OrderStatus[order.status]})` };
    }
    if (BigInt(fillQuantity) > BigInt(order.quantity)) {
      return {
        success: false,
        error: `fill_quantity ${fillQuantity} exceeds remaining order quantity ${order.quantity}`,
      };
    }

    return this.submit(taker, MARKETPLACE_FUNCTIONS.FILL_ORDER, [
      CONTRACT_CONFIG.HUB_AUTHORITY,
      projectId,
      orderId,
      fillQuantity,
    ], 'Order filled');
  }

  // ── Admin writes ──────────────────────────────────────────────────────────────

  /** Admin — stand up the order book + escrow account for one project. */
  async initProjectMarket(adminAccount: Account, projectId: number): Promise<TransactionResponse> {
    return this.submit(adminAccount, MARKETPLACE_FUNCTIONS.INIT_PROJECT_MARKET, [
      CONTRACT_CONFIG.HUB_AUTHORITY,
      projectId,
    ], 'Project market initialized');
  }

  /** Admin — update the protocol fee (bps, capped at 1000 on-chain). */
  async updateFee(adminAccount: Account, newFeeBps: number): Promise<TransactionResponse> {
    return this.submit(adminAccount, MARKETPLACE_FUNCTIONS.UPDATE_FEE, [
      CONTRACT_CONFIG.HUB_AUTHORITY,
      newFeeBps,
    ], 'Fee updated');
  }

  // ── Startup ───────────────────────────────────────────────────────────────────

  /**
   * Initialize the MarketplaceHub on-chain once (guarded by a 404 check).
   * Mirrors ProjectService.initializeRegistry. Depends on the ProjectTokenHub
   * existing first (token_hub_authority points at it).
   */
  async initializeHub(): Promise<boolean> {
    try {
      const resourceType =
        `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::marketplace::MarketplaceHub` as EntryFn;

      try {
        const resource = await aptos.getAccountResource({
          accountAddress: CONTRACT_CONFIG.HUB_AUTHORITY,
          resourceType,
        });
        if (resource) {
          console.log('[MarketplaceService.initializeHub] Hub already initialized');
          return true;
        }
      } catch (e: any) {
        if (e.status !== 404) throw e;
      }

      const adminAccount = this.getAdminAccount();
      if (!adminAccount) {
        console.error('[MarketplaceService.initializeHub] ADMIN_PRIVATE_KEY not set');
        return false;
      }

      const transaction = await aptos.transaction.build.simple({
        sender: adminAccount.accountAddress,
        data: {
          function: MARKETPLACE_FUNCTIONS.INITIALIZE as EntryFn,
          // initialize(admin, token_hub_authority, fee_bps, fee_collector)
          functionArguments: [
            CONTRACT_CONFIG.HUB_AUTHORITY,
            CONTRACT_CONFIG.MARKETPLACE_FEE_BPS,
            CONTRACT_CONFIG.FEE_COLLECTOR,
          ],
        },
      });

      const committed = await aptos.signAndSubmitTransaction({ signer: adminAccount, transaction });
      await aptos.waitForTransaction({ transactionHash: committed.hash });
      console.log('[MarketplaceService.initializeHub] ✅ Hub initialized! TX:', committed.hash);
      return true;
    } catch (error: any) {
      console.error('[MarketplaceService.initializeHub] Error:', error.message || error);
      return false;
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────────────────

  private mapOrder(raw: any): MarketOrder {
    return {
      order_id:        Number(raw.order_id),
      project_id:      Number(raw.project_id),
      maker:           String(raw.maker),
      side:            Number(raw.side) as OrderSide,
      price_per_token: String(raw.price_per_token),
      quantity:        String(raw.quantity),
      status:          Number(raw.status) as OrderStatus,
      created_at:      Number(raw.created_at),
    };
  }

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
      console.error(`[MarketplaceService.submit] ${fn} failed:`, error.message || error);
      return { success: false, error: error.message || 'Transaction failed' };
    }
  }
}

export const marketplaceService = new MarketplaceService();
