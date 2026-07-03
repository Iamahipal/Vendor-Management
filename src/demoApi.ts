import { DEFAULT_DB } from './seed';
import {
  ASSET_TEMPLATES,
  AssetType,
  DatabaseState,
  Deliverable,
  NotificationLog,
  Task,
  TaskStatus,
  User
} from './types';

// -------------------------------------------------------------
// STATIC DEMO MODE (GitHub Pages)
// A browser-side port of the Express API so the app can run with no server
// at all. State persists in localStorage; live events live in memory. The
// public surface is a single drop-in replacement for fetch(), returning real
// Response objects, so App.tsx works unchanged against either backend.
// -------------------------------------------------------------

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

const LS_KEY = 'creativeflow-demo-db';
const MAX_LOGS = 500;

function loadDb(): DatabaseState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DatabaseState;
      return {
        vendors: parsed.vendors ?? [],
        users: parsed.users ?? [],
        tasks: parsed.tasks ?? [],
        deliverables: parsed.deliverables ?? [],
        logs: parsed.logs ?? []
      };
    }
  } catch (err) {
    console.error('Demo DB corrupted, resetting to seed:', err);
  }
  return structuredClone(DEFAULT_DB);
}

function saveDb(db: DatabaseState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(db));
  } catch (err) {
    console.error('Failed to persist demo DB:', err);
  }
}

export function resetDemoDb() {
  localStorage.removeItem(LS_KEY);
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function pushLog(db: DatabaseState, log: NotificationLog) {
  db.logs.unshift(log);
  if (db.logs.length > MAX_LOGS) db.logs.length = MAX_LOGS;
}

interface LiveEvent {
  seq: number;
  id: string;
  timestamp: string;
  title: string;
  message: string;
  taskId: string;
  vendorId: string;
  vendorName: string;
}

let eventSeq = 0;
const liveEvents: LiveEvent[] = [];

function pushLiveEvent(event: Omit<LiveEvent, 'seq' | 'id' | 'timestamp'>) {
  liveEvents.push({
    ...event,
    seq: ++eventSeq,
    id: newId('alert'),
    timestamp: new Date().toISOString()
  });
  if (liveEvents.length > 200) liveEvents.splice(0, liveEvents.length - 200);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function vendorName(db: DatabaseState, vendorId: string): string {
  return db.vendors.find(v => v.Vendor_ID === vendorId)?.Company_Name || 'External Agency';
}

function logVisibleToVendor(db: DatabaseState, log: NotificationLog, vendorId: string): boolean {
  if (log.meta.vendorId) return log.meta.vendorId === vendorId;
  if (log.meta.taskId) {
    const task = db.tasks.find(t => t.Task_ID === log.meta.taskId);
    return !!task && task.Assigned_Vendor_ID === vendorId;
  }
  return false;
}

const VALID_STATUSES: TaskStatus[] = ['Assigned', 'In Progress', 'Delivered', 'Approved', 'Needs Revision'];
const VENDOR_ALLOWED_STATUSES: TaskStatus[] = ['In Progress', 'Delivered'];
const OVERDUE_REESCALATE_MS = 24 * 60 * 60 * 1000;

// Same reminder/overdue logic as the server's runReminderScan
function runReminderScan(db: DatabaseState, now: Date): NotificationLog[] {
  const triggered: NotificationLog[] = [];
  db.tasks.forEach(task => {
    if (task.Status !== 'Assigned' && task.Status !== 'In Progress') return;
    const dueDate = new Date(task.Due_Date + 'T23:59:59.000Z');
    const hoursRemaining = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    const vendor = db.vendors.find(v => v.Vendor_ID === task.Assigned_Vendor_ID);

    if (hoursRemaining < 0) {
      const lastEscalation = db.logs.find(l => l.type === 'cron_overdue' && l.meta.taskId === task.Task_ID);
      if (lastEscalation && now.getTime() - new Date(lastEscalation.timestamp).getTime() < OVERDUE_REESCALATE_MS) return;
      const hoursOverdue = Math.round(-hoursRemaining);
      const log: NotificationLog = {
        id: newId('l-cron'),
        timestamp: now.toISOString(),
        type: 'cron_overdue',
        message: `🚨 OVERDUE Escalation: Creative asset "${task.Title}" is ${hoursOverdue}h past its due date (${task.Due_Date}) and still '${task.Status}'. Escalation email dispatched to ${vendor?.Company_Name || 'assigned agency'} and internal coordinators.`,
        meta: {
          taskId: task.Task_ID, taskTitle: task.Title, vendorId: task.Assigned_Vendor_ID,
          vendorName: vendor?.Company_Name, dueDate: task.Due_Date, hoursLeft: -hoursOverdue
        }
      };
      triggered.push(log);
      pushLog(db, log);
      pushLiveEvent({
        title: '🚨 Task Overdue!',
        message: `"${task.Title}" is ${hoursOverdue}h past due and still '${task.Status}'.`,
        taskId: task.Task_ID, vendorId: task.Assigned_Vendor_ID,
        vendorName: vendor?.Company_Name || 'External Agency'
      });
    } else if (hoursRemaining <= 48) {
      if (db.logs.some(l => l.type === 'cron_reminder' && l.meta.taskId === task.Task_ID)) return;
      const log: NotificationLog = {
        id: newId('l-cron'),
        timestamp: now.toISOString(),
        type: 'cron_reminder',
        message: `⏰ Automated 48h Escalation Reminder: Creative asset "${task.Title}" is due in ${Math.round(hoursRemaining)} hours! Automatic email dispatched to ${vendor?.Company_Name || 'assigned agency'}.`,
        meta: {
          taskId: task.Task_ID, taskTitle: task.Title, vendorId: task.Assigned_Vendor_ID,
          vendorName: vendor?.Company_Name, dueDate: task.Due_Date, hoursLeft: Math.round(hoursRemaining)
        }
      };
      triggered.push(log);
      pushLog(db, log);
      pushLiveEvent({
        title: '⏰ Due-Date Reminder',
        message: `"${task.Title}" is due in ${Math.round(hoursRemaining)} hours.`,
        taskId: task.Task_ID, vendorId: task.Assigned_Vendor_ID,
        vendorName: vendor?.Company_Name || 'External Agency'
      });
    }
  });
  return triggered;
}

// Drop-in fetch replacement covering every API route the frontend uses
export async function demoFetch(input: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();
  const url = new URL(input, 'http://demo.local');
  const path = url.pathname;
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const userId = headers['x-simulated-user-id'];
  let body: any = {};
  if (typeof init?.body === 'string') {
    try { body = JSON.parse(init.body); } catch { return json(400, { error: 'Validation Error: Request body is not valid JSON.' }); }
  }

  const db = loadDb();
  const user = db.users.find(u => u.User_ID === userId);
  if (!user) {
    return json(401, { error: 'Unauthorized. Simulated User Header is missing or invalid.' });
  }

  // GET /api/db
  if (method === 'GET' && path === '/api/db') {
    const rlsLogs: string[] = [`User Authenticated: ${user.Name} (${user.Role}) [demo mode]`];
    let tasks = db.tasks, deliverables = db.deliverables, vendors = db.vendors, logs = db.logs, users: User[] = db.users;
    if (user.Role === 'Vendor') {
      rlsLogs.push(`RLS Query Constraint Triggered: Role == Vendor (Vendor_ID: ${user.Vendor_ID})`);
      rlsLogs.push(`Enforcing rule: Assigned_Vendor_ID == '${user.Vendor_ID}'`);
      const ownTaskIds = new Set(db.tasks.filter(t => t.Assigned_Vendor_ID === user.Vendor_ID).map(t => t.Task_ID));
      tasks = db.tasks.filter(t => ownTaskIds.has(t.Task_ID));
      deliverables = db.deliverables.filter(d => ownTaskIds.has(d.Task_ID));
      vendors = db.vendors.filter(v => v.Vendor_ID === user.Vendor_ID);
      logs = db.logs.filter(l => logVisibleToVendor(db, l, user.Vendor_ID!));
      users = db.users.map(u => (u.User_ID === user.User_ID ? u : { ...u, Email: '' }));
      rlsLogs.push(`RLS Result: Filtered database down to ${tasks.length} Tasks, ${deliverables.length} Deliverables, ${logs.length} Logs.`);
    } else {
      rlsLogs.push('RLS Bypass: Internal PFL Team Member. Full administrative read query granted.');
    }
    return json(200, {
      user, users, vendors, tasks, deliverables, logs,
      aiProviders: [],
      rlsSimulation: {
        applied: user.Role === 'Vendor',
        targetRule: user.Role === 'Vendor'
          ? `Task.Assigned_Vendor_ID == '${user.Vendor_ID}' && Deliverable.Task.Assigned_Vendor_ID == '${user.Vendor_ID}'`
          : 'GRANT ALL (Role == Internal)',
        logs: rlsLogs,
        status: 'SECURE (STATIC DEMO)'
      }
    });
  }

  // GET /api/live-events
  if (method === 'GET' && path === '/api/live-events') {
    const sinceParam = url.searchParams.get('since');
    if (sinceParam === null) return json(200, { cursor: eventSeq, events: [] });
    const since = Number(sinceParam);
    if (!Number.isFinite(since)) return json(400, { error: "Validation Error: 'since' must be a number." });
    const visible = liveEvents.filter(e => e.seq > since && (user.Role === 'Internal' || e.vendorId === user.Vendor_ID));
    return json(200, { cursor: eventSeq, events: visible });
  }

  // POST /api/tasks
  if (method === 'POST' && path === '/api/tasks') {
    if (user.Role !== 'Internal') return json(403, { error: 'RLS Reject: Only internal PFL staff members are authorized to create or configure creative task briefs.' });
    const { Title, Asset_Type, Assigned_Vendor_ID, Due_Date, Custom_Dimensions, Custom_Guidelines, Custom_Requirements } = body;
    if (typeof Title !== 'string' || !Title.trim() || !Asset_Type || !Assigned_Vendor_ID || !Due_Date) {
      return json(400, { error: 'Validation Error: Title, Asset_Type, Assigned_Vendor_ID, and Due_Date are required fields.' });
    }
    if (!(Asset_Type in ASSET_TEMPLATES)) return json(400, { error: `Validation Error: Unknown Asset_Type '${Asset_Type}'.` });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(Due_Date) || isNaN(new Date(Due_Date).getTime())) {
      return json(400, { error: 'Validation Error: Due_Date must be a valid YYYY-MM-DD date.' });
    }
    if (new Date(Due_Date + 'T23:59:59.000Z').getTime() < Date.now()) {
      return json(400, { error: 'Validation Error: Due_Date is in the past. Please pick a future milestone date.' });
    }
    const vendor = db.vendors.find(v => v.Vendor_ID === Assigned_Vendor_ID);
    if (!vendor) return json(400, { error: 'Validation Error: Specified vendor does not exist in registry.' });

    const template = ASSET_TEMPLATES[Asset_Type as AssetType];
    const newTask: Task = {
      Task_ID: newId('t'),
      Title: Title.trim(),
      Asset_Type: Asset_Type as AssetType,
      Assigned_Vendor_ID,
      Due_Date,
      Status: 'Assigned',
      Dimensions: Custom_Dimensions || template.dimensions,
      BrandGuidelines: Custom_Guidelines || template.brandGuidelines,
      Requirements: Custom_Requirements || template.requirements,
      Created_At: new Date().toISOString()
    };
    db.tasks.push(newTask);
    const newLog: NotificationLog = {
      id: newId('l'),
      timestamp: new Date().toISOString(),
      type: 'system_template',
      message: `New creative request "${newTask.Title}" created. Automatically pre-populated specifications and guidelines for Asset Type: ${Asset_Type}.`,
      meta: { taskId: newTask.Task_ID, assetType: Asset_Type, vendorId: vendor.Vendor_ID, vendorName: vendor.Company_Name }
    };
    pushLog(db, newLog);
    pushLiveEvent({
      title: '📋 New Brief Assigned!',
      message: `A new creative brief "${newTask.Title}" (${Asset_Type}) has been assigned. Due ${Due_Date}.`,
      taskId: newTask.Task_ID, vendorId: vendor.Vendor_ID, vendorName: vendor.Company_Name
    });
    saveDb(db);
    return json(201, { task: newTask, log: newLog });
  }

  // POST /api/tasks/:id/status
  const statusMatch = path.match(/^\/api\/tasks\/([^/]+)\/status$/);
  if (method === 'POST' && statusMatch) {
    const { status } = body as { status: TaskStatus };
    if (!VALID_STATUSES.includes(status)) return json(400, { error: `Validation Error: '${status}' is not a valid task status.` });
    const task = db.tasks.find(t => t.Task_ID === statusMatch[1]);
    if (!task) return json(404, { error: 'Task not found.' });
    if (user.Role === 'Vendor') {
      if (task.Assigned_Vendor_ID !== user.Vendor_ID) return json(403, { error: 'RLS Blocked: You are not authorized to edit tasks belonging to other external agencies.' });
      if (!VENDOR_ALLOWED_STATUSES.includes(status)) return json(403, { error: `RLS Blocked: External agencies cannot set task status to '${status}'. Approval decisions are reserved for internal PFL staff.` });
    }
    const oldStatus = task.Status;
    task.Status = status;
    const newLog: NotificationLog = {
      id: newId('l'),
      timestamp: new Date().toISOString(),
      type: 'system_template',
      message: `Task "${task.Title}" status changed from '${oldStatus}' to '${status}' by ${user.Name}.`,
      meta: { taskId: task.Task_ID, taskTitle: task.Title, vendorId: task.Assigned_Vendor_ID }
    };
    pushLog(db, newLog);
    if (status === 'Delivered') {
      pushLiveEvent({
        title: '📦 Asset Delivered!',
        message: `Vendor ${user.Name} has uploaded a new creative deliverable for "${task.Title}". Ready for review.`,
        taskId: task.Task_ID, vendorId: task.Assigned_Vendor_ID, vendorName: vendorName(db, task.Assigned_Vendor_ID)
      });
    }
    saveDb(db);
    return json(200, { task, log: newLog });
  }

  // POST /api/deliverables
  if (method === 'POST' && path === '/api/deliverables') {
    const { Task_ID, File_URL, File_Name } = body;
    if (!Task_ID || typeof File_URL !== 'string' || !File_URL.trim() || typeof File_Name !== 'string' || !File_Name.trim()) {
      return json(400, { error: 'Validation Error: Task_ID, File_URL, and File_Name are required.' });
    }
    const task = db.tasks.find(t => t.Task_ID === Task_ID);
    if (!task) return json(404, { error: 'Parent task brief not found.' });
    if (user.Role === 'Vendor' && task.Assigned_Vendor_ID !== user.Vendor_ID) {
      return json(403, { error: 'RLS Blocked: You can only submit deliverables for briefs explicitly assigned to your agency.' });
    }
    const nextVersion = db.deliverables.filter(d => d.Task_ID === Task_ID).reduce((max, d) => Math.max(max, d.Version), 0) + 1;
    const newDeliverable: Deliverable = {
      Deliverable_ID: newId('d'),
      Task_ID,
      File_URL: File_URL.trim(),
      File_Name: File_Name.trim(),
      Version: nextVersion,
      Uploaded_At: new Date().toISOString(),
      Approval_Status: 'Pending',
      Feedback_History: []
    };
    db.deliverables.push(newDeliverable);
    task.Status = 'Delivered';
    const newLog: NotificationLog = {
      id: newId('l'),
      timestamp: new Date().toISOString(),
      type: 'delivered',
      message: `New creative file "${newDeliverable.File_Name}" (v${nextVersion}) uploaded by agency. Project state auto-advanced to 'Delivered'.`,
      meta: { taskId: task.Task_ID, taskTitle: task.Title, vendorId: task.Assigned_Vendor_ID, vendorName: vendorName(db, task.Assigned_Vendor_ID) }
    };
    pushLog(db, newLog);
    pushLiveEvent({
      title: '📦 Asset Delivered!',
      message: `New deliverable uploaded: "${newDeliverable.File_Name}" (Version ${nextVersion}) for "${task.Title}".`,
      taskId: task.Task_ID, vendorId: task.Assigned_Vendor_ID, vendorName: vendorName(db, task.Assigned_Vendor_ID)
    });
    saveDb(db);
    return json(201, { deliverable: newDeliverable, task, log: newLog });
  }

  // POST /api/deliverables/:id/review
  const reviewMatch = path.match(/^\/api\/deliverables\/([^/]+)\/review$/);
  if (method === 'POST' && reviewMatch) {
    const { status, comment } = body as { status: 'Approved' | 'Rejected'; comment?: string };
    if (user.Role !== 'Internal') return json(403, { error: 'RLS Reject: Only PFL internal brand managers can review and approve agency deliverables.' });
    if (status !== 'Approved' && status !== 'Rejected') return json(400, { error: "Validation Error: status must be 'Approved' or 'Rejected'." });
    const deliverable = db.deliverables.find(d => d.Deliverable_ID === reviewMatch[1]);
    if (!deliverable) return json(404, { error: 'Deliverable asset record not found.' });
    const task = db.tasks.find(t => t.Task_ID === deliverable.Task_ID);
    if (!task) return json(404, { error: 'Parent task brief not found.' });
    deliverable.Approval_Status = status;
    task.Status = status === 'Approved' ? 'Approved' : 'Needs Revision';
    if (comment && comment.trim()) {
      deliverable.Feedback_History.push({
        id: newId('f'), reviewer: user.Name, comment: comment.trim(),
        date: new Date().toISOString(), source: 'Human'
      });
    }
    const newLog: NotificationLog = {
      id: newId('l'),
      timestamp: new Date().toISOString(),
      type: 'system_template',
      message: `Deliverable review completed for "${deliverable.File_Name}": Set to '${status}'. Task updated to '${task.Status}'.`,
      meta: { taskId: task.Task_ID, taskTitle: task.Title, vendorId: task.Assigned_Vendor_ID }
    };
    pushLog(db, newLog);
    pushLiveEvent({
      title: status === 'Approved' ? '✅ Deliverable Approved!' : '🎨 Revision Requested',
      message: `"${deliverable.File_Name}" (v${deliverable.Version}) was ${status === 'Approved' ? 'approved' : 'sent back for revisions'} by ${user.Name}.`,
      taskId: task.Task_ID, vendorId: task.Assigned_Vendor_ID, vendorName: vendorName(db, task.Assigned_Vendor_ID)
    });
    saveDb(db);
    return json(200, { deliverable, task, log: newLog });
  }

  // POST /api/deliverables/:id/feedback
  const feedbackMatch = path.match(/^\/api\/deliverables\/([^/]+)\/feedback$/);
  if (method === 'POST' && feedbackMatch) {
    const { comment } = body as { comment?: string };
    if (typeof comment !== 'string' || !comment.trim()) return json(400, { error: 'Validation Error: Comment content is required.' });
    const deliverable = db.deliverables.find(d => d.Deliverable_ID === feedbackMatch[1]);
    if (!deliverable) return json(404, { error: 'Deliverable asset record not found.' });
    const task = db.tasks.find(t => t.Task_ID === deliverable.Task_ID);
    if (!task) return json(404, { error: 'Parent task brief not found.' });
    if (user.Role === 'Vendor' && task.Assigned_Vendor_ID !== user.Vendor_ID) {
      return json(403, { error: 'RLS Reject: You are not authorized to post feedback comments on this agency deliverable.' });
    }
    const trimmed = comment.trim();
    deliverable.Feedback_History.push({
      id: newId('f'), reviewer: user.Name, comment: trimmed,
      date: new Date().toISOString(), source: 'Human'
    });
    const newLog: NotificationLog = {
      id: newId('l'),
      timestamp: new Date().toISOString(),
      type: 'system_template',
      message: `💬 Back-and-forth feedback comment posted on "${deliverable.File_Name}" (v${deliverable.Version}) by ${user.Name} (${user.Role}).`,
      meta: { taskId: task.Task_ID, taskTitle: task.Title, vendorId: task.Assigned_Vendor_ID, vendorName: vendorName(db, task.Assigned_Vendor_ID) }
    };
    pushLog(db, newLog);
    pushLiveEvent({
      title: `💬 Feedback Comment from ${user.Role === 'Internal' ? 'PFL' : 'Agency'}`,
      message: `"${trimmed.length > 55 ? trimmed.substring(0, 55) + '...' : trimmed}"`,
      taskId: task.Task_ID, vendorId: task.Assigned_Vendor_ID, vendorName: vendorName(db, task.Assigned_Vendor_ID)
    });
    saveDb(db);
    return json(200, { deliverable, task, log: newLog });
  }

  // POST /api/simulate-cron
  if (method === 'POST' && path === '/api/simulate-cron') {
    if (user.Role !== 'Internal') return json(403, { error: 'Forbidden. Simulated Cron triggers are restricted to internal coordinators.' });
    const triggered = runReminderScan(db, new Date());
    if (triggered.length > 0) saveDb(db);
    return json(200, { triggered: triggered.length, reminders: triggered, logs: db.logs });
  }

  // POST /api/gemini/critique — AI providers need secret keys, which a static
  // page cannot hold, so the demo always returns the manual checklist.
  if (method === 'POST' && path === '/api/gemini/critique') {
    const { deliverableId } = body;
    if (!deliverableId) return json(400, { error: 'Validation Error: deliverableId is required.' });
    const deliverable = db.deliverables.find(d => d.Deliverable_ID === deliverableId);
    if (!deliverable) return json(404, { error: 'Deliverable record not found.' });
    const task = db.tasks.find(t => t.Task_ID === deliverable.Task_ID);
    if (!task) return json(404, { error: 'Parent task brief not found.' });
    if (user.Role === 'Vendor' && task.Assigned_Vendor_ID !== user.Vendor_ID) {
      return json(403, { error: 'RLS Blocked: You can only request AI critiques for deliverables assigned to your agency.' });
    }
    const critique = `🤖 AI critiques are unavailable in this static demo (API keys cannot be embedded in a public page — run the app locally with an NVIDIA/OpenRouter/Gemini key to enable them).

    **Review Panel Checklist (Manual Review Needed):**
    - **Dimensions**: Verify asset conforms strictly to specified format: "${task.Dimensions}".
    - **Palette**: Ensure colors align with guidelines: "${task.BrandGuidelines}".
    - **Visual Elements**: Confirm central imagery contains high-impact compositions.
    - **CTA Check**: Double check buttons are clearly visible with readable, actionable text.`;
    deliverable.Feedback_History.push({
      id: newId('f-ai'), reviewer: 'AI Director (Demo Offline)', comment: critique,
      date: new Date().toISOString(), source: 'AI'
    });
    saveDb(db);
    return json(200, { critique, deliverable, task });
  }

  return json(404, { error: `Not Found: ${method} ${path}` });
}
