import { Request, Response } from 'express';
import { stakingService } from '../services/staking.services';
import { Account, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';
import { CONTRACT_CONFIG } from '../config/aptos.config';

export class StakingController {
  
  /**
   * GET /api/vault/info
   * Get vault information
   */
  async getVaultInfo(req: Request, res: Response) {
    try {
      const vaultInfo = await stakingService.getVaultInfo(CONTRACT_CONFIG.VAULT_AUTHORITY);
      
      if (!vaultInfo) {
        return res.status(404).json({
          success: false,
          error: 'Vault not found',
        });
      }

      res.json({
        success: true,
        data: vaultInfo,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch vault info',
      });
    }
  }

  /**
   * GET /api/player/:address
   * Get player staking information
   */
  async getPlayerInfo(req: Request, res: Response) {
    try {
      const { address } = req.params;

      if (!address) {
        return res.status(400).json({
          success: false,
          error: 'Player address is required',
        });
      }

      const playerInfo = await stakingService.getPlayerInfo(address);

      if (!playerInfo) {
        return res.status(404).json({
          success: false,
          error: 'Player staking data not found',
        });
      }

      res.json({
        success: true,
        data: playerInfo,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch player info',
      });
    }
  }

  /**
   * GET /api/stats
   * Get staking statistics
   */
  async getStats(req: Request, res: Response) {
    try {
      const stats = await stakingService.getStakingStats();

      if (!stats) {
        return res.status(404).json({
          success: false,
          error: 'Stats not available',
        });
      }

      res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch stats',
      });
    }
  }

  /**
   * GET /api/balance/:address
   * Get account balance
   */
  async getBalance(req: Request, res: Response) {
    try {
      const { address } = req.params;

      if (!address) {
        return res.status(400).json({
          success: false,
          error: 'Address is required',
        });
      }

      const balance = await stakingService.getAccountBalance(address);

      res.json({
        success: true,
        data: {
          address,
          balance,
          balance_apt: (Number(balance) / 100_000_000).toFixed(8),
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch balance',
      });
    }
  }

  /**
   * POST /api/stake/simulate
   * Simulate staking transaction (returns estimated rewards)
   */
  async simulateStake(req: Request, res: Response) {
    try {
      const { amount, duration_seconds } = req.body;

      if (!amount || !duration_seconds) {
        return res.status(400).json({
          success: false,
          error: 'Amount and duration are required',
        });
      }

      const vaultInfo = await stakingService.getVaultInfo(CONTRACT_CONFIG.VAULT_AUTHORITY);
      
      if (!vaultInfo) {
        return res.status(404).json({
          success: false,
          error: 'Vault not found',
        });
      }

      // Calculate estimated rewards (matching contract: amount * apy_rate * duration / (365 * 24 * 60 * 60 * 100))
      const estimatedRewards = (Number(amount) * Number(vaultInfo.apy_rate) * duration_seconds) / (31536000 * 100);

      res.json({
        success: true,
        data: {
          amount,
          duration_seconds,
          apy_rate: vaultInfo.apy_rate,
          estimated_rewards: Math.floor(estimatedRewards).toString(),
          estimated_rewards_apt: (estimatedRewards / 100_000_000).toFixed(8),
          unlock_timestamp: Math.floor(Date.now() / 1000) + duration_seconds,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Simulation failed',
      });
    }
  }

  /**
   * POST /api/admin/config
   * Update APY rate (Admin only)
   */
  async updateConfig(req: Request, res: Response) {
    try {
      const { apy_rate } = req.body;

      if (apy_rate === undefined) {
        return res.status(400).json({
          success: false,
          error: 'APY rate is required',
        });
      }

      // Get admin account from environment
      const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
      if (!adminPrivateKey) {
        return res.status(500).json({
          success: false,
          error: 'Admin credentials not configured',
        });
      }

      const privateKey = new Ed25519PrivateKey(adminPrivateKey);
      const adminAccount = Account.fromPrivateKey({ privateKey });

      const result = await stakingService.updateApyRate(adminAccount, apy_rate);

      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update config',
      });
    }
  }

  /**
   * POST /api/admin/deposit
   * Deposit funds to vault (Admin only)
   */
  async deposit(req: Request, res: Response) {
    try {
      const { amount } = req.body;

      if (!amount) {
        return res.status(400).json({
          success: false,
          error: 'Amount is required',
        });
      }

      const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
      if (!adminPrivateKey) {
        return res.status(500).json({
          success: false,
          error: 'Admin credentials not configured',
        });
      }

      const privateKey = new Ed25519PrivateKey(adminPrivateKey);
      const adminAccount = Account.fromPrivateKey({ privateKey });

      const result = await stakingService.deposit(adminAccount, amount);

      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Deposit failed',
      });
    }
  }

  /**
   * POST /api/admin/withdraw
   * Withdraw all funds from vault (Admin only)
   */
  async withdraw(req: Request, res: Response) {
    try {
      const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
      if (!adminPrivateKey) {
        return res.status(500).json({
          success: false,
          error: 'Admin credentials not configured',
        });
      }

      const privateKey = new Ed25519PrivateKey(adminPrivateKey);
      const adminAccount = Account.fromPrivateKey({ privateKey });

      const result = await stakingService.withdraw(adminAccount);

      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Withdrawal failed',
      });
    }
  }
}

export const stakingController = new StakingController();