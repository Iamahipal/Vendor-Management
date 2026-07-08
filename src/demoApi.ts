import { DEFAULT_DB } from './seed';
import {
  ASSET_TEMPLATES,
  AssetType,
  DatabaseState,
  Deliverable,
  NotificationLog,
  Task,
  TaskStatus,
  User,
  Vendor,
  Communication,
  COMMS_CHANNELS,
  CHANNEL_ASSET_TYPE,
  INHOUSE_VENDOR_ID,
  AUDIENCES,
  WeeklyPlacement,
  PLACEMENT_SURFACES,
  Webinar
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
        communications: parsed.communications ?? [],
        placements: parsed.placements ?? [],
        webinars: parsed.webinars ?? [],
        logs: parsed.logs ?? []
      };
    }
  } catch (err) {
    console.error('Demo DB corrupted, resetting to seed:', err);
  }
  return structuredClone(DEFAULT_DB);
}

// Migrate records created before task-level conversations / in-house work /
// the calendar & release SPOC
function migrate(db: DatabaseState): DatabaseState {
  db.communications ??= [];
  db.placements ??= [];
  db.webinars ??= [];
  db.communications.forEach((c: any) => {
    if (!c.Languages) c.Languages = c.Language ? [c.Language] : ['English'];
    if (c.Channel === 'Email') c.Channel = 'Mail';
  });
  db.tasks.forEach(t => { t.Comments ??= []; });
  if (!db.vendors.some(v => v.Vendor_ID === 'v-inhouse')) {
    db.vendors.unshift({
      Vendor_ID: 'v-inhouse',
      Company_Name: 'In-house Team',
      Specialty: 'Deployed internally via Snapcoms (wallpapers, tickers, popups)',
      Logo: ''
    });
  }
  if (!db.users.some(u => u.Role === 'Release')) {
    const seedSpoc = DEFAULT_DB.users.find(u => u.Role === 'Release');
    if (seedSpoc) db.users.push(seedSpoc);
  }
  return db;
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

  const db = migrate(loadDb());
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
    const communications =
      user.Role === 'Internal'
        ? db.communications
        : user.Role === 'Release'
          ? db.communications.filter(c => c.Status === 'Handed Off' || c.Status === 'Released')
          : [];
    return json(200, {
      user, users, vendors, tasks, deliverables, communications,
      placements: user.Role === 'Internal' ? db.placements : [],
      webinars: user.Role === 'Internal' ? db.webinars : [],
      logs,
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

  // POST /api/tasks/:id/comments — question/note thread on the request itself
  const taskCommentMatch = path.match(/^\/api\/tasks\/([^/]+)\/comments$/);
  if (method === 'POST' && taskCommentMatch) {
    const { comment } = body as { comment?: string };
    if (typeof comment !== 'string' || !comment.trim()) return json(400, { error: 'Validation Error: Comment content is required.' });
    const task = db.tasks.find(t => t.Task_ID === taskCommentMatch[1]);
    if (!task) return json(404, { error: 'Task not found.' });
    if (user.Role === 'Vendor' && task.Assigned_Vendor_ID !== user.Vendor_ID) {
      return json(403, { error: 'RLS Blocked: You can only comment on requests assigned to your agency.' });
    }
    const trimmed = comment.trim();
    (task.Comments ??= []).push({
      id: newId('c'), reviewer: user.Name, comment: trimmed,
      date: new Date().toISOString(), source: 'Human'
    });
    pushLog(db, {
      id: newId('l'), timestamp: new Date().toISOString(), type: 'system_template',
      message: `💬 Question/note on request "${task.Title}" from ${user.Name}: "${trimmed.length > 80 ? trimmed.slice(0, 80) + '...' : trimmed}"`,
      meta: { taskId: task.Task_ID, taskTitle: task.Title, vendorId: task.Assigned_Vendor_ID }
    });
    pushLiveEvent({
      title: `💬 Note on "${task.Title.length > 30 ? task.Title.slice(0, 30) + '...' : task.Title}"`,
      message: `${user.Name}: "${trimmed.length > 55 ? trimmed.slice(0, 55) + '...' : trimmed}"`,
      taskId: task.Task_ID, vendorId: task.Assigned_Vendor_ID, vendorName: vendorName(db, task.Assigned_Vendor_ID)
    });
    saveDb(db);
    return json(200, { task });
  }

  // PATCH /api/tasks/:id — edit a request (internal only)
  const taskEditMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
  if (method === 'PATCH' && taskEditMatch) {
    if (user.Role !== 'Internal') return json(403, { error: 'RLS Reject: Only internal staff can edit requests.' });
    const task = db.tasks.find(t => t.Task_ID === taskEditMatch[1]);
    if (!task) return json(404, { error: 'Task not found.' });
    const { Title, Due_Date, Assigned_Vendor_ID, Dimensions, BrandGuidelines, Requirements } = body as Partial<Task>;
    const changes: string[] = [];
    if (Title !== undefined) {
      if (typeof Title !== 'string' || !Title.trim()) return json(400, { error: 'Validation Error: Title cannot be empty.' });
      if (Title.trim() !== task.Title) { changes.push(`title → "${Title.trim()}"`); task.Title = Title.trim(); }
    }
    if (Due_Date !== undefined && Due_Date !== task.Due_Date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(Due_Date) || isNaN(new Date(Due_Date).getTime())) {
        return json(400, { error: 'Validation Error: Due_Date must be a valid YYYY-MM-DD date.' });
      }
      if (new Date(Due_Date + 'T23:59:59.000Z').getTime() < Date.now()) {
        return json(400, { error: 'Validation Error: Due_Date is in the past. Please pick a future date.' });
      }
      changes.push(`due date → ${Due_Date}`);
      task.Due_Date = Due_Date;
    }
    if (Assigned_Vendor_ID !== undefined && Assigned_Vendor_ID !== task.Assigned_Vendor_ID) {
      const vendor = db.vendors.find(v => v.Vendor_ID === Assigned_Vendor_ID);
      if (!vendor) return json(400, { error: 'Validation Error: Specified vendor does not exist.' });
      changes.push(`vendor → ${vendor.Company_Name}`);
      task.Assigned_Vendor_ID = Assigned_Vendor_ID;
    }
    if (Dimensions !== undefined && Dimensions !== task.Dimensions) { task.Dimensions = Dimensions; changes.push('size updated'); }
    if (BrandGuidelines !== undefined && BrandGuidelines !== task.BrandGuidelines) { task.BrandGuidelines = BrandGuidelines; changes.push('guidelines updated'); }
    if (Requirements !== undefined && Requirements !== task.Requirements) { task.Requirements = Requirements; changes.push('requirements updated'); }
    if (changes.length > 0) {
      pushLog(db, {
        id: newId('l'), timestamp: new Date().toISOString(), type: 'system_template',
        message: `✏️ Request "${task.Title}" updated by ${user.Name}: ${changes.join(', ')}.`,
        meta: { taskId: task.Task_ID, taskTitle: task.Title, vendorId: task.Assigned_Vendor_ID }
      });
      pushLiveEvent({
        title: '✏️ Request Updated',
        message: `"${task.Title}": ${changes.join(', ')}.`,
        taskId: task.Task_ID, vendorId: task.Assigned_Vendor_ID, vendorName: vendorName(db, task.Assigned_Vendor_ID)
      });
      saveDb(db);
    }
    return json(200, { task, changed: changes });
  }

  // DELETE /api/tasks/:id — soft-cancel (history is kept forever)
  if (method === 'DELETE' && taskEditMatch) {
    if (user.Role !== 'Internal') return json(403, { error: 'RLS Reject: Only internal staff can cancel requests.' });
    const task = db.tasks.find(t => t.Task_ID === taskEditMatch[1]);
    if (!task) return json(404, { error: 'Task not found.' });
    if (task.Status === 'Cancelled') return json(400, { error: 'This request is already cancelled.' });
    task.Status = 'Cancelled';
    pushLog(db, {
      id: newId('l'), timestamp: new Date().toISOString(), type: 'system_template',
      message: `🗑️ Request "${task.Title}" was cancelled by ${user.Name}. It stays in History.`,
      meta: { taskId: task.Task_ID, taskTitle: task.Title, vendorId: task.Assigned_Vendor_ID }
    });
    pushLiveEvent({
      title: '🗑️ Request Cancelled',
      message: `"${task.Title}" has been cancelled — no further work needed.`,
      taskId: task.Task_ID, vendorId: task.Assigned_Vendor_ID, vendorName: vendorName(db, task.Assigned_Vendor_ID)
    });
    saveDb(db);
    return json(200, { removed: task.Task_ID, task });
  }

  // POST /api/ai/organize-brief — needs private AI keys, unavailable in demo
  if (method === 'POST' && path === '/api/ai/organize-brief') {
    return json(502, { error: 'AI brief organizer is offline in this static demo (it needs private API keys). Run the app locally to use it — or fill the form manually.' });
  }

  // POST /api/ai/parse-booking — needs private AI keys, unavailable in demo
  if (method === 'POST' && path === '/api/ai/parse-booking') {
    return json(502, { error: 'AI booking parser is offline in this static demo (it needs private API keys). Run the server build with a key to use it — or fill the card manually.' });
  }

  // POST /api/vendors — add vendor + contact login (internal only)
  if (method === 'POST' && path === '/api/vendors') {
    if (user.Role !== 'Internal') return json(403, { error: 'RLS Reject: Only internal staff can manage vendors.' });
    const { Company_Name, Specialty, Contact_Name, Contact_Email } = body as Record<string, string>;
    if (!Company_Name?.trim() || !Contact_Name?.trim() || !Contact_Email?.trim()) {
      return json(400, { error: 'Validation Error: Company name, contact name and contact email are required.' });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(Contact_Email.trim())) {
      return json(400, { error: 'Validation Error: Contact email does not look valid.' });
    }
    if (db.vendors.some(v => v.Company_Name.toLowerCase() === Company_Name.trim().toLowerCase())) {
      return json(400, { error: 'Validation Error: A vendor with this company name already exists.' });
    }
    const vendor: Vendor = {
      Vendor_ID: newId('v'),
      Company_Name: Company_Name.trim(),
      Specialty: Specialty?.trim() || 'Creative design',
      Logo: ''
    };
    db.vendors.push(vendor);
    const contact: User = {
      User_ID: newId('u'),
      Name: Contact_Name.trim(),
      Email: Contact_Email.trim(),
      Role: 'Vendor',
      Vendor_ID: vendor.Vendor_ID,
      Avatar: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(Contact_Name.trim())}`
    };
    db.users.push(contact);
    pushLog(db, {
      id: newId('l'), timestamp: new Date().toISOString(), type: 'system_template',
      message: `🤝 New vendor added: ${vendor.Company_Name} (contact: ${contact.Name}, ${contact.Email}).`,
      meta: { vendorId: vendor.Vendor_ID, vendorName: vendor.Company_Name }
    });
    saveDb(db);
    return json(201, { vendor, contact });
  }

  // PATCH /api/vendors/:id — edit vendor and contact (internal only)
  const vendorEditMatch = path.match(/^\/api\/vendors\/([^/]+)$/);
  if (method === 'PATCH' && vendorEditMatch) {
    if (user.Role !== 'Internal') return json(403, { error: 'RLS Reject: Only internal staff can manage vendors.' });
    const vendor = db.vendors.find(v => v.Vendor_ID === vendorEditMatch[1]);
    if (!vendor) return json(404, { error: 'Vendor not found.' });
    const { Company_Name, Specialty, Contact_Name, Contact_Email } = body as Record<string, string>;
    if (Company_Name !== undefined) {
      if (!Company_Name.trim()) return json(400, { error: 'Validation Error: Company name cannot be empty.' });
      vendor.Company_Name = Company_Name.trim();
    }
    if (Specialty !== undefined) vendor.Specialty = Specialty.trim();
    const contact = db.users.find(u => u.Role === 'Vendor' && u.Vendor_ID === vendor.Vendor_ID);
    if (contact) {
      if (Contact_Name !== undefined && Contact_Name.trim()) contact.Name = Contact_Name.trim();
      if (Contact_Email !== undefined && Contact_Email.trim()) {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(Contact_Email.trim())) {
          return json(400, { error: 'Validation Error: Contact email does not look valid.' });
        }
        contact.Email = Contact_Email.trim();
      }
    }
    pushLog(db, {
      id: newId('l'), timestamp: new Date().toISOString(), type: 'system_template',
      message: `✏️ Vendor "${vendor.Company_Name}" details updated by ${user.Name}.`,
      meta: { vendorId: vendor.Vendor_ID, vendorName: vendor.Company_Name }
    });
    saveDb(db);
    return json(200, { vendor, contact: contact ?? null });
  }

  // ---- CALENDAR / RELEASE PIPELINE ----
  const slotConflict = (date: string, time: string, channel: string, ignoreId?: string): string | null => {
    const active = db.communications.filter(x => x.Status !== 'Cancelled' && x.Comm_ID !== ignoreId && x.Release_Date === date);
    const same = active.find(x => x.Release_Time === time && x.Channel === channel);
    if (same) return `That slot is already taken: ${channel} on ${date} at ${time} ("${same.Campaign_Name}"). Pick another slot.`;
    if (channel === 'Ticker' || channel === 'Desktop Pop-up') {
      const other = channel === 'Ticker' ? 'Desktop Pop-up' : 'Ticker';
      const clash = active.find(x => x.Release_Time === time && x.Channel === other);
      if (clash) return `Ticker and Pop-up can't go at the same time. "${clash.Campaign_Name}" (${other}) is already at ${time}.`;
    }
    return null;
  };

  // POST /api/communications — book a slot (IC only)
  if (method === 'POST' && path === '/api/communications') {
    if (user.Role !== 'Internal') return json(403, { error: 'Only the IC team can book calendar slots.' });
    const c = body as Partial<Communication>;
    const isBlock = c.Blocked === true;
    if (!c.Channel || !COMMS_CHANNELS.includes(c.Channel)) return json(400, { error: 'A valid communication channel is required.' });
    if (!c.Release_Date || !/^\d{4}-\d{2}-\d{2}$/.test(c.Release_Date) || isNaN(new Date(c.Release_Date).getTime())) return json(400, { error: 'A valid release date (YYYY-MM-DD) is required.' });
    if (!c.Release_Time) return json(400, { error: 'A release time slot is required.' });
    if (!isBlock && (!c.Campaign_Name?.trim() || !c.Subject_Line?.trim())) return json(400, { error: 'Campaign name and subject line are required.' });
    if (c.Audience && !AUDIENCES.includes(c.Audience)) return json(400, { error: 'Invalid audience.' });
    const conflict = slotConflict(c.Release_Date, c.Release_Time, c.Channel);
    if (conflict) return json(409, { error: conflict });
    const comm: Communication = {
      Comm_ID: newId('c'),
      Channel: c.Channel,
      Release_Date: c.Release_Date,
      Release_Time: c.Release_Time,
      Department: c.Department?.trim() || '',
      Campaign_Name: isBlock ? (c.Campaign_Name?.trim() || '(Blocked)') : c.Campaign_Name!.trim(),
      Subject_Line: c.Subject_Line?.trim() || '',
      Comms_SPOC: c.Comms_SPOC?.trim() || user.Name,
      Business_SPOC: c.Business_SPOC?.trim() || '',
      Audience: (c.Audience as Communication['Audience']) || 'All Employees',
      Languages: Array.isArray(c.Languages) && c.Languages.length ? c.Languages : ['English'],
      Sub_Type: c.Sub_Type,
      Category: c.Category,
      Blocked: isBlock || undefined,
      CTA_Text: c.CTA_Text?.trim() || undefined,
      CTA_Link: c.CTA_Link?.trim() || undefined,
      Sender_ID: c.Sender_ID?.trim() || undefined,
      Creative_Link: c.Creative_Link?.trim() || undefined,
      Status: 'Booked',
      Created_At: new Date().toISOString(),
      Notes: c.Notes?.trim() || undefined
    };
    db.communications.push(comm);
    pushLog(db, {
      id: newId('l'), timestamp: new Date().toISOString(), type: 'system_template',
      message: `📅 Slot booked: ${comm.Channel} on ${comm.Release_Date} at ${comm.Release_Time} — "${comm.Campaign_Name}" (${comm.Department || 'no dept'}).`,
      meta: { taskTitle: comm.Campaign_Name }
    });
    saveDb(db);
    return json(201, { communication: comm });
  }

  const commMatch = path.match(/^\/api\/communications\/([^/]+)$/);
  const commActionMatch = path.match(/^\/api\/communications\/([^/]+)\/(create-task|ready|handoff|release)$/);

  // PATCH /api/communications/:id — edit booking (IC only)
  if (method === 'PATCH' && commMatch) {
    if (user.Role !== 'Internal') return json(403, { error: 'Only the IC team can edit bookings.' });
    const comm = db.communications.find(x => x.Comm_ID === commMatch[1]);
    if (!comm) return json(404, { error: 'Booking not found.' });
    const c = body as Partial<Communication>;
    const nextDate = c.Release_Date ?? comm.Release_Date;
    const nextTime = c.Release_Time ?? comm.Release_Time;
    const nextChannel = c.Channel ?? comm.Channel;
    if (c.Release_Date && (!/^\d{4}-\d{2}-\d{2}$/.test(c.Release_Date) || isNaN(new Date(c.Release_Date).getTime()))) return json(400, { error: 'A valid release date (YYYY-MM-DD) is required.' });
    if (c.Channel && !COMMS_CHANNELS.includes(c.Channel)) return json(400, { error: 'Invalid channel.' });
    if (nextDate !== comm.Release_Date || nextTime !== comm.Release_Time || nextChannel !== comm.Channel) {
      const conflict = slotConflict(nextDate, nextTime, nextChannel, comm.Comm_ID);
      if (conflict) return json(409, { error: conflict });
    }
    const editable: (keyof Communication)[] = ['Channel', 'Release_Date', 'Release_Time', 'Department', 'Campaign_Name', 'Subject_Line', 'Comms_SPOC', 'Business_SPOC', 'Audience', 'Languages', 'Sub_Type', 'Category', 'CTA_Text', 'CTA_Link', 'Sender_ID', 'Creative_Link', 'Notes'];
    for (const k of editable) {
      if ((c as any)[k] !== undefined) (comm as any)[k] = typeof (c as any)[k] === 'string' ? (c as any)[k].trim() : (c as any)[k];
    }
    pushLog(db, {
      id: newId('l'), timestamp: new Date().toISOString(), type: 'system_template',
      message: `✏️ Booking updated: "${comm.Campaign_Name}" (${comm.Channel}, ${comm.Release_Date} ${comm.Release_Time}).`,
      meta: { taskTitle: comm.Campaign_Name }
    });
    saveDb(db);
    return json(200, { communication: comm });
  }

  // DELETE /api/communications/:id — cancel (IC only)
  if (method === 'DELETE' && commMatch) {
    if (user.Role !== 'Internal') return json(403, { error: 'Only the IC team can cancel bookings.' });
    const comm = db.communications.find(x => x.Comm_ID === commMatch[1]);
    if (!comm) return json(404, { error: 'Booking not found.' });
    comm.Status = 'Cancelled';
    pushLog(db, {
      id: newId('l'), timestamp: new Date().toISOString(), type: 'system_template',
      message: `🗑️ Booking cancelled: "${comm.Campaign_Name}" (${comm.Channel}, ${comm.Release_Date}).`,
      meta: { taskTitle: comm.Campaign_Name }
    });
    saveDb(db);
    return json(200, { communication: comm });
  }

  if (method === 'POST' && commActionMatch) {
    const comm = db.communications.find(x => x.Comm_ID === commActionMatch[1]);
    const action = commActionMatch[2];
    if (!comm) return json(404, { error: 'Booking not found.' });

    if (action === 'create-task') {
      if (user.Role !== 'Internal') return json(403, { error: 'Only the IC team can create design tasks.' });
      if (comm.Linked_Task_ID && db.tasks.some(t => t.Task_ID === comm.Linked_Task_ID)) return json(400, { error: 'This booking already has a design task.' });
      const vendorId = (body.Assigned_Vendor_ID as string) || INHOUSE_VENDOR_ID;
      const vendor = db.vendors.find(v => v.Vendor_ID === vendorId);
      if (!vendor) return json(400, { error: 'Specified vendor does not exist.' });
      const assetType: AssetType = CHANNEL_ASSET_TYPE[comm.Channel] || 'Emailer';
      const template = ASSET_TEMPLATES[assetType];
      const task: Task = {
        Task_ID: newId('t'), Title: comm.Campaign_Name, Asset_Type: assetType,
        Assigned_Vendor_ID: vendorId, Due_Date: comm.Release_Date, Status: 'Assigned',
        Dimensions: template.dimensions, BrandGuidelines: template.brandGuidelines,
        Requirements: template.requirements, Created_At: new Date().toISOString(), Comments: []
      };
      db.tasks.push(task);
      comm.Linked_Task_ID = task.Task_ID;
      comm.Status = 'In Design';
      pushLog(db, {
        id: newId('l'), timestamp: new Date().toISOString(), type: 'system_template',
        message: `🎨 Design task created for "${comm.Campaign_Name}" → ${vendor.Company_Name} (${assetType}).`,
        meta: { taskId: task.Task_ID, taskTitle: task.Title, vendorId: vendor.Vendor_ID, vendorName: vendor.Company_Name }
      });
      pushLiveEvent({
        title: '📋 New Brief Assigned!',
        message: `A new brief "${task.Title}" (${assetType}) has been assigned. Due ${task.Due_Date}.`,
        taskId: task.Task_ID, vendorId: vendor.Vendor_ID, vendorName: vendor.Company_Name
      });
      saveDb(db);
      return json(201, { communication: comm, task });
    }

    if (action === 'ready') {
      if (user.Role !== 'Internal') return json(403, { error: 'Only the IC team can update bookings.' });
      if (body.Creative_Link?.trim()) comm.Creative_Link = body.Creative_Link.trim();
      comm.Status = 'Ready';
      saveDb(db);
      return json(200, { communication: comm });
    }

    if (action === 'handoff') {
      if (user.Role !== 'Internal') return json(403, { error: 'Only the IC team can hand off releases.' });
      for (const k of ['CTA_Text', 'CTA_Link', 'Sender_ID', 'Creative_Link', 'Notes'] as const) {
        if (typeof body[k] === 'string' && body[k].trim()) (comm as any)[k] = body[k].trim();
      }
      comm.Status = 'Handed Off';
      comm.Handed_Off_At = new Date().toISOString();
      const spoc = db.users.find(u => u.Role === 'Release');
      pushLog(db, {
        id: newId('l'), timestamp: new Date().toISOString(), type: 'system_template',
        message: `📤 Release handed off to ${spoc?.Name || 'release SPOC'}: "${comm.Campaign_Name}" (${comm.Channel}, ${comm.Release_Date} ${comm.Release_Time}).`,
        meta: { taskTitle: comm.Campaign_Name }
      });
      pushLiveEvent({
        title: '📤 Ready to Release',
        message: `"${comm.Campaign_Name}" (${comm.Channel}) is ready to go live on ${comm.Release_Date} at ${comm.Release_Time}.`,
        taskId: comm.Comm_ID, vendorId: '', vendorName: 'Release Desk'
      });
      saveDb(db);
      return json(200, { communication: comm });
    }

    if (action === 'release') {
      if (user.Role !== 'Release' && user.Role !== 'Internal') return json(403, { error: 'Only the IC team or release SPOC can mark a communication as released.' });
      if (comm.Status !== 'Handed Off') return json(400, { error: 'Only handed-off communications can be released.' });
      comm.Status = 'Released';
      comm.Released_At = new Date().toISOString();
      comm.Released_By = user.Name;
      pushLog(db, {
        id: newId('l'), timestamp: new Date().toISOString(), type: 'system_template',
        message: `✅ Released: "${comm.Campaign_Name}" (${comm.Channel}) went live — released by ${user.Name}.`,
        meta: { taskTitle: comm.Campaign_Name }
      });
      pushLiveEvent({
        title: '✅ Communication Released',
        message: `"${comm.Campaign_Name}" (${comm.Channel}) is now live.`,
        taskId: comm.Comm_ID, vendorId: '', vendorName: user.Name
      });
      saveDb(db);
      return json(200, { communication: comm });
    }
  }

  // ---- WEEKLY PLACEMENTS ----
  if (method === 'POST' && path === '/api/placements') {
    if (user.Role !== 'Internal') return json(403, { error: 'Only the IC team can plan placements.' });
    const b = body as Partial<WeeklyPlacement>;
    if (!b.Surface || !PLACEMENT_SURFACES.includes(b.Surface)) return json(400, { error: 'A valid placement surface is required.' });
    if (!b.Start_Date || !/^\d{4}-\d{2}-\d{2}$/.test(b.Start_Date)) return json(400, { error: 'A valid start date is required.' });
    if (!b.End_Date || !/^\d{4}-\d{2}-\d{2}$/.test(b.End_Date)) return json(400, { error: 'A valid end date is required.' });
    if (b.End_Date < b.Start_Date) return json(400, { error: 'End date must be on or after the start date.' });
    const overlap = db.placements.find(p => p.Surface === b.Surface && !(b.End_Date! < p.Start_Date || b.Start_Date! > p.End_Date));
    if (overlap) return json(409, { error: `${b.Surface} is already booked ${overlap.Start_Date}–${overlap.End_Date} ("${overlap.Campaign_Theme || 'Blocked'}").` });
    const placement: WeeklyPlacement = {
      Placement_ID: newId('p'), Surface: b.Surface, Start_Date: b.Start_Date, End_Date: b.End_Date,
      Business_Unit: b.Business_Unit?.trim() || '', Campaign_Theme: b.Campaign_Theme?.trim() || '',
      Comms_SPOC: b.Comms_SPOC?.trim() || user.Name, Business_SPOC: b.Business_SPOC?.trim() || '',
      Audience: b.Audience?.trim() || 'All Employees', Status: (b.Status as WeeklyPlacement['Status']) || 'Planned',
      Comments: b.Comments?.trim() || undefined, Created_At: new Date().toISOString()
    };
    db.placements.push(placement);
    pushLog(db, { id: newId('l'), timestamp: new Date().toISOString(), type: 'system_template',
      message: `🖼️ ${placement.Surface} booked ${placement.Start_Date}–${placement.End_Date}: "${placement.Campaign_Theme || 'Blocked'}".`, meta: { taskTitle: placement.Campaign_Theme } });
    saveDb(db);
    return json(201, { placement });
  }
  const placementMatch = path.match(/^\/api\/placements\/([^/]+)$/);
  if (method === 'PATCH' && placementMatch) {
    if (user.Role !== 'Internal') return json(403, { error: 'Only the IC team can edit placements.' });
    const p = db.placements.find(x => x.Placement_ID === placementMatch[1]);
    if (!p) return json(404, { error: 'Placement not found.' });
    for (const k of ['Business_Unit', 'Campaign_Theme', 'Comms_SPOC', 'Business_SPOC', 'Audience', 'Status', 'Comments'] as const) {
      if (typeof body[k] === 'string') (p as any)[k] = body[k].trim();
    }
    saveDb(db);
    return json(200, { placement: p });
  }
  if (method === 'DELETE' && placementMatch) {
    if (user.Role !== 'Internal') return json(403, { error: 'Only the IC team can remove placements.' });
    const idx = db.placements.findIndex(x => x.Placement_ID === placementMatch[1]);
    if (idx === -1) return json(404, { error: 'Placement not found.' });
    const [removed] = db.placements.splice(idx, 1);
    saveDb(db);
    return json(200, { removed: removed.Placement_ID });
  }

  // ---- WEBINARS ----
  if (method === 'POST' && path === '/api/webinars') {
    if (user.Role !== 'Internal') return json(403, { error: 'Only the IC team can schedule webinars.' });
    const b = body as Partial<Webinar>;
    if (!b.Date || !/^\d{4}-\d{2}-\d{2}$/.test(b.Date)) return json(400, { error: 'A valid date is required.' });
    if (!b.Topic?.trim()) return json(400, { error: 'A webinar topic is required.' });
    const webinar: Webinar = {
      Webinar_ID: newId('w'), Date: b.Date, Start_Time: b.Start_Time?.trim() || '15:00', End_Time: b.End_Time?.trim() || '16:00',
      Department: b.Department?.trim() || '', Topic: b.Topic.trim(), Host: b.Host?.trim() || '',
      Comms_SPOC: b.Comms_SPOC?.trim() || user.Name, Audience: b.Audience?.trim() || 'All Employees',
      Views: typeof b.Views === 'number' ? b.Views : undefined, Created_At: new Date().toISOString()
    };
    db.webinars.push(webinar);
    pushLog(db, { id: newId('l'), timestamp: new Date().toISOString(), type: 'system_template',
      message: `🎥 Webinar scheduled: "${webinar.Topic}" on ${webinar.Date} at ${webinar.Start_Time}.`, meta: { taskTitle: webinar.Topic } });
    saveDb(db);
    return json(201, { webinar });
  }
  const webinarMatch = path.match(/^\/api\/webinars\/([^/]+)$/);
  if (method === 'DELETE' && webinarMatch) {
    if (user.Role !== 'Internal') return json(403, { error: 'Only the IC team can remove webinars.' });
    const idx = db.webinars.findIndex(x => x.Webinar_ID === webinarMatch[1]);
    if (idx === -1) return json(404, { error: 'Webinar not found.' });
    const [removed] = db.webinars.splice(idx, 1);
    saveDb(db);
    return json(200, { removed: removed.Webinar_ID });
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
    if (status === 'Rejected' && (!comment || !comment.trim())) {
      return json(400, { error: 'Please tell the vendor what needs to change — a comment is required when asking for changes.' });
    }
    const deliverable = db.deliverables.find(d => d.Deliverable_ID === reviewMatch[1]);
    if (!deliverable) return json(404, { error: 'Deliverable asset record not found.' });
    const task = db.tasks.find(t => t.Task_ID === deliverable.Task_ID);
    if (!task) return json(404, { error: 'Parent task brief not found.' });
    deliverable.Approval_Status = status;
    task.Status = status === 'Approved' ? 'Approved' : 'Needs Revision';
    if (status === 'Approved') {
      task.Approved_At = new Date().toISOString();
      const linkedComm = db.communications.find(c => c.Linked_Task_ID === task.Task_ID && c.Status === 'In Design');
      if (linkedComm) {
        linkedComm.Status = 'Ready';
        if (!linkedComm.Creative_Link) linkedComm.Creative_Link = deliverable.File_URL;
      }
    }
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
