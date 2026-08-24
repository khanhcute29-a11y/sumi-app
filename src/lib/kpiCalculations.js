/**
 * KPI Calculations - Extract metrics from order/work package data
 * Measures: time to accept, time to complete, total time, on-time/late
 */

export function calculatePackageMetrics(pkg, order) {
  if (!pkg) return null;

  const createdAt = new Date(order?.created_at || pkg.created_at);
  const assignedAt = pkg.assigned_at ? new Date(pkg.assigned_at) : null;
  const acceptedAt = pkg.accepted_at ? new Date(pkg.accepted_at) : null;
  const completedAt = pkg.completed_at ? new Date(pkg.completed_at) : null;
  const requiredAt = order?.required_at ? new Date(order.required_at) : null;

  // Calculate durations (in minutes)
  const timeToAssign = assignedAt ? Math.round((assignedAt - createdAt) / 60000) : null;
  const timeToConfirm = acceptedAt && assignedAt ? Math.round((acceptedAt - assignedAt) / 60000) : null;
  const timeToComplete = completedAt && acceptedAt ? Math.round((completedAt - acceptedAt) / 60000) : null;
  const totalTime = completedAt ? Math.round((completedAt - createdAt) / 60000) : null;

  // On-time check
  const isOnTime = completedAt && requiredAt ? completedAt <= requiredAt : null;
  const lateBy = completedAt && requiredAt && completedAt > requiredAt
    ? Math.round((completedAt - requiredAt) / 60000)
    : null;

  return {
    // Timestamps
    createdAt,
    assignedAt,
    acceptedAt,
    completedAt,
    requiredAt,

    // Durations (minutes)
    timeToAssign,
    timeToConfirm,
    timeToComplete,
    totalTime,

    // Performance
    isOnTime,
    lateBy,
    status: completedAt ? 'completed' : acceptedAt ? 'in_progress' : assignedAt ? 'assigned' : 'pending'
  };
}

/**
 * Format duration in human-readable format (Vietnamese)
 */
export function formatDuration(minutes) {
  if (!minutes) return 'N/A';
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}p` : `${hours} giờ`;
}

/**
 * Calculate staff KPI summary
 */
export function calculateStaffKPI(staffTasks = []) {
  if (!staffTasks.length) return null;

  const completedTasks = staffTasks.filter(t => t.completed_at);
  const onTimeTasks = completedTasks.filter(t => t.isOnTime);

  const avgTimeToConfirm = completedTasks.length > 0
    ? Math.round(completedTasks.reduce((sum, t) => sum + (t.timeToConfirm || 0), 0) / completedTasks.length)
    : 0;

  const avgTimeToComplete = completedTasks.length > 0
    ? Math.round(completedTasks.reduce((sum, t) => sum + (t.timeToComplete || 0), 0) / completedTasks.length)
    : 0;

  const avgTotalTime = completedTasks.length > 0
    ? Math.round(completedTasks.reduce((sum, t) => sum + (t.totalTime || 0), 0) / completedTasks.length)
    : 0;

  const onTimeRate = completedTasks.length > 0
    ? Math.round((onTimeTasks.length / completedTasks.length) * 100)
    : 0;

  return {
    totalTasks: staffTasks.length,
    completedTasks: completedTasks.length,
    onTimeTasks: onTimeTasks.length,
    onTimeRate,
    avgTimeToConfirm,
    avgTimeToComplete,
    avgTotalTime
  };
}

/**
 * Group tasks by date
 */
export function groupTasksByDate(tasks = []) {
  const grouped = {};

  tasks.forEach(task => {
    const date = new Date(task.created_at || task.assigned_at).toLocaleDateString('vi-VN');
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(task);
  });

  return grouped;
}

/**
 * Group tasks by type (daily vs ad-hoc)
 */
export function groupTasksByType(tasks = []) {
  return {
    daily: tasks.filter(t => t.recurrence === 'daily' || t.recurrence === 'weekly' || t.recurrence === 'monthly'),
    adhoc: tasks.filter(t => !t.recurrence || t.recurrence === 'once')
  };
}

/**
 * Format metrics for display
 */
export function formatMetrics(metrics) {
  if (!metrics) return {};

  return {
    timeToAssign: metrics.timeToAssign ? `${metrics.timeToAssign}p` : '-',
    timeToConfirm: metrics.timeToConfirm ? `${metrics.timeToConfirm}p` : '-',
    timeToComplete: formatDuration(metrics.timeToComplete),
    totalTime: formatDuration(metrics.totalTime),
    status: getStatusLabel(metrics.status),
    onTime: metrics.isOnTime === null ? '-' : metrics.isOnTime ? '✅ Đúng giờ' : `⚠️ Trễ ${metrics.lateBy}p`
  };
}

function getStatusLabel(status) {
  const labels = {
    pending: '⏳ Chờ giao',
    assigned: '🔄 Chờ xác nhận',
    in_progress: '🔨 Đang làm',
    completed: '✅ Hoàn thành'
  };
  return labels[status] || status;
}
