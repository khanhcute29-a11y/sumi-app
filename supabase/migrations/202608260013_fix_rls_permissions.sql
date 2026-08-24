-- Fix RLS permissions for order work packages and change logs
-- Error: "permission denied for table o" when querying

BEGIN;

-- Enable RLS on all tables
ALTER TABLE public.order_work_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_change_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing problematic policies (if any)
DROP POLICY IF EXISTS "work_package_select" ON public.order_work_packages;
DROP POLICY IF EXISTS "work_package_insert" ON public.order_work_packages;
DROP POLICY IF EXISTS "work_package_update" ON public.order_work_packages;
DROP POLICY IF EXISTS "change_log_select" ON public.order_change_logs;
DROP POLICY IF EXISTS "change_log_insert" ON public.order_change_logs;

-- Policy: SELECT order_work_packages - authenticated users can select
CREATE POLICY "order_work_packages_select_authenticated"
ON public.order_work_packages
FOR SELECT
USING (auth.role() = 'authenticated');

-- Policy: INSERT order_work_packages - only via RPC for now
CREATE POLICY "order_work_packages_insert_disable_direct"
ON public.order_work_packages
FOR INSERT
WITH CHECK (FALSE); -- Disable direct inserts, use RPC

-- Policy: UPDATE order_work_packages - only via RPC
CREATE POLICY "order_work_packages_update_disable_direct"
ON public.order_work_packages
FOR UPDATE
USING (FALSE); -- Disable direct updates, use RPC

-- Policy: SELECT order_change_logs - authenticated users
CREATE POLICY "order_change_logs_select_authenticated"
ON public.order_change_logs
FOR SELECT
USING (auth.role() = 'authenticated');

-- Policy: INSERT order_change_logs - only via RPC
CREATE POLICY "order_change_logs_insert_disable_direct"
ON public.order_change_logs
FOR INSERT
WITH CHECK (FALSE); -- Disable direct inserts, use RPC

-- Policy: SELECT kpi_logs - authenticated users
CREATE POLICY "kpi_logs_select_authenticated"
ON public.kpi_logs
FOR SELECT
USING (auth.role() = 'authenticated');

-- Policy: INSERT kpi_logs - allow direct inserts (non-sensitive)
CREATE POLICY "kpi_logs_insert_authenticated"
ON public.kpi_logs
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Grant execute on all RPCs to authenticated
GRANT EXECUTE ON FUNCTION public.accept_delegate_work_package TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_work_package_self TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_work_package_and_order TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_work_package TO authenticated;
GRANT EXECUTE ON FUNCTION public.unassign_work_package TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_order_edit_lock TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_order_edit_approval TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_order_edit_request TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_order_field TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_change_history TO authenticated;

-- Grant SELECT on tables
GRANT SELECT ON public.order_work_packages TO authenticated;
GRANT SELECT ON public.order_change_logs TO authenticated;
GRANT SELECT ON public.kpi_logs TO authenticated;

-- Log migration
INSERT INTO public.migration_runs(migration_key, status, finished_at, notes)
VALUES('202608260013_fix_rls_permissions', 'completed', now(), 'Fix RLS policies - allow authenticated users to SELECT, disable direct INSERT/UPDATE on sensitive tables')
ON CONFLICT(migration_key) DO UPDATE SET status='completed', finished_at=now();

COMMIT;
