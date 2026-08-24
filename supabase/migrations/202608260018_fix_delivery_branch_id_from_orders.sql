-- Fix delivery workflow: Add branch_id to orders table and update RPC
-- Error: accept_delivery_assignment_flexible tries to get branch_id from orders but column doesn't exist

BEGIN;

-- Add branch_id to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS branch_id uuid;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON public.orders(branch_id);

-- Update RPC to handle missing branch_id gracefully and use correct status values
CREATE OR REPLACE FUNCTION public.accept_delivery_assignment_flexible(
  p_order_id uuid,
  p_assigned_staff_id uuid,
  p_assigned_staff_name text,
  p_gps_latitude numeric,
  p_gps_longitude numeric,
  p_photo_url text
)
RETURNS json AS $$
DECLARE
  v_order_id uuid := p_order_id;
  v_delivery_run_id uuid;
  v_started_at timestamp;
  v_branch_id uuid;
  v_run_code text;
BEGIN
  v_started_at := now();

  -- Get branch_id from order (if exists, otherwise NULL)
  SELECT branch_id INTO v_branch_id FROM public.orders WHERE id = v_order_id;

  -- Find existing delivery run for this order
  SELECT dr.id INTO v_delivery_run_id
  FROM public.delivery_runs dr
  JOIN public.delivery_stops ds ON ds.delivery_run_id = dr.id
  WHERE ds.order_id = v_order_id
  LIMIT 1;

  -- Create or update delivery run
  IF v_delivery_run_id IS NULL THEN
    v_run_code := 'RUN-' || to_char(now(), 'YYMMDD-HH24MI') || '-' || upper(substr(md5(p_order_id::text), 1, 4));

    INSERT INTO public.delivery_runs (
      id, run_code, branch_id, assigned_driver_id, status, started_at
    ) VALUES (
      gen_random_uuid(),
      v_run_code,
      v_branch_id,
      p_assigned_staff_id,
      'in_transit',
      v_started_at
    )
    RETURNING id INTO v_delivery_run_id;
  ELSE
    UPDATE public.delivery_runs
    SET
      assigned_driver_id = p_assigned_staff_id,
      status = 'in_transit',
      started_at = v_started_at,
      branch_id = COALESCE(branch_id, v_branch_id)
    WHERE id = v_delivery_run_id;
  END IF;

  -- Create delivery stop if doesn't exist
  INSERT INTO public.delivery_stops(delivery_run_id, order_id, sequence_no, status, destination_address, destination_lat, destination_lng)
  SELECT v_delivery_run_id, v_order_id, 1, 'pending', o.address, o.delivery_lat, o.delivery_lng
  FROM public.orders o WHERE o.id = v_order_id
  ON CONFLICT (delivery_run_id, order_id) DO NOTHING;

  -- Update delivery stop with GPS and photo (status: arrived = staff has arrived at location with photo proof)
  UPDATE public.delivery_stops
  SET
    gps_latitude = p_gps_latitude,
    gps_longitude = p_gps_longitude,
    photo_proof_url = p_photo_url,
    started_at = v_started_at,
    status = 'arrived'
  WHERE order_id = v_order_id;

  -- Mark order as in delivery
  UPDATE public.orders
  SET status_v2 = 'in_delivery'
  WHERE id = v_order_id;

  -- Log KPI event
  INSERT INTO public.kpi_logs (
    id, order_id, staff_id, staff_name, event_type,
    gps_latitude, gps_longitude, photo_url, notes, created_at
  ) VALUES (
    gen_random_uuid(),
    v_order_id,
    p_assigned_staff_id,
    p_assigned_staff_name,
    'delivery_assigned',
    p_gps_latitude,
    p_gps_longitude,
    p_photo_url,
    'Flexible delivery accepted by ' || p_assigned_staff_name,
    v_started_at
  ) ON CONFLICT DO NOTHING;

  RETURN json_build_object(
    'success', true,
    'message', 'Delivery assignment accepted',
    'order_id', v_order_id,
    'delivery_run_id', v_delivery_run_id,
    'timestamp', v_started_at
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM,
    'code', SQLSTATE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.accept_delivery_assignment_flexible TO authenticated, anon, service_role;

-- Log migration
INSERT INTO public.migration_runs(migration_key, status, finished_at, notes)
VALUES('202608260018_fix_delivery_branch_id_from_orders', 'completed', now(),
  'Added branch_id column to orders table, fixed accept_delivery_assignment_flexible RPC with run_code generation, branch_id handling, and correct status values (in_transit/arrived)')
ON CONFLICT(migration_key) DO UPDATE SET status='completed', finished_at=now(), notes=excluded.notes;

COMMIT;
