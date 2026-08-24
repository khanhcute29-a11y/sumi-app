import { supabase } from '../../../src/lib/supabaseClient.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { workPackageId, assignedToStaffId, assignedToStaffName, assignedByStaffId } = req.body;

    if (!workPackageId || !assignedToStaffId || !assignedToStaffName) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Missing required fields: workPackageId, assignedToStaffId, assignedToStaffName'
      });
    }

    // Call RPC to assign work package
    const { data, error } = await supabase.rpc('assign_work_package', {
      p_work_package_id: workPackageId,
      p_assigned_by_staff_id: assignedByStaffId || null,
      p_assigned_to_staff_id: assignedToStaffId,
      p_assigned_to_staff_name: assignedToStaffName
    });

    if (error) {
      console.error('assign_work_package RPC error:', error);
      return res.status(500).json({
        success: false,
        code: 500,
        message: error.message
      });
    }

    if (!data.success) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: data.error || 'Failed to assign work package'
      });
    }

    return res.status(200).json({
      success: true,
      code: 200,
      message: 'Task assigned successfully',
      data: {
        workPackageId: data.work_package_id,
        orderId: data.order_id,
        assignedAt: data.assigned_at
      }
    });
  } catch (err) {
    console.error('assign-task error:', err);
    return res.status(500).json({
      success: false,
      code: 500,
      message: err.message || 'Internal server error'
    });
  }
}
