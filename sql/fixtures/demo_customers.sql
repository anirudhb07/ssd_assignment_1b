-- Demo customers (issue #66): three customers with fixed ids for the live demo,
-- one for each checkout outcome. docker/seed/seed.sh applies this after the
-- seeders on every seed run, so the ids never change and each run puts the
-- three back into their demo state:
--
--   Demo - plenty of money    ₹5,000 or more, no order in progress: checkout succeeds
--   Demo - low balance        ₹45 (every menu item costs more): checkout fails, Top up
--   Demo - order in progress  one PREPARING order: checkout fails, Advance status
--
-- It uses the real procedures and trigger, so their orders and wallet history
-- look like any other customer's. Bringing the low-balance customer back down
-- to ₹45 after a demo top-up is a direct balance change, which the audit
-- trigger records as a DEBIT like any other.
--
-- Apply it on its own:  docker compose run --rm seed
-- Reset the three by hand, e.g. between demo runs:  CALL sp_reset_demo_customers();

CREATE OR REPLACE PROCEDURE sp_reset_demo_customers()
LANGUAGE plpgsql
AS $$
DECLARE
    plenty CONSTANT UUID := '00000000-0000-4000-8000-00000000d001';
    low    CONSTANT UUID := '00000000-0000-4000-8000-00000000d002';
    busy   CONSTANT UUID := '00000000-0000-4000-8000-00000000d003';
    restaurant UUID;
    in_progress UUID;
    balance DECIMAL(10,2);
BEGIN
    -- The alphabetically first restaurant ("Ananda Bakery" with the default
    -- seed). Its name is the same on every machine; ids are not.
    SELECT id INTO restaurant FROM restaurants ORDER BY name, id LIMIT 1;
    IF restaurant IS NULL THEN
        RAISE NOTICE 'Demo customers skipped: there are no restaurants yet.';
        RETURN;
    END IF;

    INSERT INTO users (id, name, wallet_balance) VALUES
        (plenty, 'Demo - plenty of money', 0),
        (low,    'Demo - low balance', 0),
        (busy,   'Demo - order in progress', 0)
    ON CONFLICT (id) DO NOTHING;

    -- The first two must have no order in progress, so checkout is decided
    -- by money alone. Deliver anything left over from an earlier demo.
    LOOP
        SELECT id INTO in_progress FROM orders
         WHERE user_id IN (plenty, low) AND status IN ('PREPARING', 'DELIVERING')
         LIMIT 1;
        EXIT WHEN in_progress IS NULL;
        CALL sp_advance_order_status(in_progress);
    END LOOP;

    -- Plenty of money: at least ₹5,000.
    SELECT wallet_balance INTO balance FROM users WHERE id = plenty;
    IF balance < 5000 THEN
        CALL sp_wallet_topup(plenty, 5000 - balance);
    END IF;

    -- Low balance: exactly ₹45.
    SELECT wallet_balance INTO balance FROM users WHERE id = low;
    IF balance < 45 THEN
        CALL sp_wallet_topup(low, 45 - balance);
    ELSIF balance > 45 THEN
        UPDATE users SET wallet_balance = 45 WHERE id = low;
    END IF;

    -- Order in progress: one PREPARING order. If the last one was advanced
    -- during a demo, place a new one (topping up first if needed).
    IF NOT EXISTS (SELECT 1 FROM orders WHERE user_id = busy AND status IN ('PREPARING', 'DELIVERING')) THEN
        SELECT wallet_balance INTO balance FROM users WHERE id = busy;
        IF balance < 1000 THEN
            CALL sp_wallet_topup(busy, 1000 - balance);
        END IF;
        CALL sp_execute_checkout(gen_random_uuid(), busy, restaurant, 240.00);
    END IF;
END
$$;

CALL sp_reset_demo_customers();
