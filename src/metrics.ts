import { Task, Deliverable } from './types';

// Automatic vendor quality metrics computed from what the system already
// records: every submitted version, every rejection, every approval date.
export interface VendorMetrics {
  completed: number;        // tasks approved
  active: number;           // tasks still in flight (not approved/cancelled)
  cancelled: number;
  wrongTakes: number;       // rejected versions across all time
  totalDeliverables: number;
  avgTakesPerApproval: number | null; // versions needed per approved task
  onTimeRate: number | null;          // share of approvals on/before due date
  score: number | null;               // 0-100, null until there is data
}

export function computeVendorMetrics(vendorId: string, tasks: Task[], deliverables: Deliverable[]): VendorMetrics {
  const vendorTasks = tasks.filter(t => t.Assigned_Vendor_ID === vendorId);
  const taskIds = new Set(vendorTasks.map(t => t.Task_ID));
  const vendorDeliverables = deliverables.filter(d => taskIds.has(d.Task_ID));

  const completedTasks = vendorTasks.filter(t => t.Status === 'Approved');
  const cancelled = vendorTasks.filter(t => t.Status === 'Cancelled').length;
  const active = vendorTasks.length - completedTasks.length - cancelled;

  const wrongTakes = vendorDeliverables.filter(d => d.Approval_Status === 'Rejected').length;
  const totalDeliverables = vendorDeliverables.length;

  // Versions needed per approved task (1.0 = right first time)
  let avgTakesPerApproval: number | null = null;
  if (completedTasks.length > 0) {
    const takes = completedTasks.map(t => deliverables.filter(d => d.Task_ID === t.Task_ID).length || 1);
    avgTakesPerApproval = takes.reduce((a, b) => a + b, 0) / takes.length;
  }

  // On-time = approved on or before the due date's end of day
  const withApprovalDate = completedTasks.filter(t => t.Approved_At);
  let onTimeRate: number | null = null;
  if (withApprovalDate.length > 0) {
    const onTime = withApprovalDate.filter(t =>
      new Date(t.Approved_At!).getTime() <= new Date(t.Due_Date + 'T23:59:59.999Z').getTime()
    ).length;
    onTimeRate = onTime / withApprovalDate.length;
  }

  // 0-100 score: perfect = no rejected takes, always on time.
  // Rejection share and lateness each cost up to 50 points.
  let score: number | null = null;
  if (totalDeliverables > 0 || onTimeRate !== null) {
    const rejectionShare = totalDeliverables > 0 ? wrongTakes / totalDeliverables : 0;
    const lateShare = onTimeRate !== null ? 1 - onTimeRate : 0;
    score = Math.round(Math.max(0, Math.min(100, 100 - rejectionShare * 50 - lateShare * 50)));
  }

  return { completed: completedTasks.length, active, cancelled, wrongTakes, totalDeliverables, avgTakesPerApproval, onTimeRate, score };
}
