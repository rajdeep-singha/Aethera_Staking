/**
 * Order-book reader (on-chain scan — no indexer).
 *
 * marketplace.move stores orders in an aptos_std::table::Table, whose keys can't
 * be enumerated from a resource read. The original design polled the indexer's
 * `events` table to reconstruct the book — but Aptos deprecated that table
 * (v1 events, end-of-support Sep 8), so event polling now hard-fails.
 *
 * Instead we exploit that order ids are strictly sequential: Orders.next_order_id
 * starts at 1 and only increments, and orders are never deleted (cancel/fill just
 * flip status). So the full set of ids is [1, next_order_id). We read next_order_id
 * from the escrow account's Orders resource (fullnode REST), then fetch each order
 * via the get_order view (fullnode /view). Both endpoints are unaffected by the
 * indexer deprecation. Results are cached briefly to avoid hammering on refresh.
 */

import { aptos, VIEW_FUNCTIONS, CONTRACT_CONFIG } from '../config/aptos.config';
import { MarketOrder, OrderBookResponse, OrderSide, OrderStatus } from '../models/types';

type EntryFn = `${string}::${string}::${string}`;
const CACHE_TTL_MS = Number(process.env.MARKETPLACE_CACHE_MS ?? 5000);

interface CacheEntry {
  data: OrderBookResponse;
  ts: number;
}

class OrderBookTracker {
  private cache: Map<number, CacheEntry> = new Map();

  /** No background work needed — the book is scanned on demand. Kept for app.ts wiring. */
  start(): void {
    console.log('[OrderBookTracker] On-demand on-chain scan mode (no indexer, no poller)');
  }

  /** Open bids/asks for a project, scanned live from chain (cached for CACHE_TTL_MS). */
  async getOrderBook(projectId: number): Promise<OrderBookResponse> {
    const cached = this.cache.get(projectId);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

    const empty: OrderBookResponse = {
      project_id: projectId,
      bids: [],
      asks: [],
      updated_at: Date.now(),
    };

    try {
      // 1. Escrow resource-account address (aborts if the market isn't initialized).
      const [escrowAddr] = await aptos.view({
        payload: {
          function: VIEW_FUNCTIONS.GET_MARKET_ESCROW_ADDR as EntryFn,
          functionArguments: [CONTRACT_CONFIG.HUB_AUTHORITY, projectId],
        },
      });

      // 2. next_order_id from the Orders resource on the escrow account.
      const resource: any = await aptos.getAccountResource({
        accountAddress: String(escrowAddr),
        resourceType: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::marketplace::Orders` as EntryFn,
      });
      const data = resource?.data ?? resource;
      const nextId = Number(data?.next_order_id ?? 1);

      // 3. Fetch every order id in [1, nextId) via the get_order view, in parallel.
      const ids = Array.from({ length: Math.max(0, nextId - 1) }, (_, i) => i + 1);
      const orders = await Promise.all(ids.map((id) => this.fetchOrder(projectId, id)));

      const open = orders.filter(
        (o): o is MarketOrder =>
          !!o && o.status === OrderStatus.OPEN && BigInt(o.quantity) > 0n,
      );

      const bids = open
        .filter((o) => o.side === OrderSide.BID)
        .sort((a, b) => (BigInt(b.price_per_token) > BigInt(a.price_per_token) ? 1 : -1));
      const asks = open
        .filter((o) => o.side === OrderSide.ASK)
        .sort((a, b) => (BigInt(a.price_per_token) > BigInt(b.price_per_token) ? 1 : -1));

      const book: OrderBookResponse = {
        project_id: projectId,
        bids,
        asks,
        updated_at: Date.now(),
      };
      this.cache.set(projectId, { data: book, ts: Date.now() });
      return book;
    } catch (error: any) {
      // Market not initialized yet (escrow view aborts / Orders 404) → empty book, not an error.
      if (
        error?.status === 404 ||
        /E_MARKET_NOT_FOUND|Orders|resource_not_found/i.test(error?.message || '')
      ) {
        return empty;
      }
      console.error('[OrderBookTracker] scan error:', error?.message || error);
      return empty;
    }
  }

  /** Single order via the get_order view. Ids in range always exist (never deleted). */
  private async fetchOrder(projectId: number, orderId: number): Promise<MarketOrder | null> {
    try {
      const [o] = await aptos.view({
        payload: {
          function: VIEW_FUNCTIONS.GET_MARKET_ORDER as EntryFn,
          functionArguments: [CONTRACT_CONFIG.HUB_AUTHORITY, projectId, orderId],
        },
      });
      const raw = o as any;
      return {
        order_id: Number(raw.order_id),
        project_id: Number(raw.project_id),
        maker: String(raw.maker),
        side: Number(raw.side) as OrderSide,
        price_per_token: String(raw.price_per_token),
        quantity: String(raw.quantity),
        status: Number(raw.status) as OrderStatus,
        created_at: Number(raw.created_at),
      };
    } catch {
      return null;
    }
  }
}

export const orderBookTracker = new OrderBookTracker();
