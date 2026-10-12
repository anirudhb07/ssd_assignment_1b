-- Member B (issue #12). Browse lists orders newest first
-- (GET /api/orders). Without this index PostgreSQL scans and sorts all
-- 120,000 orders for every page: ~128 ms before, see the PR for after.

CREATE INDEX IF NOT EXISTS idx_orders_created_at
ON orders (created_at DESC, id DESC);
