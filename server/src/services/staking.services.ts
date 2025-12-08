import { aptos, MODULE_FUNCTIONS, CONTRACT_CONFIG, aptToOctas, octasToApt } from '../config/aptos.config';
import { Account, AccountAddress, Aptos } from '@aptos-labs/ts-sdk';
import { VaultInfo, PlayerInfo, TransactionResponse, StakingStats } from '../models/types';

export class StakingService {
  
  /**
   * Get vault information
   */
  async getVaultInfo(vaultAuthority: string): Promise<VaultInfo | null> {
    try {
      const resourceType = `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::VaultAccount` as `${string}::${string}::${string}`;
      console.log('Fetching vault resource:', resourceType, 'from:', vaultAuthority);
      
      const resource = await aptos.getAccountResource({
        accountAddress: vaultAuthority,
        resourceType: resourceType,
      });

      console.log('Vault resource response:', JSON.stringify(resource, null, 2));

      // Handle different response formats - SDK might return data directly or nested
      const data = (resource as any).data || resource;
      
      if (!data || !data.authority) {
        console.log('Vault data structure invalid:', data);
        return null;
      }

      const totalStaked = data.staked_amount?.toString() || '0';
      const vaultBalance = data.vault_coins?.value?.toString() || '0';
      
      return {
        authority: data.authority,
        total_staked: totalStaked,
        total_staked_apt: (Number(totalStaked) / 100_000_000).toFixed(8),
        apy_rate: Number(data.apy_rate) || 10,
        vault_balance: vaultBalance,
        vault_balance_apt: (Number(vaultBalance) / 100_000_000).toFixed(8),
      };
    } catch (error: any) {
      // Resource not found is expected for uninitialized vault
      if (error.message?.includes('Resource not found') || error.status === 404) {
        console.log('Vault not initialized yet');
      } else {
        console.error('Error fetching vault info:', error.message || error);
      }
      return null;
    }
  }

  /**
   * Get player staking information
   */
  async getPlayerInfo(playerAddress: string): Promise<PlayerInfo | null> {
    try {
      const resourceType = `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::PlayerAccount` as `${string}::${string}::${string}`;
      console.log('Fetching player resource:', resourceType, 'for:', playerAddress);
      
      const resource = await aptos.getAccountResource({
        accountAddress: playerAddress,
        resourceType: resourceType,
      });

      console.log('Player resource response:', JSON.stringify(resource, null, 2));

      // Handle different response formats
      const data = (resource as any).data || resource;
      
      if (!data || data.staked_time === undefined) {
        console.log('Player data structure invalid:', data);
        return null;
      }

      const currentTime = Math.floor(Date.now() / 1000);
      const stakeTimestamp = Number(data.staked_time);
      const lockDuration = Number(data.duration_time);
      const unlockTimestamp = stakeTimestamp + lockDuration;
      const timeRemaining = Math.max(0, unlockTimestamp - currentTime);
      const isLocked = currentTime < unlockTimestamp;

      // Calculate pending rewards (matching contract formula: staked_amount * apy_rate * elapsed_time / (365 * 24 * 60 * 60 * 100))
      const vaultInfo = await this.getVaultInfo(CONTRACT_CONFIG.VAULT_AUTHORITY);
      const timeSinceLastClaim = currentTime - Number(data.reward_time);
      const stakedAmount = data.staked_amount?.toString() || '0';
      const pendingRewards = vaultInfo 
        ? Math.floor(Number(stakedAmount) * Number(vaultInfo.apy_rate) * timeSinceLastClaim / (31536000 * 100)).toString()
        : '0';

      return {
        address: playerAddress,
        staked_amount: stakedAmount,
        staked_amount_apt: (Number(stakedAmount) / 100_000_000).toFixed(8),
        stake_timestamp: stakeTimestamp,
        lock_duration: lockDuration,
        unlock_timestamp: unlockTimestamp,
        is_locked: isLocked,
        time_remaining: timeRemaining,
        pending_rewards: pendingRewards,
        pending_rewards_apt: (Number(pendingRewards) / 100_000_000).toFixed(8),
      };
    } catch (error: any) {
      // Resource not found is expected for users who haven't staked
      if (error.message?.includes('Resource not found') || error.status === 404) {
        console.log('Player has not staked yet:', playerAddress);
      } else {
        console.error('Error fetching player info:', error.message || error);
      }
      return null;
    }
  }

  /**
   * Get staking statistics
   */
  async getStakingStats(): Promise<StakingStats | null> {
    try {
      const vaultInfo = await this.getVaultInfo(CONTRACT_CONFIG.VAULT_AUTHORITY);
      
      if (!vaultInfo) return null;

      // TODO: Implement total stakers count by tracking events or maintaining a separate index
      const totalStakers = 0; // Placeholder

      return {
        total_staked: vaultInfo.total_staked,
        total_stakers: totalStakers,
        apy_rate: String(vaultInfo.apy_rate),
        vault_balance: vaultInfo.vault_balance,
      };
    } catch (error) {
      console.error('Error fetching staking stats:', error);
      return null;
    }
  }

  /**
   * Stake tokens (user transaction)
   */
  async stake(
    userAccount: Account,
    amount: string,
    durationSeconds: number
  ): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: userAccount.accountAddress,
        data: {
          function: MODULE_FUNCTIONS.SOL_STAKE as `${string}::${string}::${string}`,
          functionArguments: [
            CONTRACT_CONFIG.VAULT_AUTHORITY,
            amount,
            durationSeconds,
          ],
        },
      });

      const committedTxn = await aptos.signAndSubmitTransaction({
        signer: userAccount,
        transaction,
      });

      const executedTransaction = await aptos.waitForTransaction({
        transactionHash: committedTxn.hash,
      });

      return {
        success: executedTransaction.success,
        transaction_hash: committedTxn.hash,
        message: 'Staking successful',
      };
    } catch (error: any) {
      console.error('Error staking:', error);
      return {
        success: false,
        error: error.message || 'Staking failed',
      };
    }
  }

  /**
   * Unstake tokens (user transaction)
   */
  async unstake(userAccount: Account): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: userAccount.accountAddress,
        data: {
          function: MODULE_FUNCTIONS.SOL_UNSTAKE as `${string}::${string}::${string}`,// Fixing incorrect function reference
          functionArguments: [CONTRACT_CONFIG.VAULT_AUTHORITY],
        },
      });

      const committedTxn = await aptos.signAndSubmitTransaction({
        signer: userAccount,
        transaction,
      });

      const executedTransaction = await aptos.waitForTransaction({
        transactionHash: committedTxn.hash,
      });

      return {
        success: executedTransaction.success,
        transaction_hash: committedTxn.hash,
        message: 'Unstaking successful',
      };
    } catch (error: any) {
      console.error('Error unstaking:', error);
      return {
        success: false,
        error: error.message || 'Unstaking failed',
      };
    }
  }

  /**
   * Claim rewards (user transaction)
   */
  async claimRewards(userAccount: Account): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: userAccount.accountAddress,
        data: {
          function: MODULE_FUNCTIONS.CLAIM_REWARDS as `${string}::${string}::${string}`,// Fixing incorrect function reference
          functionArguments: [CONTRACT_CONFIG.VAULT_AUTHORITY],
        },
      });

      const committedTxn = await aptos.signAndSubmitTransaction({
        signer: userAccount,
        transaction,
      });

      const executedTransaction = await aptos.waitForTransaction({
        transactionHash: committedTxn.hash,
      });

      return {
        success: executedTransaction.success,
        transaction_hash: committedTxn.hash,
        message: 'Rewards claimed successfully',
      };
    } catch (error: any) {
      console.error('Error claiming rewards:', error);
      return {
        success: false,
        error: error.message || 'Claiming rewards failed',
      };
    }
  }

  /**
   * Admin: Update APY configuration
   */
  async updateApyRate(adminAccount: Account, apyRate: number): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: adminAccount.accountAddress,
        data: {
          function: MODULE_FUNCTIONS.CONFIG as `${string}::${string}::${string}`,
          functionArguments: [apyRate],
        },
      });

      const committedTxn = await aptos.signAndSubmitTransaction({
        signer: adminAccount,
        transaction,
      });

      const executedTransaction = await aptos.waitForTransaction({
        transactionHash: committedTxn.hash,
      });

      return {
        success: executedTransaction.success,
        transaction_hash: committedTxn.hash,
        message: 'APY rate updated successfully',
      };
    } catch (error: any) {
      console.error('Error updating APY:', error);
      return {
        success: false,
        error: error.message || 'APY update failed',
      };
    }
  }

  /**
   * Admin: Deposit funds to vault
   */
  async deposit(adminAccount: Account, amount: string): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: adminAccount.accountAddress,
        data: {
          function: MODULE_FUNCTIONS.DEPOSIT as `${string}::${string}::${string}`, // Fixing incorrect function reference
          functionArguments: [CONTRACT_CONFIG.VAULT_AUTHORITY, amount],
        },
      });

      const committedTxn = await aptos.signAndSubmitTransaction({
        signer: adminAccount,
        transaction,
      });

      const executedTransaction = await aptos.waitForTransaction({
        transactionHash: committedTxn.hash,
      });

      return {
        success: executedTransaction.success,
        transaction_hash: committedTxn.hash,
        message: 'Deposit successful',
      };
    } catch (error: any) {
      console.error('Error depositing:', error);
      return {
        success: false,
        error: error.message || 'Deposit failed',
      };
    }
  }

  /**
   * Admin: Withdraw all funds from vault
   */
  async withdraw(adminAccount: Account): Promise<TransactionResponse> {
    try {
      const transaction = await aptos.transaction.build.simple({
        sender: adminAccount.accountAddress,
        data: {
          function: MODULE_FUNCTIONS.WITHDRAW as `${string}::${string}::${string}`, // Fixing incorrect function reference
          functionArguments: [],
        },
      });

      const committedTxn = await aptos.signAndSubmitTransaction({
        signer: adminAccount,
        transaction,
      });

      const executedTransaction = await aptos.waitForTransaction({
        transactionHash: committedTxn.hash,
      });

      return {
        success: executedTransaction.success,
        transaction_hash: committedTxn.hash,
        message: 'Withdrawal successful',
      };
    } catch (error: any) {
      console.error('Error withdrawing:', error);
      return {
        success: false,
        error: error.message || 'Withdrawal failed',
      };
    }
  }

  /**
   * Get account balance
   */
  async getAccountBalance(address: string): Promise<string> {
    try {
      // Use the dedicated method to get APT balance
      const balance = await aptos.getAccountAPTAmount({
        accountAddress: address,
      });
      console.log(`Balance for ${address}: ${balance}`);
      return balance.toString();
    } catch (error) {
      console.error('Error fetching account balance:', error);
      // Fallback to resources method
      try {
        const resources = await aptos.getAccountResources({
          accountAddress: address,
        });
        const accountResource = resources.find(
          (r) => r.type === '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>'
        );
        return (accountResource?.data as any)?.coin?.value || '0';
      } catch (fallbackError) {
        console.error('Fallback balance fetch also failed:', fallbackError);
        return '0';
      }
    }
  }
}

export const stakingService = new StakingService();