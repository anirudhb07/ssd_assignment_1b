-- Member A (issue #9). Safe to re-run; wallet auditing uses the existing trigger.

CREATE OR REPLACE PROCEDURE sp_advance_order_status(p_order_id UUID)
LANGUAGE plpgsql
AS $$
DECLARE
    current_status VARCHAR(20);
BEGIN
    -- Serialize advances so each call moves exactly one step.
    SELECT status
    INTO current_status
    FROM orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order does not exist: %', p_order_id;
    END IF;

    IF current_status = 'DELIVERED' THEN
        RAISE EXCEPTION 'Order is already DELIVERED: %', p_order_id;
    END IF;

    UPDATE orders
    SET status = CASE current_status
        WHEN 'PREPARING' THEN 'DELIVERING'
        WHEN 'DELIVERING' THEN 'DELIVERED'
    END
    WHERE id = p_order_id;
END;
$$;


CREATE OR REPLACE PROCEDURE sp_wallet_topup(
    p_user_id UUID,
    p_amount DECIMAL(10,2)
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Procedure arguments do not enforce DECIMAL's scale. Round to the
    -- wallet's precision and reject values that would credit zero cents.
    IF p_amount IS NULL OR p_amount <= 0
        OR p_amount IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC, '-Infinity'::NUMERIC)
        OR ROUND(p_amount, 2) = 0 THEN
        RAISE EXCEPTION 'Top-up amount must be greater than zero and round to at least 0.01 (finite amount required)';
    END IF;

    -- UPDATE locks the row and adds to its latest balance, avoiding lost
    -- updates against another top-up or checkout. The trigger writes CREDIT.
    UPDATE users
    SET wallet_balance = wallet_balance + ROUND(p_amount, 2)
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User does not exist: %', p_user_id;
    END IF;
END;
$$;
