module aethera_staking::helpers {
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use std::signer;

    const PRECISION_MULTIPLIER: u128 = 281474976710656; // 2^48

    public fun transfer_lamports(from: &signer, amount: u64): Coin<AptosCoin> {
        coin::withdraw<AptosCoin>(from, amount)
    }

    public fun transfer_lamports_from_owned_pda(vault_coins: &mut Coin<AptosCoin>, amount: u64): Coin<AptosCoin> {
        coin::extract(vault_coins, amount)
    }

    public fun transfer_coins_to_player(
        to: &signer,
        coins: Coin<AptosCoin>
    ) {
        coin::deposit<AptosCoin>(signer::address_of(to), coins);
    }
}
