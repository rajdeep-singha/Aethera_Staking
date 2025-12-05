import { aptos, MODULE_FUNCTIONS, CONTRACT_CONFIG, aptToOctas, octasToApt } from '../config/aptos.config';
import { Account, AccountAddress, Aptos } from '@aptos-labs/ts-sdk';
import { VaultInfo, PlayerInfo, TransactionResponse, StakingStats } from '../models/types';

export class StakingService {
  
  /**
   * Get vault information
   */
  async getVaultInfo(vaultAuthority: string): Promise<VaultInfo | null> {
    try {
      const resource = await aptos.getAccountResource({
        accountAddress: vaultAuthority,
        resourceType: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::VaultAccount`,
      });

      const data = resource.data as any;

      return {
        authority: data.authority,
        staked_amount: data.staked_amount,
        apy_rate: data.apy_rate,
        vault_balance: data.vault_coins?.value || '0',
      };
    } catch (error) {
      console.error('Error fetching vault info:', error);
      return null;
    }
  }

  /**
   * Get player staking information
   */
  async getPlayerInfo(playerAddress: string): Promise<PlayerInfo | null> {
    try {
      const resource = await aptos.getAccountResource({
        accountAddress: playerAddress,
        resourceType: `${CONTRACT_CONFIG.CONTRACT_ADDRESS}::state::PlayerAccount`,
      });

      const data = resource.data as any;
      const currentTime = Math.floor(Date.now() / 1000);
      const unlockTime = Number(data.staked_time) + Number(data.duration_time);

      // Calculate pending rewards (matching contract formula: staked_amount * apy_rate * elapsed_time / (365 * 24 * 60 * 60 * 100))
      const vaultInfo = await this.getVaultInfo(CONTRACT_CONFIG.VAULT_AUTHORITY);
      const timeSinceLastClaim = currentTime - Number(data.reward_time);
      const pendingRewards = vaultInfo 
        ? Math.floor(Number(data.staked_amount) * Number(vaultInfo.apy_rate) * timeSinceLastClaim / (31536000 * 100)).toString()
        : '0';

      return {
        staked_time: data.staked_time,
        staked_amount: data.staked_amount,
        reward_time: data.reward_time,
        duration_time: data.duration_time,
        reward_amount: data.reward_amount,
        pending_rewards: pendingRewards,
        unlock_time: unlockTime.toString(),
        is_unlocked: currentTime >= unlockTime,
      };
    } catch (error) {
      console.error('Error fetching player info:', error);
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
        total_staked: vaultInfo.staked_amount,
        total_stakers: totalStakers,
        apy_rate: vaultInfo.apy_rate,
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
      const resources = await aptos.getAccountResources({
        accountAddress: address,
      });

      const accountResource = resources.find(
        (r) => r.type === '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>'
      );

      return (accountResource?.data as any)?.coin?.value || '0';
    } catch (error) {
      console.error('Error fetching account balance:', error);
      return '0';
    }
  }
}

export const stakingService = new StakingService();