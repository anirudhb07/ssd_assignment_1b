\set ON_ERROR_STOP on
-- Run after the setup scripts. All fixtures and changes are rolled back.
BEGIN;
SET LOCAL plpgsql.check_asserts = on;

CREATE FUNCTION pg_temp.expect_error(statement TEXT, expected_state TEXT, message_part TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    BEGIN
        EXECUTE statement;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE <> expected_state OR POSITION(message_part IN SQLERRM) = 0 THEN
            RAISE EXCEPTION 'Unexpected error: % %', SQLSTATE, SQLERRM;
        END IF;
        RETURN;
    END;
    RAISE EXCEPTION 'Expected error for: %', statement;
END;
$$;

DO $$
DECLARE
    customer UUID := gen_random_uuid();
    restaurant UUID := gen_random_uuid();
    first_order UUID := gen_random_uuid();
    next_order UUID := gen_random_uuid();
    missing UUID := gen_random_uuid();
    invalid_amount TEXT;
BEGIN
    INSERT INTO users (id, name) VALUES (customer, 'Issue 9 test');
    INSERT INTO restaurants (id, name, latitude, longitude)
    VALUES (restaurant, 'Issue 9 test', 0, 0);

    PERFORM pg_temp.expect_error(format('CALL sp_execute_checkout(%L, %L, %L, 10)',
        first_order, customer, restaurant), 'P0001', 'Insufficient balance');
    ASSERT NOT EXISTS (SELECT 1 FROM orders WHERE id = first_order);
    ASSERT NOT EXISTS (SELECT 1 FROM wallet_audit_logs WHERE user_id = customer);

    CALL sp_wallet_topup(customer, 100.25);
    CALL sp_wallet_topup(customer, 0.755);
    ASSERT (SELECT wallet_balance = 101.01 FROM users WHERE id = customer);
    ASSERT (SELECT COUNT(*) = 2 FROM wallet_audit_logs WHERE user_id = customer);
    ASSERT EXISTS (SELECT 1 FROM wallet_audit_logs WHERE user_id = customer
        AND action_type = 'CREDIT' AND amount_changed = 100.25 AND balance_after = 100.25);
    ASSERT EXISTS (SELECT 1 FROM wallet_audit_logs WHERE user_id = customer
        AND action_type = 'CREDIT' AND amount_changed = 0.76 AND balance_after = 101.01);

    FOREACH invalid_amount IN ARRAY ARRAY['NULL', '0', '-1', '0.001',
        '''NaN''::NUMERIC', '''Infinity''::NUMERIC', '''-Infinity''::NUMERIC'] LOOP
        PERFORM pg_temp.expect_error(format('CALL sp_wallet_topup(%L, %s)',
            customer, invalid_amount), 'P0001', 'Top-up amount must be greater than zero');
    END LOOP;
    PERFORM pg_temp.expect_error(format('CALL sp_wallet_topup(%L, 1)', missing),
        'P0001', 'User does not exist');
    PERFORM pg_temp.expect_error('CALL sp_wallet_topup(NULL, 1)',
        'P0001', 'User does not exist');
    PERFORM pg_temp.expect_error(format('CALL sp_wallet_topup(%L, 100000000)', customer),
        '22003', 'numeric field overflow');
    ASSERT (SELECT wallet_balance = 101.01 FROM users WHERE id = customer);
    ASSERT (SELECT COUNT(*) = 2 FROM wallet_audit_logs WHERE user_id = customer);

    CALL sp_execute_checkout(first_order, customer, restaurant, 10);
    ASSERT (SELECT status = 'PREPARING' FROM orders WHERE id = first_order);
    PERFORM pg_temp.expect_error(format('CALL sp_execute_checkout(%L, %L, %L, 10)',
        next_order, customer, restaurant), '23505', 'idx_active_user_order');
    CALL sp_advance_order_status(first_order);
    ASSERT (SELECT status = 'DELIVERING' FROM orders WHERE id = first_order);
    PERFORM pg_temp.expect_error(format('CALL sp_execute_checkout(%L, %L, %L, 10)',
        next_order, customer, restaurant), '23505', 'idx_active_user_order');
    CALL sp_advance_order_status(first_order);
    ASSERT (SELECT status = 'DELIVERED' FROM orders WHERE id = first_order);
    PERFORM pg_temp.expect_error(format('CALL sp_advance_order_status(%L)', first_order),
        'P0001', 'Order is already DELIVERED');
    PERFORM pg_temp.expect_error(format('CALL sp_advance_order_status(%L)', missing),
        'P0001', 'Order does not exist');
    PERFORM pg_temp.expect_error('CALL sp_advance_order_status(NULL)',
        'P0001', 'Order does not exist');
    ASSERT (SELECT status = 'DELIVERED' FROM orders WHERE id = first_order);
    ASSERT (SELECT wallet_balance = 91.01 FROM users WHERE id = customer);
    ASSERT (SELECT COUNT(*) = 3 FROM wallet_audit_logs WHERE user_id = customer);

    -- Delivery releases the partial unique index; checkout can succeed again.
    CALL sp_execute_checkout(next_order, customer, restaurant, 10);
    ASSERT (SELECT status = 'PREPARING' FROM orders WHERE id = next_order);
    ASSERT (SELECT wallet_balance = 81.01 FROM users WHERE id = customer);
    ASSERT (SELECT COUNT(*) = 4 FROM wallet_audit_logs WHERE user_id = customer);
    RAISE NOTICE 'Issue 9: all order status, top-up, audit and checkout assertions passed';
END;
$$;

ROLLBACK;
