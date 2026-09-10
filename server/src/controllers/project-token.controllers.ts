import { Request, Response } from 'express';
import { projectTokenService } from '../services/project-token.services';
import { Account, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';

// Loads admin account from ADMIN_PRIVATE_KEY env var (same pattern as admin.controllers.ts)
const getAdminAccount = (): Account | null => {
  let pk = process.env.ADMIN_PRIVATE_KEY;
  if (!pk) {
    console.warn('[project-token.getAdminAccount] ADMIN_PRIVATE_KEY not set');
    return null;
  }
  if (pk.startsWith('ed25519-priv-')) pk = pk.replace('ed25519-priv-', '');
  try {
    return Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(pk) });
  } catch (error) {
    console.error('[project-token.getAdminAccount] Invalid private key format:', error);
    return null;
  }
};

export class ProjectTokenController {

  // ── Reads ─────────────────────────────────────────────────────────────────────

  /** GET /api/token/balance/:address/project/:project_id */
  async getBalance(req: Request, res: Response) {
    try {
      const { address, project_id } = req.params;
      const projectId = Number(project_id);
      if (!address || isNaN(projectId)) {
        return res.status(400).json({ success: false, error: 'address and project_id are required' });
      }
      const info = await projectTokenService.getTokenBalance(address, projectId);
      if (!info) return res.status(404).json({ success: false, error: 'Token not found for project' });
      res.json({ success: true, data: info });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch balance' });
    }
  }

  /** GET /api/token/nav/:project_id */
  async getNav(req: Request, res: Response) {
    try {
      const projectId = Number(req.params.project_id);
      if (isNaN(projectId)) return res.status(400).json({ success: false, error: 'Invalid project_id' });
      const info = await projectTokenService.getNav(projectId);
      if (!info) return res.status(404).json({ success: false, error: 'Token not found for project' });
      res.json({ success: true, data: info });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch NAV' });
    }
  }

  /** GET /api/token/lifecycle/:project_id */
  async getLifecycle(req: Request, res: Response) {
    try {
      const projectId = Number(req.params.project_id);
      if (isNaN(projectId)) return res.status(400).json({ success: false, error: 'Invalid project_id' });
      const info = await projectTokenService.getLifecycle(projectId);
      if (!info) return res.status(404).json({ success: false, error: 'Token not found for project' });
      res.json({ success: true, data: info });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch lifecycle' });
    }
  }

  /** GET /api/token/pending-yield/:address/project/:project_id */
  async getPendingYield(req: Request, res: Response) {
    try {
      const { address, project_id } = req.params;
      const projectId = Number(project_id);
      if (!address || isNaN(projectId)) {
        return res.status(400).json({ success: false, error: 'address and project_id are required' });
      }
      const info = await projectTokenService.getPendingYield(address, projectId);
      if (!info) return res.status(404).json({ success: false, error: 'Token not found for project' });
      res.json({ success: true, data: info });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch pending yield' });
    }
  }

  // ── Investor write ──────────────────────────────────────────────────────────

  /** POST /api/token/claim-yield  Body: { private_key, project_id } */
  async claimYield(req: Request, res: Response) {
    try {
      const { private_key, project_id } = req.body;
      if (!private_key || project_id === undefined) {
        return res.status(400).json({ success: false, error: 'private_key and project_id are required' });
      }
      const userAccount = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(private_key) });
      const result = await projectTokenService.claimYield(userAccount, Number(project_id));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Claim yield failed' });
    }
  }

  // ── Admin writes ──────────────────────────────────────────────────────────────

  /** POST /api/admin/token/init-project  Body: { project_id, max_supply, nav_per_token, max_staleness_seconds } */
  async initProjectToken(req: Request, res: Response) {
    try {
      const { project_id, max_supply, nav_per_token, max_staleness_seconds } = req.body;
      if (project_id === undefined || max_supply === undefined || nav_per_token === undefined || max_staleness_seconds === undefined) {
        return res.status(400).json({
          success: false,
          error: 'project_id, max_supply, nav_per_token, and max_staleness_seconds are required',
        });
      }
      const adminAccount = getAdminAccount();
      if (!adminAccount) return res.status(500).json({ success: false, error: 'Admin credentials not configured' });

      const result = await projectTokenService.initializeProjectToken(
        adminAccount,
        Number(project_id),
        max_supply.toString(),
        nav_per_token.toString(),
        Number(max_staleness_seconds),
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Project token creation failed' });
    }
  }

  /** POST /api/admin/token/update-nav  Body: { project_id, new_nav, source_hash? } */
  async updateNav(req: Request, res: Response) {
    try {
      const { project_id, new_nav, source_hash } = req.body;
      if (project_id === undefined || new_nav === undefined) {
        return res.status(400).json({ success: false, error: 'project_id and new_nav are required' });
      }
      const adminAccount = getAdminAccount();
      if (!adminAccount) return res.status(500).json({ success: false, error: 'Admin credentials not configured' });

      const result = await projectTokenService.updateNav(
        adminAccount,
        Number(project_id),
        new_nav.toString(),
        (source_hash ?? '').toString(),
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'NAV update failed' });
    }
  }

  /** POST /api/admin/token/set-staleness  Body: { project_id, max_staleness_seconds } */
  async setMaxStaleness(req: Request, res: Response) {
    try {
      const { project_id, max_staleness_seconds } = req.body;
      if (project_id === undefined || max_staleness_seconds === undefined) {
        return res.status(400).json({ success: false, error: 'project_id and max_staleness_seconds are required' });
      }
      const adminAccount = getAdminAccount();
      if (!adminAccount) return res.status(500).json({ success: false, error: 'Admin credentials not configured' });

      const result = await projectTokenService.setMaxStaleness(
        adminAccount,
        Number(project_id),
        Number(max_staleness_seconds),
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'NAV staleness update failed' });
    }
  }

  /** POST /api/admin/token/set-lifecycle  Body: { project_id, new_lifecycle } */
  async setLifecycle(req: Request, res: Response) {
    try {
      const { project_id, new_lifecycle } = req.body;
      if (project_id === undefined || new_lifecycle === undefined) {
        return res.status(400).json({ success: false, error: 'project_id and new_lifecycle are required' });
      }
      const adminAccount = getAdminAccount();
      if (!adminAccount) return res.status(500).json({ success: false, error: 'Admin credentials not configured' });

      const result = await projectTokenService.setLifecycle(adminAccount, Number(project_id), Number(new_lifecycle));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Lifecycle update failed' });
    }
  }

  /** POST /api/admin/token/distribute-yield  Body: { project_id, yield_amount } */
  async distributeYield(req: Request, res: Response) {
    try {
      const { project_id, yield_amount } = req.body;
      if (project_id === undefined || !yield_amount) {
        return res.status(400).json({ success: false, error: 'project_id and yield_amount are required' });
      }
      const adminAccount = getAdminAccount();
      if (!adminAccount) return res.status(500).json({ success: false, error: 'Admin credentials not configured' });

      const result = await projectTokenService.distributeYield(adminAccount, Number(project_id), yield_amount.toString());
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Yield distribution failed' });
    }
  }

  /** POST /api/admin/token/force-burn  Body: { project_id, holder, amount, reason_code } */
  async forceBurn(req: Request, res: Response) {
    try {
      const { project_id, holder, amount, reason_code } = req.body;
      if (project_id === undefined || !holder || !amount || reason_code === undefined) {
        return res.status(400).json({
          success: false,
          error: 'project_id, holder, amount, and reason_code are required',
        });
      }
      const adminAccount = getAdminAccount();
      if (!adminAccount) return res.status(500).json({ success: false, error: 'Admin credentials not configured' });

      const result = await projectTokenService.adminForceBurn(
        adminAccount,
        Number(project_id),
        holder,
        amount.toString(),
        Number(reason_code),
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Force burn failed' });
    }
  }
}

export const projectTokenController = new ProjectTokenController();
