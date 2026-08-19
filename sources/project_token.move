module aethera_staking::project_token {
    use std::signer;
    use std::string::{Self, String};
    use std::option;
    use std::bcs;

    use aptos_std::table::{Self, Table};

    use aptos_framework::object;
    use aptos_framework::fungible_asset::{Self, MintRef, BurnRef, TransferRef, Metadata};
    use aptos_framework::primary_fungible_store;
    use aptos_framework::account::{Self, SignerCapability};
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::timestamp;

    use aethera_staking::helpers;
    use aethera_staking::project_listing;

    // ------------------------------------------------------------------
    // Constants
    // ------------------------------------------------------------------
    /// Fixed-point precision for the yield-per-token accumulator (1e12).
    const PRECISION: u128 = 1_000_000_000_000;

    /// Named-object seed for each project's fungible asset (lives UNDER the
    /// project's own resource account, so the same seed is safe across projects).
    const TOKEN_SEED: vector<u8> = b"AETH_E_TOKEN";

    /// On-chain FA decimals. We keep this at 0 so that token amounts are whole
    /// units and the spec math `tokens = apt_amount / nav_per_token` is exact.
    /// (If you ever want fractional tokens, raise this and scale mint amounts.)
    const TOKEN_DECIMALS: u8 = 0;

    /// The aptos_framework::fungible_asset symbol limit is 10 chars, but project
    /// `token_symbol`s like "AETH-PHOENIX-01" are longer. So we use a short,
    /// constant on-chain FA SYMBOL and store the full human identifier as the FA
    /// NAME (32-char limit) + in ProjectTokenState.token_symbol for the app layer.
    const FA_SYMBOL: vector<u8> = b"AETH";

    // Lifecycle stages (strictly increasing, never rolled back).
    const LIFECYCLE_PRE_LAUNCH: u8 = 0;
    const LIFECYCLE_FUNDING: u8    = 1;
    const LIFECYCLE_ACTIVE: u8     = 2;
    const LIFECYCLE_MATURED: u8    = 3;
    const LIFECYCLE_CLOSED: u8     = 4;

    // ------------------------------------------------------------------
    // Error codes
    // ------------------------------------------------------------------
    const E_NOT_ADMIN: u64                = 1;
    const E_PROJECT_TOKEN_EXISTS: u64     = 2;
    const E_PROJECT_TOKEN_NOT_FOUND: u64  = 3;
    const E_INVALID_LIFECYCLE: u64        = 4;   // not strictly increasing / out of range
    const E_WRONG_LIFECYCLE: u64          = 5;   // action not allowed in current stage
    const E_NAV_STALE: u64                = 6;
    const E_NAV_ZERO: u64                 = 7;
    const E_ZERO_SUPPLY: u64              = 8;
    const E_ZERO_AMOUNT: u64              = 9;
    const E_NO_YIELD: u64                 = 10;
    const E_INSUFFICIENT_BALANCE: u64     = 11;

    // ------------------------------------------------------------------
    // Storage layout
    // ------------------------------------------------------------------

    /// (1) Lives at the admin / hub_authority address. Created once.
    struct ProjectTokenHub has key {
        admin:             address,
        project_authority: address,                       // ProjectRegistry address (for get_token_params)
        signer_caps:       Table<u64, SignerCapability>,  // project_id -> resource account cap
        states:            Table<u64, ProjectTokenState>, // project_id -> token state
        treasuries:        Table<u64, ProjectTreasuryState>,
    }

    /// (2) Lives at EACH PROJECT'S resource account address. Isolates mint authority
    /// per project: compromising the hub does not grant mint rights — you still need
    /// the project's SignerCapability to even reach these refs.
    struct ProjectTokenCaps has key {
        mint_ref:     MintRef,
        burn_ref:     BurnRef,
        transfer_ref: TransferRef,        // used ONLY by admin_force_burn
        yield_vault:  Coin<AptosCoin>,    // isolated APT pot for this project's yield
    }

    /// (3) Per-project token state (stored inside ProjectTokenHub.states).
    struct ProjectTokenState has store {
        token_metadata_addr:        address,
        lifecycle:                  u8,
        total_supply:               u64,    // tracked manually on mint/burn
        max_supply:                 u64,    // 0 = uncapped
        nav_per_token:              u64,    // octas per token
        nav_last_updated:           u64,
        max_staleness_seconds:      u64,
        cumulative_yield_per_token: u128,   // u128 to avoid overflow with PRECISION
        ppa_tenure_months:          u64,
        token_symbol:               String,
    }

    /// (4) Per-project treasury accounting (stored inside ProjectTokenHub.treasuries).
    struct ProjectTreasuryState has store {
        total_revenue_received:  u64,
        total_yield_distributed: u64,
        reserve_balance:         u64,   // e.g. 3-month reserve; not auto-distributed here
    }

    /// (5) Lives at EACH INVESTOR'S address.
    struct UserYieldState has key {
        yields: Table<u64, UserProjectYield>,   // project_id -> per-project yield tracking
    }

    /// (6) Per-(investor, project) yield snapshot (stored inside UserYieldState.yields).
    struct UserProjectYield has store {
        last_claimed_yield_per_token: u128,   // accumulator snapshot at last claim/first mint
        total_claimed:                u64,    // audit trail
    }

   
    // Admin functions
   

    /// Called ONCE, globally. Creates the hub at the admin's address.
    /// project_authority = the ProjectRegistry address (so we can read token params).
    public entry fun initialize(admin: &signer, project_authority: address) {
        move_to(admin, ProjectTokenHub {
            admin: signer::address_of(admin),
            project_authority,
            signer_caps: table::new<u64, SignerCapability>(),
            states:      table::new<u64, ProjectTokenState>(),
            treasuries:  table::new<u64, ProjectTreasuryState>(),
        });
    }

    /// Stand up a brand-new fungible asset for one project.
    /// Reads (token_symbol, ppa_months, _) from project_listing; uses the explicit
    /// `nav_per_token` argument for the on-chain NAV.
    public entry fun initialize_project_token(
        admin:                 &signer,
        hub_authority:         address,
        project_id:            u64,
        max_supply:            u64,    // 0 = uncapped
        nav_per_token:         u64,    // octas per token
        max_staleness_seconds: u64,
    ) acquires ProjectTokenHub {
        let hub = borrow_global_mut<ProjectTokenHub>(hub_authority);
        assert!(signer::address_of(admin) == hub.admin, E_NOT_ADMIN);
        assert!(!table::contains(&hub.signer_caps, project_id), E_PROJECT_TOKEN_EXISTS);

        // Pull the human-readable params the admin set on the listing.
        let project_authority = hub.project_authority;
        let (token_symbol, ppa_months, _nav_ignored) =
            project_listing::get_token_params(project_authority, project_id);

        // Deterministic resource account, one per project (seed = project_id bytes).
        let (resource_signer, signer_cap) =
            account::create_resource_account(admin, bcs::to_bytes(&project_id));

        // Create the fungible asset as a named object under the resource account.
        let max_supply_opt = if (max_supply == 0) {
            option::none<u128>()
        } else {
            option::some<u128>((max_supply as u128))
        };

        let constructor_ref = object::create_named_object(&resource_signer, TOKEN_SEED);
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            &constructor_ref,
            max_supply_opt,
            token_symbol,                 // FA NAME (<=32 chars) = full human identifier
            string::utf8(FA_SYMBOL),      // FA SYMBOL (<=10 chars) = short constant
            TOKEN_DECIMALS,
            string::utf8(b""),            // icon_uri
            string::utf8(b""),            // project_uri
        );

        let mint_ref     = fungible_asset::generate_mint_ref(&constructor_ref);
        let burn_ref     = fungible_asset::generate_burn_ref(&constructor_ref);
        let transfer_ref = fungible_asset::generate_transfer_ref(&constructor_ref);

        let metadata_obj  = object::object_from_constructor_ref<Metadata>(&constructor_ref);
        let metadata_addr = object::object_address(&metadata_obj);

        // Park the caps + empty yield vault at the project's resource account.
        move_to(&resource_signer, ProjectTokenCaps {
            mint_ref,
            burn_ref,
            transfer_ref,
            yield_vault: coin::zero<AptosCoin>(),
        });

        let now = timestamp::now_seconds();

        table::add(&mut hub.signer_caps, project_id, signer_cap);
        table::add(&mut hub.states, project_id, ProjectTokenState {
            token_metadata_addr:        metadata_addr,
            lifecycle:                  LIFECYCLE_PRE_LAUNCH,
            total_supply:               0,
            max_supply,
            nav_per_token,
            nav_last_updated:           now,
            max_staleness_seconds,
            cumulative_yield_per_token: 0,
            ppa_tenure_months:          ppa_months,
            token_symbol,
        });
        table::add(&mut hub.treasuries, project_id, ProjectTreasuryState {
            total_revenue_received:  0,
            total_yield_distributed: 0,
            reserve_balance:         0,
        });
    }

    /// Advance lifecycle. Strictly increasing, capped at CLOSED.
    public entry fun set_lifecycle(
        admin:         &signer,
        hub_authority: address,
        project_id:    u64,
        new_lifecycle: u8,
    ) acquires ProjectTokenHub {
        let hub = borrow_global_mut<ProjectTokenHub>(hub_authority);
        assert!(signer::address_of(admin) == hub.admin, E_NOT_ADMIN);
        assert!(table::contains(&hub.states, project_id), E_PROJECT_TOKEN_NOT_FOUND);
        assert!(new_lifecycle <= LIFECYCLE_CLOSED, E_INVALID_LIFECYCLE);

        let state = table::borrow_mut(&mut hub.states, project_id);
        assert!(new_lifecycle > state.lifecycle, E_INVALID_LIFECYCLE); // no going back
        state.lifecycle = new_lifecycle;
    }

    /// Update NAV. `source_hash` is accepted for off-chain auditability (emit an
    /// event in production). Allowed at any lifecycle.
    public entry fun update_nav(
        admin:         &signer,
        hub_authority: address,
        project_id:    u64,
        new_nav:       u64,
        source_hash:   String,
    ) acquires ProjectTokenHub {
        let hub = borrow_global_mut<ProjectTokenHub>(hub_authority);
        assert!(signer::address_of(admin) == hub.admin, E_NOT_ADMIN);
        assert!(table::contains(&hub.states, project_id), E_PROJECT_TOKEN_NOT_FOUND);

        let state = table::borrow_mut(&mut hub.states, project_id);
        state.nav_per_token  = new_nav;
        state.nav_last_updated = timestamp::now_seconds();
        let _ = source_hash; // retained for auditability; emit event in production
    }

    /// Adjust how long a NAV is trusted before staking is blocked with E_NAV_STALE.
    /// NAV here is a slow-moving, operator-attested valuation (revalued per the PPA
    /// schedule, not tick-by-tick), so this window is measured in days, e.g. 90 days
    /// = 7_776_000 seconds. Lets an already-initialized project be retuned without a
    /// re-init. Allowed at any lifecycle.
    public entry fun set_max_staleness_seconds(
        admin:         &signer,
        hub_authority: address,
        project_id:    u64,
        new_max_staleness_seconds: u64,
    ) acquires ProjectTokenHub {
        let hub = borrow_global_mut<ProjectTokenHub>(hub_authority);
        assert!(signer::address_of(admin) == hub.admin, E_NOT_ADMIN);
        assert!(table::contains(&hub.states, project_id), E_PROJECT_TOKEN_NOT_FOUND);

        let state = table::borrow_mut(&mut hub.states, project_id);
        state.max_staleness_seconds = new_max_staleness_seconds;
    }

    /// Distribute revenue as yield. APT comes from the admin and lands in the
    /// project's isolated yield vault in the SAME transaction the accounting moves.
    public entry fun distribute_yield(
        admin:         &signer,
        hub_authority: address,
        project_id:    u64,
        yield_amount:  u64,
    ) acquires ProjectTokenHub, ProjectTokenCaps {
        assert!(yield_amount > 0, E_ZERO_AMOUNT);

        let hub = borrow_global_mut<ProjectTokenHub>(hub_authority);
        assert!(signer::address_of(admin) == hub.admin, E_NOT_ADMIN);
        assert!(table::contains(&hub.states, project_id), E_PROJECT_TOKEN_NOT_FOUND);

        // Update the per-token accumulator.
        {
            let state = table::borrow_mut(&mut hub.states, project_id);
            assert!(
                state.lifecycle == LIFECYCLE_ACTIVE || state.lifecycle == LIFECYCLE_MATURED,
                E_WRONG_LIFECYCLE
            );
            assert!(state.total_supply > 0, E_ZERO_SUPPLY);
            state.cumulative_yield_per_token = state.cumulative_yield_per_token
                + ((yield_amount as u128) * PRECISION) / (state.total_supply as u128);
        };

        // Treasury accounting.
        {
            let treasury = table::borrow_mut(&mut hub.treasuries, project_id);
            treasury.total_revenue_received  = treasury.total_revenue_received + yield_amount;
            treasury.total_yield_distributed = treasury.total_yield_distributed + yield_amount;
        };

        // Move the APT into the project's vault.
        let resource_addr =
            account::get_signer_capability_address(table::borrow(&hub.signer_caps, project_id));
        let coins = helpers::transfer_lamports(admin, yield_amount);
        let caps = borrow_global_mut<ProjectTokenCaps>(resource_addr);
        coin::merge(&mut caps.yield_vault, coins);
    }

    /// Compliance burn — pulls tokens straight out of a holder's store using the
    /// TransferRef (no holder signature needed), then burns them.
    /// reason_code: 0 = AML, 1 = court_order, 2 = compliance.
    public entry fun admin_force_burn(
        admin:         &signer,
        hub_authority: address,
        project_id:    u64,
        holder:        address,
        amount:        u64,
        reason_code:   u8,
    ) acquires ProjectTokenHub, ProjectTokenCaps {
        assert!(amount > 0, E_ZERO_AMOUNT);

        let hub = borrow_global_mut<ProjectTokenHub>(hub_authority);
        assert!(signer::address_of(admin) == hub.admin, E_NOT_ADMIN);
        assert!(table::contains(&hub.states, project_id), E_PROJECT_TOKEN_NOT_FOUND);

        let metadata_addr = {
            let state = table::borrow_mut(&mut hub.states, project_id);
            assert!(state.total_supply >= amount, E_INSUFFICIENT_BALANCE);
            state.total_supply = state.total_supply - amount;
            state.token_metadata_addr
        };

        let resource_addr =
            account::get_signer_capability_address(table::borrow(&hub.signer_caps, project_id));
        let caps = borrow_global<ProjectTokenCaps>(resource_addr);

        let metadata = object::address_to_object<Metadata>(metadata_addr);
        let store = primary_fungible_store::primary_store(holder, metadata);
        let fa = fungible_asset::withdraw_with_ref(&caps.transfer_ref, store, amount);
        fungible_asset::burn(&caps.burn_ref, fa);

        let _ = reason_code; // emit event with reason in production
    }

    // Investor functions

    /// Mint project tokens for an investor who just staked. Called CROSS-MODULE by
    /// state::sol_stake (hence `public fun`, not `entry`). Returns the number of
    /// tokens minted so the staking module can record it against the stake position.
    ///
    /// NAV math lives here: tokens = apt_amount / nav_per_token (integer). Staking
    /// less than 1 NAV unit mints 0 tokens and simply returns 0 (no abort).
    public fun mint_to_investor(
        investor:      &signer,
        hub_authority: address,
        project_id:    u64,
        apt_amount:    u64,
    ): u64 acquires ProjectTokenHub, ProjectTokenCaps, UserYieldState {
        let investor_addr = signer::address_of(investor);

        let hub = borrow_global_mut<ProjectTokenHub>(hub_authority);
        assert!(table::contains(&hub.states, project_id), E_PROJECT_TOKEN_NOT_FOUND);

        let (nav, cumulative, metadata_addr) = {
            let state = table::borrow_mut(&mut hub.states, project_id);
            assert!(
                state.lifecycle == LIFECYCLE_FUNDING || state.lifecycle == LIFECYCLE_ACTIVE,
                E_WRONG_LIFECYCLE
            );
            // NAV staleness guard.
            let now = timestamp::now_seconds();
            assert!(now - state.nav_last_updated <= state.max_staleness_seconds, E_NAV_STALE);
            (state.nav_per_token, state.cumulative_yield_per_token, state.token_metadata_addr)
        };

        assert!(nav > 0, E_NAV_ZERO);
        let tokens_to_mint = apt_amount / nav;
        if (tokens_to_mint == 0) {
            return 0   // staked < 1 NAV unit: stake still recorded upstream, just no tokens
        };

        // Bump tracked supply.
        {
            let state = table::borrow_mut(&mut hub.states, project_id);
            state.total_supply = state.total_supply + tokens_to_mint;
        };

        // Mint into the investor's primary store.
        let resource_addr =
            account::get_signer_capability_address(table::borrow(&hub.signer_caps, project_id));
        let metadata = object::address_to_object<Metadata>(metadata_addr);
        {
            let caps = borrow_global<ProjectTokenCaps>(resource_addr);
            let fa = fungible_asset::mint(&caps.mint_ref, tokens_to_mint);
            primary_fungible_store::deposit(investor_addr, fa);
        };

        // Ensure the investor has a UserYieldState, and a per-project entry.
        if (!exists<UserYieldState>(investor_addr)) {
            move_to(investor, UserYieldState { yields: table::new<u64, UserProjectYield>() });
        };
        {
            let uys = borrow_global_mut<UserYieldState>(investor_addr);
            if (!table::contains(&uys.yields, project_id)) {
                // First stake on this project: snapshot the CURRENT accumulator so the
                // investor can never claim yield distributed before they held tokens.
                table::add(&mut uys.yields, project_id, UserProjectYield {
                    last_claimed_yield_per_token: cumulative,
                    total_claimed: 0,
                });
            };
            // Top-up: leave the existing snapshot untouched (preserves pending yield).
        };

        tokens_to_mint
    }

    /// Burn tokens tied to a stake position. Called CROSS-MODULE by state::sol_unstake.
    /// `amount` is the exact historical mint amount, NOT the investor's full balance.
    ///
    /// NOTE (per spec): this requires the investor to still hold >= `amount` tokens.
    /// If they transferred minted tokens away on a secondary market, unstake will
    /// abort here until they reacquire enough tokens. Tokens received via transfer
    /// beyond their staked position stay in their wallet.
    public fun burn_from_investor(
        investor:      &signer,
        hub_authority: address,
        project_id:    u64,
        amount:        u64,
    ) acquires ProjectTokenHub, ProjectTokenCaps {
        if (amount == 0) { return };
        let investor_addr = signer::address_of(investor);

        let hub = borrow_global_mut<ProjectTokenHub>(hub_authority);
        assert!(table::contains(&hub.states, project_id), E_PROJECT_TOKEN_NOT_FOUND);

        let metadata_addr = {
            let state = table::borrow_mut(&mut hub.states, project_id);
            state.token_metadata_addr
        };
        let metadata = object::address_to_object<Metadata>(metadata_addr);

        // Secondary-market edge case guard.
        let bal = primary_fungible_store::balance(investor_addr, metadata);
        assert!(bal >= amount, E_INSUFFICIENT_BALANCE);

        {
            let state = table::borrow_mut(&mut hub.states, project_id);
            state.total_supply = state.total_supply - amount;
        };

        let resource_addr =
            account::get_signer_capability_address(table::borrow(&hub.signer_caps, project_id));
        let caps = borrow_global<ProjectTokenCaps>(resource_addr);
        let fa = primary_fungible_store::withdraw(investor, metadata, amount);
        fungible_asset::burn(&caps.burn_ref, fa);
        // Intentionally does NOT touch UserYieldState — any remaining tokens keep tracking yield.
    }

    /// Investor claims accrued APT yield for a project. Entry point (called from client).
    public entry fun claim_yield(
        investor:      &signer,
        hub_authority: address,
        project_id:    u64,
    ) acquires ProjectTokenHub, ProjectTokenCaps, UserYieldState {
        let investor_addr = signer::address_of(investor);

        let hub = borrow_global_mut<ProjectTokenHub>(hub_authority);
        assert!(table::contains(&hub.states, project_id), E_PROJECT_TOKEN_NOT_FOUND);

        let (cumulative, metadata_addr) = {
            let state = table::borrow_mut(&mut hub.states, project_id);
            assert!(
                state.lifecycle == LIFECYCLE_ACTIVE || state.lifecycle == LIFECYCLE_MATURED,
                E_WRONG_LIFECYCLE
            );
            (state.cumulative_yield_per_token, state.token_metadata_addr)
        };

        let metadata = object::address_to_object<Metadata>(metadata_addr);
        let token_balance = primary_fungible_store::balance(investor_addr, metadata);

        assert!(exists<UserYieldState>(investor_addr), E_NO_YIELD);
        let pending_u64 = {
            let uys = borrow_global_mut<UserYieldState>(investor_addr);
            assert!(table::contains(&uys.yields, project_id), E_NO_YIELD);
            let upy = table::borrow_mut(&mut uys.yields, project_id);

            let delta = cumulative - upy.last_claimed_yield_per_token;
            let pending = (delta * (token_balance as u128)) / PRECISION;
            assert!(pending > 0, E_NO_YIELD);

            let p = (pending as u64);
            upy.last_claimed_yield_per_token = cumulative; // snapshot forward
            upy.total_claimed = upy.total_claimed + p;
            p
        };

        // Pay out from the project's isolated yield vault.
        let resource_addr =
            account::get_signer_capability_address(table::borrow(&hub.signer_caps, project_id));
        let caps = borrow_global_mut<ProjectTokenCaps>(resource_addr);
        let coins = coin::extract(&mut caps.yield_vault, pending_u64);
        helpers::transfer_coins_to_player(investor, coins);
    }

   
    // View functions
   

    #[view]
    public fun get_token_balance(
        investor_addr: address,
        hub_authority: address,
        project_id:    u64,
    ): u64 acquires ProjectTokenHub {
        let hub = borrow_global<ProjectTokenHub>(hub_authority);
        assert!(table::contains(&hub.states, project_id), E_PROJECT_TOKEN_NOT_FOUND);
        let metadata_addr = table::borrow(&hub.states, project_id).token_metadata_addr;
        let metadata = object::address_to_object<Metadata>(metadata_addr);
        primary_fungible_store::balance(investor_addr, metadata)
    }

    #[view]
    public fun get_nav(hub_authority: address, project_id: u64): u64 acquires ProjectTokenHub {
        let hub = borrow_global<ProjectTokenHub>(hub_authority);
        assert!(table::contains(&hub.states, project_id), E_PROJECT_TOKEN_NOT_FOUND);
        table::borrow(&hub.states, project_id).nav_per_token
    }

    #[view]
    public fun get_lifecycle(hub_authority: address, project_id: u64): u8 acquires ProjectTokenHub {
        let hub = borrow_global<ProjectTokenHub>(hub_authority);
        assert!(table::contains(&hub.states, project_id), E_PROJECT_TOKEN_NOT_FOUND);
        table::borrow(&hub.states, project_id).lifecycle
    }

    #[view]
    public fun get_pending_yield(
        investor_addr: address,
        hub_authority: address,
        project_id:    u64,
    ): u64 acquires ProjectTokenHub, UserYieldState {
        let hub = borrow_global<ProjectTokenHub>(hub_authority);
        assert!(table::contains(&hub.states, project_id), E_PROJECT_TOKEN_NOT_FOUND);
        let state = table::borrow(&hub.states, project_id);
        let cumulative = state.cumulative_yield_per_token;
        let metadata = object::address_to_object<Metadata>(state.token_metadata_addr);

        if (!exists<UserYieldState>(investor_addr)) return 0;
        let uys = borrow_global<UserYieldState>(investor_addr);
        if (!table::contains(&uys.yields, project_id)) return 0;

        let upy = table::borrow(&uys.yields, project_id);
        let token_balance = primary_fungible_store::balance(investor_addr, metadata);
        let delta = cumulative - upy.last_claimed_yield_per_token;
        (((delta * (token_balance as u128)) / PRECISION) as u64)
    }

    #[view]
    public fun get_treasury_state(
        hub_authority: address,
        project_id:    u64,
    ): (u64, u64, u64) acquires ProjectTokenHub {
        let hub = borrow_global<ProjectTokenHub>(hub_authority);
        assert!(table::contains(&hub.treasuries, project_id), E_PROJECT_TOKEN_NOT_FOUND);
        let t = table::borrow(&hub.treasuries, project_id);
        (t.total_revenue_received, t.total_yield_distributed, t.reserve_balance)
    }

    #[view]
    public fun get_token_total_supply(
        hub_authority: address,
        project_id:    u64,
    ): u64 acquires ProjectTokenHub {
        let hub = borrow_global<ProjectTokenHub>(hub_authority);
        assert!(table::contains(&hub.states, project_id), E_PROJECT_TOKEN_NOT_FOUND);
        table::borrow(&hub.states, project_id).total_supply
    }

        #[view]
    public fun get_token_metadata_addr(
        hub_authority: address,
        project_id:    u64,
    ): address acquires ProjectTokenHub {
        let hub = borrow_global<ProjectTokenHub>(hub_authority);
        assert!(table::contains(&hub.states, project_id), E_PROJECT_TOKEN_NOT_FOUND);
        table::borrow(&hub.states, project_id).token_metadata_addr
    }
}
