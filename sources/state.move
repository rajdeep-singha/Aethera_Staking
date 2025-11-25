module aethera_staking::state {
    use std::signer;
    use std::timestamp;
    use aptos_framework::coin;     
    use aptos_framework::coin::Coin;
    use aptos_framework::aptos_coin::AptosCoin;
    // use aptos_framework::error;

    use aethera_staking::helpers; 

    // Error codes
    const E_AMOUNT_ZERO: u64 = 1;
    const E_UNSTAKE_TOO_EARLY: u64 = 2;
    const E_NO_REWARD_AVAILABLE: u64 = 3;


    struct VaultAccount has key {
        authority: address,
        staked_amount: u64,
        apy_rate: u64,
        vault_coins: Coin<AptosCoin>,
    }

    struct PlayerAccount has key {
        staked_time: u64,
        staked_amount: u64,
        reward_time: u64,
        duration_time: u64,
        reward_amount: u64,
    }

    public entry fun initialize(authority: &signer, apy_rate: u64){

        let vault_data = VaultAccount {
            authority: signer::address_of(authority),
            staked_amount: 0,
            apy_rate,
            vault_coins: coin::zero<AptosCoin>(),
        };
        move_to(authority, vault_data);
    }


    public entry fun deposit(
    player: &signer,
    vault_authority: address,
    amount: u64
    )
     acquires VaultAccount {
        assert!(amount > 0, E_AMOUNT_ZERO);

        let vault_data = borrow_global_mut<VaultAccount>(vault_authority);
        vault_data.staked_amount = vault_data.staked_amount + amount;

        let coins = helpers::transfer_lamports(player, amount);
        coin::merge(&mut vault_data.vault_coins, coins);
    }
    


    public entry fun sol_stake(player: &signer, vault_authority: address,amount: u64,duration: u64) 
    
        acquires VaultAccount, PlayerAccount {
       assert!(amount > 0, E_AMOUNT_ZERO);


        let player_addr = signer::address_of(player);
        let vault_data = borrow_global_mut<VaultAccount>(vault_authority);
        
        let current_time = timestamp::now_seconds();

        if (!exists<PlayerAccount>(player_addr)) {
            move_to(player, PlayerAccount {
                staked_time: current_time,
                staked_amount: 0,
                reward_time: current_time,
                duration_time: 0,
                reward_amount: 0,
            });
        };

        let player_data = borrow_global_mut<PlayerAccount>(player_addr);

        player_data.staked_amount = player_data.staked_amount + amount;
        player_data.staked_time = current_time;
        player_data.duration_time = duration;
        player_data.reward_time = current_time;
        vault_data.staked_amount = vault_data.staked_amount + amount;

        let coins = helpers::transfer_lamports(player, amount);
        coin::merge(&mut vault_data.vault_coins, coins);
    }
    




    public entry fun sol_unstake(player: &signer,vault_authority: address)
        acquires VaultAccount, PlayerAccount {
        let player_addr = signer::address_of(player);
        let vault_data = borrow_global_mut<VaultAccount>(vault_authority);
        let player_data = borrow_global_mut<PlayerAccount>(player_addr);

        let current_time = timestamp::now_seconds();
        let staked_duration = current_time - player_data.staked_time;

        assert!(staked_duration >= player_data.duration_time, E_UNSTAKE_TOO_EARLY);


        let amount = player_data.staked_amount;

        player_data.staked_amount = 0;
        vault_data.staked_amount = vault_data.staked_amount - amount;

        let coins = coin::extract(&mut vault_data.vault_coins, amount);
        helpers::transfer_coins_to_player(player, coins);
    }
    


    public entry fun claim_rewards(player: &signer,vault_authority: address)
        acquires VaultAccount, PlayerAccount {
        let player_addr = signer::address_of(player);
        let vault_data = borrow_global_mut<VaultAccount>(vault_authority);
        let player_data = borrow_global_mut<PlayerAccount>(player_addr);

        let current_time = timestamp::now_seconds();
        let elapsed_time = current_time - player_data.reward_time;

        let reward = (player_data.staked_amount * vault_data.apy_rate * elapsed_time) / (365 * 24 * 60 * 60 * 100);

        assert!(reward > 0, E_NO_REWARD_AVAILABLE);


        player_data.reward_amount = player_data.reward_amount + reward;
        player_data.reward_time = current_time;

        let reward_coins = coin::extract(&mut vault_data.vault_coins, reward);
        helpers::transfer_coins_to_player(player, reward_coins);
    }


    public entry fun withdraw(authority: &signer)
        acquires VaultAccount {
        let vault_data = borrow_global_mut<VaultAccount>(signer::address_of(authority));

        let coins = coin::extract(&mut vault_data.vault_coins, vault_data.staked_amount);
        helpers::transfer_coins_to_player(authority, coins);

        vault_data.staked_amount = 0;
    }
}