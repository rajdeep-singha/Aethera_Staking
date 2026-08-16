module aethera_staking::marketplace {
    use std::signer;
    use std::bcs;
    use std::vector;
 
    use aptos_std::table::{Self, Table};
 
    use aptos_framework::object;
    use aptos_framework::fungible_asset::Metadata;
    use aptos_framework::primary_fungible_store;
    use aptos_framework::account::{Self, SignerCapability};
    use aptos_framework::coin::{Self};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::timestamp;
    use aptos_framework::event;
 
    use aethera_staking::project_token;

    //constants 
    const SIDE_BID: u8 = 0;   // resting order wants to BUY tokens with APT
    const SIDE_ASK: u8 = 1;   // resting order wants to SELL tokens for APT
 
    const STATUS_OPEN: u8      = 0;
    const STATUS_FILLED: u8    = 1;
    const STATUS_CANCELLED: u8 = 2;

    /// Mirrors project_token::LIFECYCLE_ACTIVE. Move constants are always
    /// module-private, so this has to be duplicated rather than imported —
    /// keep it in sync if the lifecycle enum in project_token.move changes.
    const LIFECYCLE_ACTIVE: u8 = 2;
 
    const MARKET_SEED: vector<u8> = b"AETH_MARKET_ESCROW";
    const MAX_FEE_BPS: u64 = 1000; // 10% hard cap on protocol fee

    // Error codes 

    const E_NOT_ADMIN: u64             = 1;
    const E_MARKET_NOT_FOUND: u64      = 2;
    const E_MARKET_EXISTS: u64         = 3;
    const E_WRONG_LIFECYCLE: u64       = 4;
    const E_ZERO_AMOUNT: u64           = 5;
    const E_ORDER_NOT_FOUND: u64       = 6;
    const E_NOT_ORDER_OWNER: u64       = 7;
    const E_ORDER_NOT_OPEN: u64        = 8;
    const E_INSUFFICIENT_QUANTITY: u64 = 9;
    const E_SELF_TRADE: u64            = 10;
    const E_INVALID_SIDE: u64          = 11;
    const E_FEE_TOO_HIGH: u64          = 12;
    const E_AMOUNT_OVERFLOW: u64       = 13;

    //storage

    struct MarketplaceHub has key {
        admin:                address,
        token_hub_authority:  address,                     // project_token.move's hub — for lifecycle + metadata reads
        escrow_caps:          Table<u64, SignerCapability>, // project_id -> this project's escrow resource-account cap
        fee_bps:               u64,                          // protocol fee, e.g. 50 = 0.50%
        fee_collector:         address,
    }


    /// Lives at EACH PROJECT'S escrow resource account (mirrors how
    /// project_token.move isolates capabilities per project)
    struct Orders has key {
        orders:         Table<u64, Order>,
        next_order_id:  u64,
    }

    struct Order has store, drop, copy {
        order_id:         u64,
        project_id:        u64,
        maker:             address,
        side:              u8,     // SIDE_BID | SIDE_ASK
        price_per_token:   u64,    // octas per token
        quantity:          u64,    // remaining UNFILLED quantity, in tokens
        status:            u8,     // STATUS_OPEN | STATUS_FILLED | STATUS_CANCELLED
        created_at:        u64,
    }

    #[event]
    struct OrderPlaced has drop, store {
        order_id:         u64,
        project_id:        u64,
        maker:             address,
        side:              u8,
        price_per_token:   u64,
        quantity:          u64,
    }
 
    #[event]
    struct OrderCancelled has drop, store {
        order_id:            u64,
        project_id:           u64,
        maker:                address,
        refunded_quantity:    u64,
    }
 
    #[event]
    struct TradeSettled has drop, store {
        project_id:         u64,
        maker_order_id:      u64,
        maker:               address,
        taker:               address,
        buyer:               address,
        seller:              address,
        price_per_token:     u64,
        quantity:            u64,
        fee_paid:            u64,
    }

    // Admin functions
    public entry fun initialize(
        admin:                &signer,
        token_hub_authority:  address,
        fee_bps:               u64,
        fee_collector:         address,
    ) {
        assert!(fee_bps <= MAX_FEE_BPS, E_FEE_TOO_HIGH);
        move_to(admin, MarketplaceHub {
            admin:                signer::address_of(admin),
            token_hub_authority,
            escrow_caps:          table::new<u64, SignerCapability>(),
            fee_bps,
            fee_collector,
        });
    
    }
    //Stand up the order book + escrow account for one project. Admin-only,
    // idempotent-guarded (fails if already initialized for this project_id).

    public entry fun init_project_market(
        admin:          &signer,
        hub_authority:   address,
        project_id:      u64,
    ) acquires MarketplaceHub {
        let hub = borrow_global_mut<MarketplaceHub>(hub_authority);
        assert!(signer::address_of(admin) == hub.admin, E_NOT_ADMIN);
        assert!(!table::contains(&hub.escrow_caps, project_id), E_MARKET_EXISTS);


//own resource account for the same project_id + admin
        let seed = MARKET_SEED;
        vector::append(&mut seed, bcs::to_bytes(&project_id));
        let (resource_signer, signer_cap) = account::create_resource_account(admin, seed);

// Register an APT CoinStore on the escrow account so it can hold BID-side escrow.
        coin::register<AptosCoin>(&resource_signer);
 
        move_to(&resource_signer, Orders {
            orders:         table::new<u64, Order>(),
            next_order_id:  1,
        });
 
        table::add(&mut hub.escrow_caps, project_id, signer_cap);
    }


    public entry fun update_fee(
        admin:          &signer,
        hub_authority:   address,
        new_fee_bps:     u64,
    ) acquires MarketplaceHub {
        let hub = borrow_global_mut<MarketplaceHub>(hub_authority);
        assert!(signer::address_of(admin) == hub.admin, E_NOT_ADMIN);
        assert!(new_fee_bps <= MAX_FEE_BPS, E_FEE_TOO_HIGH);
        hub.fee_bps = new_fee_bps;
    }

    //Trading Functions 

    /// Place a resting limit order. Escrows funds/tokens immediately.
    ///   side = SIDE_BID → escrows quantity * price_per_token in APT
    ///   side = SIDE_ASK → escrows `quantity` project tokens

    public entry fun place_order(
        maker:              &signer,
        hub_authority:       address,
        project_id:          u64,
        side:                u8,
        price_per_token:     u64,
        quantity:            u64,
    ) acquires MarketplaceHub, Orders {
        assert!(quantity > 0 && price_per_token > 0, E_ZERO_AMOUNT);
        assert!(side == SIDE_BID || side == SIDE_ASK, E_INVALID_SIDE);
 
        let hub = borrow_global<MarketplaceHub>(hub_authority);
        assert!(table::contains(&hub.escrow_caps, project_id), E_MARKET_NOT_FOUND);
        assert!(
            project_token::get_lifecycle(hub.token_hub_authority, project_id) == LIFECYCLE_ACTIVE,
            E_WRONG_LIFECYCLE
        );
 
        let resource_addr = account::get_signer_capability_address(
            table::borrow(&hub.escrow_caps, project_id)
        );
 
        if (side == SIDE_ASK) {
            let metadata_addr = project_token::get_token_metadata_addr(hub.token_hub_authority, project_id);
            let metadata = object::address_to_object<Metadata>(metadata_addr);
            let fa = primary_fungible_store::withdraw(maker, metadata, quantity);
            primary_fungible_store::deposit(resource_addr, fa);
        } else {
            let total = calc_total(quantity, price_per_token);
            let coins = coin::withdraw<AptosCoin>(maker, total);
            coin::deposit<AptosCoin>(resource_addr, coins);
        };
 
        let orders = borrow_global_mut<Orders>(resource_addr);
        let order_id = orders.next_order_id;
        orders.next_order_id = order_id + 1;
 
        table::add(&mut orders.orders, order_id, Order {
            order_id,
            project_id,
            maker: signer::address_of(maker),
            side,
            price_per_token,
            quantity,
            status: STATUS_OPEN,
            created_at: timestamp::now_seconds(),
        });
 
        event::emit(OrderPlaced {
            order_id, project_id, maker: signer::address_of(maker), side, price_per_token, quantity,
        });
    }
 
    /// Cancel a still-open order and refund whatever remains escrowed.
    /// Deliberately NOT lifecycle-gated and  makers can always exit an open
    /// order, including after a project matures.

    public entry fun cancel_order(
        maker:              &signer,
        hub_authority:       address,
        project_id:          u64,
        order_id:            u64,
    ) acquires MarketplaceHub, Orders {
        let hub = borrow_global<MarketplaceHub>(hub_authority);
        assert!(table::contains(&hub.escrow_caps, project_id), E_MARKET_NOT_FOUND);
 
        let cap = table::borrow(&hub.escrow_caps, project_id);
        let resource_addr = account::get_signer_capability_address(cap);
        let resource_signer = account::create_signer_with_capability(cap);
 
        let orders = borrow_global_mut<Orders>(resource_addr);
        assert!(table::contains(&orders.orders, order_id), E_ORDER_NOT_FOUND);
        let order = table::borrow_mut(&mut orders.orders, order_id);
        assert!(order.maker == signer::address_of(maker), E_NOT_ORDER_OWNER);
        assert!(order.status == STATUS_OPEN, E_ORDER_NOT_OPEN);
 
        let refund_qty = order.quantity;
 
        if (order.side == SIDE_ASK) {
            let metadata_addr = project_token::get_token_metadata_addr(hub.token_hub_authority, project_id);
            let metadata = object::address_to_object<Metadata>(metadata_addr);
            let fa = primary_fungible_store::withdraw(&resource_signer, metadata, refund_qty);
            primary_fungible_store::deposit(order.maker, fa);
        } else {
            let total = calc_total(refund_qty, order.price_per_token);
            let coins = coin::withdraw<AptosCoin>(&resource_signer, total);
            coin::deposit<AptosCoin>(order.maker, coins);
        };
 
        order.status = STATUS_CANCELLED;
        order.quantity = 0;
 
        event::emit(OrderCancelled {
            order_id, project_id, maker: signer::address_of(maker), refunded_quantity: refund_qty,
        });
    }
 
    /// Fill (fully or partially) a resting order. The taker takes the
    /// opposite side of whatever the resting order is:
    ///   resting SIDE_ASK → taker pays APT now, receives tokens
    ///   resting SIDE_BID → taker delivers tokens now, receives APT
    /// A protocol fee (fee_bps) is deducted from the APT leg and sent to
    /// fee_collector; the counterparty receives the net amount.
    public entry fun fill_order(
        taker:              &signer,
        hub_authority:       address,
        project_id:          u64,
        order_id:            u64,
        fill_quantity:       u64,
    ) acquires MarketplaceHub, Orders {
        assert!(fill_quantity > 0, E_ZERO_AMOUNT);
 
        let hub = borrow_global<MarketplaceHub>(hub_authority);
        assert!(table::contains(&hub.escrow_caps, project_id), E_MARKET_NOT_FOUND);
        assert!(
            project_token::get_lifecycle(hub.token_hub_authority, project_id) == LIFECYCLE_ACTIVE,
            E_WRONG_LIFECYCLE
        );
 
        let cap = table::borrow(&hub.escrow_caps, project_id);
        let resource_addr = account::get_signer_capability_address(cap);
        let resource_signer = account::create_signer_with_capability(cap);
        let taker_addr = signer::address_of(taker);
 
        let orders = borrow_global_mut<Orders>(resource_addr);
        assert!(table::contains(&orders.orders, order_id), E_ORDER_NOT_FOUND);
        let order = table::borrow_mut(&mut orders.orders, order_id);
        assert!(order.status == STATUS_OPEN, E_ORDER_NOT_OPEN);
        assert!(order.maker != taker_addr, E_SELF_TRADE);
        assert!(fill_quantity <= order.quantity, E_INSUFFICIENT_QUANTITY);
 
        let total = calc_total(fill_quantity, order.price_per_token);
        let fee = calc_fee(total, hub.fee_bps);
 
        let metadata_addr = project_token::get_token_metadata_addr(hub.token_hub_authority, project_id);
        let metadata = object::address_to_object<Metadata>(metadata_addr);
 
        let buyer: address;
        let seller: address;
 
        if (order.side == SIDE_ASK) {
            // Maker already escrowed tokens; taker is the buyer and pays now.
            buyer = taker_addr;
            seller = order.maker;
 
            let apt_from_taker = coin::withdraw<AptosCoin>(taker, total);
            let fee_coins = coin::extract(&mut apt_from_taker, fee);
            if (fee > 0) { coin::deposit<AptosCoin>(hub.fee_collector, fee_coins) }
            else { coin::destroy_zero(fee_coins) };
            coin::deposit<AptosCoin>(seller, apt_from_taker); // full `net` amount
 
            let fa = primary_fungible_store::withdraw(&resource_signer, metadata, fill_quantity);
            primary_fungible_store::deposit(buyer, fa);
        } else {
            // Maker already escrowed APT; taker is the seller and delivers tokens now.
            buyer = order.maker;
            seller = taker_addr;
 
            let fa = primary_fungible_store::withdraw(taker, metadata, fill_quantity);
            primary_fungible_store::deposit(buyer, fa);
 
            let apt_from_escrow = coin::withdraw<AptosCoin>(&resource_signer, total);
            let fee_coins = coin::extract(&mut apt_from_escrow, fee);
            if (fee > 0) { coin::deposit<AptosCoin>(hub.fee_collector, fee_coins) }
            else { coin::destroy_zero(fee_coins) };
            coin::deposit<AptosCoin>(seller, apt_from_escrow); // full `net` amount
        };
 
        order.quantity = order.quantity - fill_quantity;
        if (order.quantity == 0) { order.status = STATUS_FILLED };
 
        event::emit(TradeSettled {
            project_id,
            maker_order_id: order_id,
            maker: order.maker,
            taker: taker_addr,
            buyer,
            seller,
            price_per_token: order.price_per_token,
            quantity: fill_quantity,
            fee_paid: fee,
        });
    }
 
    
    // Internal helpers
    
 
    fun calc_total(quantity: u64, price_per_token: u64): u64 {
        let total = (quantity as u128) * (price_per_token as u128);
        assert!(total <= 18446744073709551615u128, E_AMOUNT_OVERFLOW);
        (total as u64)
    }
 
    fun calc_fee(total: u64, fee_bps: u64): u64 {
        let fee = ((total as u128) * (fee_bps as u128)) / 10000u128;
        (fee as u64)
    }
 
    
    // View functions
    
 
    #[view]
    public fun get_escrow_address(hub_authority: address, project_id: u64): address acquires MarketplaceHub {
        let hub = borrow_global<MarketplaceHub>(hub_authority);
        assert!(table::contains(&hub.escrow_caps, project_id), E_MARKET_NOT_FOUND);
        account::get_signer_capability_address(table::borrow(&hub.escrow_caps, project_id))
    }
 
    #[view]
    public fun get_order(
        hub_authority:   address,
        project_id:      u64,
        order_id:        u64,
    ): Order acquires MarketplaceHub, Orders {
        let hub = borrow_global<MarketplaceHub>(hub_authority);
        assert!(table::contains(&hub.escrow_caps, project_id), E_MARKET_NOT_FOUND);
        let resource_addr = account::get_signer_capability_address(table::borrow(&hub.escrow_caps, project_id));
        let orders = borrow_global<Orders>(resource_addr);
        assert!(table::contains(&orders.orders, order_id), E_ORDER_NOT_FOUND);
        *table::borrow(&orders.orders, order_id)
    }
 
    #[view]
    public fun get_fee_bps(hub_authority: address): u64 acquires MarketplaceHub {
        borrow_global<MarketplaceHub>(hub_authority).fee_bps
    }
}
 
