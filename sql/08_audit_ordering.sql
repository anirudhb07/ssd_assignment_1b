-- Member B (issue #6). Make wallet_audit_logs rows orderable.
--
-- The trigger in 03 stamps rows with NOW(), the transaction's start time,
-- so every row written in one transaction gets the same changed_at. The
-- seeder writes all 120,000 rows in one transaction, so a customer's
-- history had no order and no running balance.
--
-- Fix:
--   1. seq: a number taken from a sequence as each row is written, so rows
--      have a strict order even when two share a timestamp.
--   2. changed_at uses clock_timestamp(), the actual time of the change.
--   3. The seeder backdates rows to their order's time by setting
--      bitestream.audit_at for the current transaction only. The API never
--      sets it, so real changes always get the real time.
--
-- Safe to re-run. Redefines fn_wallet_audit() from 03; the trigger itself
-- is unchanged. Existing rows get seq in the order they are stored, so
-- reseed (RESET=1) to get correctly dated history.

ALTER TABLE wallet_audit_logs
ADD COLUMN IF NOT EXISTS seq BIGSERIAL;


CREATE OR REPLACE FUNCTION fn_wallet_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    difference DECIMAL(10,2);
    audit_action VARCHAR(10);
    audit_time TIMESTAMPTZ;
BEGIN

    difference := NEW.wallet_balance - OLD.wallet_balance;

    -- No wallet change = no audit record.
    IF difference = 0 THEN
        RETURN NEW;
    END IF;

    IF difference < 0 THEN
        audit_action := 'DEBIT';
    ELSE
        audit_action := 'CREDIT';
    END IF;

    -- current_setting(..., true) is NULL if the setting was never made and
    -- '' after the transaction that set it has ended.
    audit_time := COALESCE(
        NULLIF(current_setting('bitestream.audit_at', true), '')::TIMESTAMPTZ,
        clock_timestamp()
    );

    INSERT INTO wallet_audit_logs (
        id,
        user_id,
        amount_changed,
        action_type,
        balance_after,
        changed_at
    )
    VALUES (
        gen_random_uuid(),
        NEW.id,
        ABS(difference),
        audit_action,
        NEW.wallet_balance,
        audit_time
    );

    RETURN NEW;
END;
$$;
