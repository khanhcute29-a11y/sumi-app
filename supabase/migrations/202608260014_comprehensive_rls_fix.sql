-- Comprehensive RLS fix for all tables causing permission denied errors
-- Table "o" = orders alias

BEGIN;

-- 1. FIX ORDERS TABLE
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "orders_select" ON public.orders;
DROP POLICY IF EXISTS "orders_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_update" ON public.orders;
DROP POLICY IF EXISTS "orders_delete" ON public.orders;

-- Allow SELECT on orders for all authenticated users
CREATE POLICY "orders_select_authenticated"
ON public.orders
FOR SELECT
USING (auth.role() = 'authenticated');

-- Disable direct inserts/updates (use RPC)
CREATE POLICY "orders_insert_disabled"
ON public.orders
FOR INSERT
WITH CHECK (FALSE);

CREATE POLICY "orders_update_disabled"
ON public.orders
FOR UPDATE
USING (FALSE);

-- 2. FIX ORDER_ITEMS TABLE
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;

CREATE POLICY "order_items_select_authenticated"
ON public.order_items
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "order_items_insert_disabled"
ON public.order_items
FOR INSERT
WITH CHECK (FALSE);

-- 3. FIX ORGANIZATION_UNITS TABLE
ALTER TABLE public.organization_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organization_units_select" ON public.organization_units;

CREATE POLICY "organization_units_select_authenticated"
ON public.organization_units
FOR SELECT
USING (auth.role() = 'authenticated');

-- 4. FIX DOMAIN_EVENTS TABLE
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "domain_events_select" ON public.domain_events;
DROP POLICY IF EXISTS "domain_events_insert" ON public.domain_events;

CREATE POLICY "domain_events_select_authenticated"
ON public.domain_events
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "domain_events_insert_authenticated"
ON public.domain_events
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- 5. GRANT PERMISSIONS
GRANT SELECT ON public.orders TO authenticated;
GRANT SELECT ON public.order_items TO authenticated;
GRANT SELECT ON public.order_work_packages TO authenticated;
GRANT SELECT ON public.order_change_logs TO authenticated;
GRANT SELECT ON public.kpi_logs TO authenticated;
GRANT SELECT ON public.organization_units TO authenticated;
GRANT SELECT ON public.domain_events TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.work_package_items TO authenticated;

-- Allow inserts on kpi_logs for authenticated (non-sensitive)
GRANT INSERT ON public.kpi_logs TO authenticated;

-- Grant execute on all critical RPCs
GRANT EXECUTE ON FUNCTION public.enqueue_order_operational_alerts TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_delegate_work_package TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_work_package_self TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_work_package_and_order TO authenticated;

-- Log migration
INSERT INTO public.migration_runs(migration_key, status, finished_at, notes)
VALUES('202608260014_comprehensive_rls_fix', 'completed', now(), 'Comprehensive RLS fix - orders, order_items, org_units, domain_events')
ON CONFLICT(migration_key) DO UPDATE SET status='completed', finished_at=now();

COMMIT;
