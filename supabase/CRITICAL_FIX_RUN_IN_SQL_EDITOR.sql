-- ⚠️ CRITICAL FIX: Run this in Supabase SQL Editor immediately
-- Problem: Orders created but work packages (Các bếp thực hiện) showing as 0
-- This ensures auto_create_kitchen_work_packages function exists and is called

-- Step 1: Verify the function exists
DROP FUNCTION IF EXISTS public.auto_create_kitchen_work_packages(uuid) CASCADE;

-- Step 2: Recreate the function
CREATE FUNCTION public.auto_create_kitchen_work_packages(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_order record;
  v_item record;
  v_cold_unit uuid;
  v_hot_unit uuid;
  v_x41_unit uuid;
  v_x42_unit uuid;
  v_unit_id uuid;
  v_package_id uuid;
  v_flow text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Find kitchen units
  SELECT id INTO v_cold_unit FROM public.organization_units
    WHERE unit_type = 'kitchen' AND active = true
    AND (code ILIKE '%COLD%' OR name ILIKE '%lạnh%') LIMIT 1;

  SELECT id INTO v_hot_unit FROM public.organization_units
    WHERE unit_type = 'kitchen' AND active = true
    AND (code ILIKE '%HOT%' OR name ILIKE '%nóng%') LIMIT 1;

  SELECT id INTO v_x41_unit FROM public.organization_units
    WHERE unit_type = 'kitchen' AND active = true
    AND code ILIKE '%41%' LIMIT 1;

  SELECT id INTO v_x42_unit FROM public.organization_units
    WHERE unit_type = 'kitchen' AND active = true
    AND code ILIKE '%42%' LIMIT 1;

  -- Fallback to any kitchen
  IF v_cold_unit IS NULL THEN
    SELECT id INTO v_cold_unit FROM public.organization_units
      WHERE unit_type = 'kitchen' AND active = true LIMIT 1;
  END IF;

  IF v_hot_unit IS NULL THEN v_hot_unit := v_cold_unit; END IF;
  IF v_x41_unit IS NULL THEN v_x41_unit := v_cold_unit; END IF;
  IF v_x42_unit IS NULL THEN v_x42_unit := v_hot_unit; END IF;

  -- Exit if packages already exist
  IF EXISTS (SELECT 1 FROM public.order_work_packages WHERE order_id = p_order_id) THEN
    RETURN;
  END IF;

  -- Create package for each item
  FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id LOOP
    v_flow := COALESCE(v_item.specification->>'product_flow', v_order.order_type, 'cake');

    -- Map to kitchen
    CASE v_flow
      WHEN 'cake' THEN v_unit_id := v_cold_unit;
      WHEN 'bakery' THEN v_unit_id := v_hot_unit;
      WHEN 'macaron' THEN v_unit_id := v_x41_unit;
      WHEN 'school' THEN v_unit_id := v_x42_unit;
      WHEN 'teabreak' THEN v_unit_id := v_x42_unit;
      ELSE v_unit_id := v_cold_unit;
    END CASE;

    -- Check if package exists
    SELECT id INTO v_package_id FROM public.order_work_packages
      WHERE order_id = p_order_id AND unit_id = v_unit_id LIMIT 1;

    IF v_package_id IS NULL THEN
      INSERT INTO public.order_work_packages(order_id, unit_id, status, due_at, version)
      VALUES(p_order_id, v_unit_id, 'assigned', v_order.required_at, 1)
      RETURNING id INTO v_package_id;
    END IF;

    INSERT INTO public.work_package_items(work_package_id, order_item_id, quantity)
    VALUES(v_package_id, v_item.id, v_item.quantity)
    ON CONFLICT(work_package_id, order_item_id) DO NOTHING;
  END LOOP;

  -- Create default package if none exist
  IF NOT EXISTS (SELECT 1 FROM public.order_work_packages WHERE order_id = p_order_id) THEN
    v_flow := COALESCE(v_order.order_type, 'cake');
    CASE v_flow
      WHEN 'cake' THEN v_unit_id := v_cold_unit;
      WHEN 'bakery' THEN v_unit_id := v_hot_unit;
      WHEN 'macaron' THEN v_unit_id := v_x41_unit;
      WHEN 'school' THEN v_unit_id := v_x42_unit;
      WHEN 'teabreak' THEN v_unit_id := v_x42_unit;
      ELSE v_unit_id := v_cold_unit;
    END CASE;

    INSERT INTO public.order_work_packages(order_id, unit_id, status, due_at, version)
    VALUES(p_order_id, v_unit_id, 'assigned', v_order.required_at, 1);
  END IF;
END $$;

-- Step 3: Grant execute permission
GRANT EXECUTE ON FUNCTION public.auto_create_kitchen_work_packages(uuid) TO authenticated;

-- Step 4: Ensure RLS allows selection
ALTER TABLE public.order_work_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_work_packages_select_auth" ON public.order_work_packages;
CREATE POLICY "order_work_packages_select_auth"
  ON public.order_work_packages FOR SELECT
  USING (auth.role() = 'authenticated');

GRANT SELECT ON public.order_work_packages TO authenticated;
GRANT SELECT ON public.work_package_items TO authenticated;

-- Step 5: Backfill work packages for existing orders that have none
DO $$
DECLARE
  v_order_id uuid;
BEGIN
  FOR v_order_id IN
    SELECT id FROM public.orders
    WHERE NOT EXISTS (
      SELECT 1 FROM public.order_work_packages WHERE order_id = orders.id
    )
    AND created_at > now() - interval '7 days'
  LOOP
    PERFORM public.auto_create_kitchen_work_packages(v_order_id);
  END LOOP;
END $$;

-- Done! Now create new orders and work packages should appear ✅
