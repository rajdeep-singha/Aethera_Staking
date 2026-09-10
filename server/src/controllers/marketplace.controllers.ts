import { Request, Response } from 'express';
import { marketplaceService } from '../services/marketplace.services';
import { orderBookTracker } from '../services/orderbook-tracker';
import { Account, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';
import { OrderSide } from '../models/types';

// Loads admin account from ADMIN_PRIVATE_KEY env var (same pattern as admin.controllers.ts)
const getAdminAccount = (): Account | null => {
  let pk = process.env.ADMIN_PRIVATE_KEY;
  if (!pk) {
    console.warn('[marketplace.getAdminAccount] ADMIN_PRIVATE_KEY not set');
    return null;
  }
  if (pk.startsWith('ed25519-priv-')) pk = pk.replace('ed25519-priv-', '');
  try {
    return Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(pk) });
  } catch (error) {
    console.error('[marketplace.getAdminAccount] Invalid private key format:', error);
    return null;
  }
};

export class MarketplaceController {

  // ── Trader writes ─────────────────────────────────────────────────────────────

  /** POST /api/marketplace/order  Body: { private_key, project_id, side, price_per_token, quantity } */
  async placeOrder(req: Request, res: Response) {
    try {
      const { private_key, project_id, side, price_per_token, quantity } = req.body;
      if (!private_key || project_id === undefined || side === undefined || !price_per_token || !quantity) {
        return res.status(400).json({
          success: false,
          error: 'private_key, project_id, side, price_per_token, and quantity are required',
        });
      }
      if (Number(side) !== OrderSide.BID && Number(side) !== OrderSide.ASK) {
        return res.status(400).json({ success: false, error: 'side must be 0 (BID) or 1 (ASK)' });
      }
      const maker = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(private_key) });
      const result = await marketplaceService.placeOrder(
        maker,
        Number(project_id),
        Number(side) as OrderSide,
        price_per_token.toString(),
        quantity.toString(),
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Place order failed' });
    }
  }

  /** POST /api/marketplace/order/cancel  Body: { private_key, project_id, order_id } */
  async cancelOrder(req: Request, res: Response) {
    try {
      const { private_key, project_id, order_id } = req.body;
      if (!private_key || project_id === undefined || order_id === undefined) {
        return res.status(400).json({ success: false, error: 'private_key, project_id, and order_id are required' });
      }
      const maker = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(private_key) });
      const result = await marketplaceService.cancelOrder(maker, Number(project_id), Number(order_id));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Cancel order failed' });
    }
  }

  /** POST /api/marketplace/order/fill  Body: { private_key, project_id, order_id, fill_quantity } */
  async fillOrder(req: Request, res: Response) {
    try {
      const { private_key, project_id, order_id, fill_quantity } = req.body;
      if (!private_key || project_id === undefined || order_id === undefined || !fill_quantity) {
        return res.status(400).json({
          success: false,
          error: 'private_key, project_id, order_id, and fill_quantity are required',
        });
      }
      const taker = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(private_key) });
      const result = await marketplaceService.fillOrder(
        taker,
        Number(project_id),
        Number(order_id),
        fill_quantity.toString(),
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Fill order failed' });
    }
  }

  // ── Reads ─────────────────────────────────────────────────────────────────────

  /** GET /api/marketplace/order/:project_id/:order_id — live on-chain order status */
  async getOrder(req: Request, res: Response) {
    try {
      const projectId = Number(req.params.project_id);
      const orderId = Number(req.params.order_id);
      if (isNaN(projectId) || isNaN(orderId)) {
        return res.status(400).json({ success: false, error: 'Invalid project_id or order_id' });
      }
      const order = await marketplaceService.getOrder(projectId, orderId);
      if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
      res.json({ success: true, data: order });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch order' });
    }
  }

  /** GET /api/marketplace/orderbook/:project_id — served from the off-chain event index (NOT chain) */
  async getOrderBook(req: Request, res: Response) {
    try {
      const projectId = Number(req.params.project_id);
      if (isNaN(projectId)) return res.status(400).json({ success: false, error: 'Invalid project_id' });
      const book = await orderBookTracker.getOrderBook(projectId);
      res.json({ success: true, data: book });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch order book' });
    }
  }

  // ── Admin writes ──────────────────────────────────────────────────────────────

  /** POST /api/admin/marketplace/init-project  Body: { project_id } */
  async initProjectMarket(req: Request, res: Response) {
    try {
      const { project_id } = req.body;
      if (project_id === undefined) {
        return res.status(400).json({ success: false, error: 'project_id is required' });
      }
      const adminAccount = getAdminAccount();
      if (!adminAccount) return res.status(500).json({ success: false, error: 'Admin credentials not configured' });

      const result = await marketplaceService.initProjectMarket(adminAccount, Number(project_id));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Market init failed' });
    }
  }

  /** POST /api/admin/marketplace/fee  Body: { new_fee_bps } */
  async updateFee(req: Request, res: Response) {
    try {
      const { new_fee_bps } = req.body;
      if (new_fee_bps === undefined) {
        return res.status(400).json({ success: false, error: 'new_fee_bps is required' });
      }
      const adminAccount = getAdminAccount();
      if (!adminAccount) return res.status(500).json({ success: false, error: 'Admin credentials not configured' });

      const result = await marketplaceService.updateFee(adminAccount, Number(new_fee_bps));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Fee update failed' });
    }
  }
}

export const marketplaceController = new MarketplaceController();
