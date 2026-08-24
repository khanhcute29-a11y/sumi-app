-- Fix missing branch_id column on delivery_runs table
-- Error: column "branch_id" of relation "delivery_runs" does not exist

BEGIN;

-- Add branch_id column if not exists
ALTER TABLE public.delivery_runs ADD COLUMN IF NOT EXISTS branch_id uuid;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_delivery_runs_branch_id ON public.delivery_runs(branch_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.delivery_runs TO authenticated, anon, service_role;

-- Log migration
INSERT INTO public.migration_runs(migration_key, status, finished_at, notes)
VALUES(
  '202608260017_fix_delivery_runs_branch_id',
  'completed',
  now(),
  'Added missing branch_id column to delivery_runs table for shipper delivery acceptance workflow'
)
ON CONFLICT(migration_key) DO UPDATE SET status='completed', finished_at=now();

COMMIT;
