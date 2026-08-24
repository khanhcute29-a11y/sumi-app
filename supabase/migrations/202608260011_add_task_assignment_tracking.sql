-- Add task assignment tracking to order_work_packages
-- Track who assigned, to whom, and when

ALTER TABLE order_work_packages ADD COLUMN IF NOT EXISTS assigned_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL;
ALTER TABLE order_work_packages ADD COLUMN IF NOT EXISTS assigned_to_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL;
ALTER TABLE order_work_packages ADD COLUMN IF NOT EXISTS assigned_to_staff_name TEXT;
ALTER TABLE order_work_packages ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE;

-- Create index for querying assignments by staff
CREATE INDEX IF NOT EXISTS idx_work_packages_assigned_to ON order_work_packages(assigned_to_staff_id);
CREATE INDEX IF NOT EXISTS idx_work_packages_assigned_by ON order_work_packages(assigned_by_staff_id);

-- RPC: Assign work package to staff
CREATE OR REPLACE FUNCTION assign_work_package(
  p_work_package_id UUID,
  p_assigned_by_staff_id UUID,
  p_assigned_to_staff_id UUID,
  p_assigned_to_staff_name TEXT
) RETURNS JSON AS $$
DECLARE
  v_order_id UUID;
BEGIN
  -- Update work package with assignment
  UPDATE order_work_packages
  SET
    assigned_by_staff_id = p_assigned_by_staff_id,
    assigned_to_staff_id = p_assigned_to_staff_id,
    assigned_to_staff_name = p_assigned_to_staff_name,
    assigned_at = NOW(),
    updated_at = NOW()
  WHERE id = p_work_package_id
  RETURNING order_id INTO v_order_id;

  -- Log to kpi_logs
  INSERT INTO kpi_logs (order_id, event_type, staff_name, created_at)
  VALUES (v_order_id, 'task_assigned', p_assigned_to_staff_name, NOW());

  -- Log to domain_events
  INSERT INTO domain_events (entity_type, entity_id, event_type, occurred_at, payload)
  VALUES (
    'order',
    v_order_id,
    'task_assigned',
    NOW(),
    json_build_object(
      'work_package_id', p_work_package_id,
      'assigned_by_id', p_assigned_by_staff_id,
      'assigned_to_id', p_assigned_to_staff_id,
      'assigned_to_name', p_assigned_to_staff_name
    )
  );

  RETURN json_build_object(
    'success', true,
    'work_package_id', p_work_package_id,
    'order_id', v_order_id,
    'assigned_at', NOW()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Clear work package assignment (unassign)
CREATE OR REPLACE FUNCTION unassign_work_package(p_work_package_id UUID)
RETURNS JSON AS $$
DECLARE
  v_order_id UUID;
BEGIN
  UPDATE order_work_packages
  SET
    assigned_by_staff_id = NULL,
    assigned_to_staff_id = NULL,
    assigned_to_staff_name = NULL,
    assigned_at = NULL,
    updated_at = NOW()
  WHERE id = p_work_package_id
  RETURNING order_id INTO v_order_id;

  INSERT INTO kpi_logs (order_id, event_type, staff_name, created_at)
  VALUES (v_order_id, 'task_unassigned', 'System', NOW());

  RETURN json_build_object('success', true, 'order_id', v_order_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
