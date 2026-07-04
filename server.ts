import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { ASSET_TEMPLATES, DatabaseState, Task, Deliverable, User, Vendor, NotificationLog, TaskStatus, AssetType } from './src/types';
import { DEFAULT_DB } from './src/seed';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = path.join(process.cwd(), 'data.json');
const MAX_LOGS = 500;
const MAX_LIVE_EVENTS = 200;

app.use(express.json({ limit: '256kb' }));

// -------------------------------------------------------------
// MULTI-PROVIDER AI ENGINE
// Supports NVIDIA Build, OpenRouter, and Gemini — all optional. Providers are
// tried in order (AI_PROVIDER_ORDER env, default nvidia,openrouter,gemini)
// with a per-request timeout; if one fails or is rate-limited the next takes
// over, so a flaky provider never breaks the critique feature.
// -------------------------------------------------------------

const AI_REQUEST_TIMEOUT_MS = 45_000;

// Initialize Gemini SDK lazily to prevent crash on startup if key is missing
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set.');
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// NVIDIA Build and OpenRouter both speak the OpenAI chat-completions dialect
async function openAiCompatibleChat(
  url: string,
  apiKey: string,
  model: string,
  prompt: string,
  extraHeaders: Record<string, string> = {}
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1000
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      throw new Error(`HTTP ${res.status} from ${model}: ${body}`);
    }
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content;
    if (!text || !text.trim()) {
      throw new Error(`Empty completion from ${model}`);
    }
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

interface AIProvider {
  name: string;
  label: string;
  isConfigured: () => boolean;
  generate: (prompt: string) => Promise<string>;
}

const AI_PROVIDERS: Record<string, AIProvider> = {
  nvidia: {
    name: 'nvidia',
    label: 'NVIDIA Build',
    isConfigured: () => !!process.env.NVIDIA_API_KEY,
    generate: (prompt) => openAiCompatibleChat(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      process.env.NVIDIA_API_KEY!,
      process.env.NVIDIA_MODEL || 'meta/llama-3.3-70b-instruct',
      prompt
    )
  },
  openrouter: {
    name: 'openrouter',
    label: 'OpenRouter',
    isConfigured: () => !!process.env.OPENROUTER_API_KEY,
    generate: (prompt) => openAiCompatibleChat(
      'https://openrouter.ai/api/v1/chat/completions',
      process.env.OPENROUTER_API_KEY!,
      process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
      prompt,
      { 'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000', 'X-Title': 'CreativeFlow Hub' }
    )
  },
  gemini: {
    name: 'gemini',
    label: 'Gemini',
    isConfigured: () => !!process.env.GEMINI_API_KEY,
    generate: async (prompt) => {
      const response = await getGeminiClient().models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        contents: prompt,
        config: { temperature: 0.7, maxOutputTokens: 1000 }
      });
      const text = response.text;
      if (!text || !text.trim()) throw new Error('Empty completion from Gemini');
      return text.trim();
    }
  }
};

function configuredProviders(): AIProvider[] {
  const order = (process.env.AI_PROVIDER_ORDER || 'nvidia,openrouter,gemini')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(name => AI_PROVIDERS[name]);
  return order.map(name => AI_PROVIDERS[name]).filter(p => p.isConfigured());
}

// Try each configured provider in order until one succeeds
async function generateWithFallback(prompt: string): Promise<{ text: string; provider: AIProvider }> {
  const providers = configuredProviders();
  if (providers.length === 0) {
    throw new Error('No AI provider configured. Set NVIDIA_API_KEY, OPENROUTER_API_KEY, or GEMINI_API_KEY in .env.local.');
  }
  let lastError: unknown;
  for (const provider of providers) {
    try {
      const text = await provider.generate(prompt);
      return { text, provider };
    } catch (err) {
      lastError = err;
      console.warn(`AI provider '${provider.name}' failed, trying next:`, err instanceof Error ? err.message : err);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}


// -------------------------------------------------------------
// PERSISTENCE LAYER
// The database lives in memory as a single authoritative instance and is
// persisted asynchronously with atomic tmp-file + rename writes. This avoids
// re-reading/parsing the JSON file on every request and eliminates the
// last-write-wins race between concurrent requests.
// -------------------------------------------------------------

function loadDbFromDisk(): DatabaseState {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as DatabaseState;
      // Guard against partially-shaped files from older versions
      return {
        vendors: parsed.vendors ?? [],
        users: parsed.users ?? [],
        tasks: parsed.tasks ?? [],
        deliverables: parsed.deliverables ?? [],
        logs: parsed.logs ?? []
      };
    }
  } catch (err) {
    console.error('Error reading db file, using default state:', err);
  }
  return structuredClone(DEFAULT_DB);
}

// Migrate records created before task-level conversations / in-house work
function migrateDb(state: DatabaseState): DatabaseState {
  state.tasks.forEach(t => { t.Comments ??= []; });
  if (!state.vendors.some(v => v.Vendor_ID === 'v-inhouse')) {
    state.vendors.unshift({
      Vendor_ID: 'v-inhouse',
      Company_Name: 'In-house Team',
      Specialty: 'Deployed internally via Snapcoms (wallpapers, tickers, popups)',
      Logo: ''
    });
  }
  return state;
}

const db: DatabaseState = migrateDb(loadDbFromDisk());

let persistTimer: NodeJS.Timeout | null = null;
let writeChain: Promise<void> = Promise.resolve();

function writeDbAtomic(json: string): Promise<void> {
  const tmpFile = DB_FILE + '.tmp';
  return fs.promises
    .writeFile(tmpFile, json, 'utf-8')
    .then(() => fs.promises.rename(tmpFile, DB_FILE))
    .catch(err => {
      console.error('Error writing to db file:', err);
    });
}

// Debounced, serialized persistence: coalesces bursts of mutations into a
// single write and never lets two writes overlap.
function persist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const snapshot = JSON.stringify(db, null, 2);
    writeChain = writeChain.then(() => writeDbAtomic(snapshot));
  }, 100);
}

function flushSync() {
  try {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    const tmpFile = DB_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error('Error flushing db on shutdown:', err);
  }
}

process.on('SIGINT', () => { flushSync(); process.exit(0); });
process.on('SIGTERM', () => { flushSync(); process.exit(0); });

// Collision-safe ID generator (Date.now() alone collides within the same ms)
function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function pushLog(log: NotificationLog) {
  db.logs.unshift(log);
  if (db.logs.length > MAX_LOGS) db.logs.length = MAX_LOGS;
}

// -------------------------------------------------------------
// LIVE EVENTS (simulated WebSocket via cursor-based polling)
// Events carry a monotonic sequence number and a vendorId scope. Clients poll
// with their own cursor, so multiple clients each receive every event (the old
// implementation cleared the queue on read, so only the first poller ever saw
// an event) and vendors only receive events scoped to their own agency.
// -------------------------------------------------------------

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
  if (liveEvents.length > MAX_LIVE_EVENTS) {
    liveEvents.splice(0, liveEvents.length - MAX_LIVE_EVENTS);
  }
}

// -------------------------------------------------------------
// SECURITY CONTEXT
// -------------------------------------------------------------

interface AuthedRequest extends Request {
  user: User;
}

// API Middleware: resolve the simulated user and attach it to the request.
function getSecurityContext(req: Request, res: Response, next: NextFunction) {
  const userId = req.headers['x-simulated-user-id'] as string;
  const user = db.users.find(u => u.User_ID === userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized. Simulated User Header is missing or invalid.' });
    return;
  }
  (req as AuthedRequest).user = user;
  next();
}

function vendorName(vendorId: string): string {
  return db.vendors.find(v => v.Vendor_ID === vendorId)?.Company_Name || 'External Agency';
}

// A log entry is visible to a vendor only if it is scoped to their agency.
function logVisibleToVendor(log: NotificationLog, vendorId: string): boolean {
  if (log.meta.vendorId) return log.meta.vendorId === vendorId;
  if (log.meta.taskId) {
    const task = db.tasks.find(t => t.Task_ID === log.meta.taskId);
    return !!task && task.Assigned_Vendor_ID === vendorId;
  }
  return false;
}

// -------------------------------------------------------------
// SECURE API ROUTES (ROW-LEVEL SECURITY ENFORCED)
// -------------------------------------------------------------

// Retrieve relational state based on user isolation credentials
app.get('/api/db', getSecurityContext, (req, res) => {
  const user = (req as AuthedRequest).user;

  // Security Layer (RLS Engine Logging)
  const rlsLogs: string[] = [];

  let allowedTasks = db.tasks;
  let allowedDeliverables = db.deliverables;
  let allowedVendors = db.vendors;
  let allowedLogs = db.logs;
  let visibleUsers = db.users;

  rlsLogs.push(`User Authenticated: ${user.Name} (${user.Role})`);

  if (user.Role === 'Vendor') {
    // THE RLS RULE: Vendors can ONLY access and view rows where their User.Vendor_ID matches the Assigned_Vendor_ID
    rlsLogs.push(`RLS Query Constraint Triggered: Role == Vendor (Vendor_ID: ${user.Vendor_ID})`);
    rlsLogs.push(`Enforcing rule: Assigned_Vendor_ID == '${user.Vendor_ID}'`);

    const ownTaskIds = new Set(
      db.tasks.filter(t => t.Assigned_Vendor_ID === user.Vendor_ID).map(t => t.Task_ID)
    );
    allowedTasks = db.tasks.filter(t => ownTaskIds.has(t.Task_ID));
    allowedDeliverables = db.deliverables.filter(d => ownTaskIds.has(d.Task_ID));

    // Only show their own vendor registry profile
    allowedVendors = db.vendors.filter(v => v.Vendor_ID === user.Vendor_ID);

    // Only show activity logs scoped to their own agency
    allowedLogs = db.logs.filter(l => logVisibleToVendor(l, user.Vendor_ID!));

    // Never leak other users' email addresses to external agencies
    visibleUsers = db.users.map(u =>
      u.User_ID === user.User_ID ? u : { ...u, Email: '' }
    );

    rlsLogs.push(`RLS Result: Filtered database down to ${allowedTasks.length} Tasks, ${allowedDeliverables.length} Deliverables, ${allowedLogs.length} Logs.`);
  } else {
    rlsLogs.push(`RLS Bypass: Internal PFL Team Member. Full administrative read query granted.`);
  }

  res.json({
    user,
    users: visibleUsers,
    vendors: allowedVendors,
    tasks: allowedTasks,
    deliverables: allowedDeliverables,
    logs: allowedLogs,
    aiProviders: configuredProviders().map(p => p.label),
    rlsSimulation: {
      applied: user.Role === 'Vendor',
      targetRule: user.Role === 'Vendor'
        ? `Task.Assigned_Vendor_ID == '${user.Vendor_ID}' && Deliverable.Task.Assigned_Vendor_ID == '${user.Vendor_ID}'`
        : 'GRANT ALL (Role == Internal)',
      logs: rlsLogs,
      status: 'SECURE'
    }
  });
});

// Create Task (Auto-populates standard dimensional briefs based on Asset_Type)
app.post('/api/tasks', getSecurityContext, (req, res) => {
  const user = (req as AuthedRequest).user;

  if (user.Role !== 'Internal') {
    return res.status(403).json({ error: 'RLS Reject: Only internal PFL staff members are authorized to create or configure creative task briefs.' });
  }

  const { Title, Asset_Type, Assigned_Vendor_ID, Due_Date, Custom_Dimensions, Custom_Guidelines, Custom_Requirements } = req.body ?? {};

  if (typeof Title !== 'string' || !Title.trim() || !Asset_Type || !Assigned_Vendor_ID || !Due_Date) {
    return res.status(400).json({ error: 'Validation Error: Title, Asset_Type, Assigned_Vendor_ID, and Due_Date are required fields.' });
  }

  if (!(Asset_Type in ASSET_TEMPLATES)) {
    return res.status(400).json({ error: `Validation Error: Unknown Asset_Type '${Asset_Type}'.` });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(Due_Date) || isNaN(new Date(Due_Date).getTime())) {
    return res.status(400).json({ error: 'Validation Error: Due_Date must be a valid YYYY-MM-DD date.' });
  }

  // A brief that is already overdue at creation time is a data-entry mistake
  if (new Date(Due_Date + 'T23:59:59.000Z').getTime() < Date.now()) {
    return res.status(400).json({ error: 'Validation Error: Due_Date is in the past. Please pick a future milestone date.' });
  }

  // Look up vendor to confirm they exist
  const vendor = db.vendors.find(v => v.Vendor_ID === Assigned_Vendor_ID);
  if (!vendor) {
    return res.status(400).json({ error: 'Validation Error: Specified vendor does not exist in registry.' });
  }

  // Automation Rule 3: Automatically pre-populate default layout templates and branding specs
  const standardTemplate = ASSET_TEMPLATES[Asset_Type as AssetType];
  const finalDimensions = Custom_Dimensions || standardTemplate.dimensions;
  const finalGuidelines = Custom_Guidelines || standardTemplate.brandGuidelines;
  const finalRequirements = Custom_Requirements || standardTemplate.requirements;

  const newTask: Task = {
    Task_ID: newId('t'),
    Title: Title.trim(),
    Asset_Type: Asset_Type as AssetType,
    Assigned_Vendor_ID,
    Due_Date,
    Status: 'Assigned',
    Dimensions: finalDimensions,
    BrandGuidelines: finalGuidelines,
    Requirements: finalRequirements,
    Created_At: new Date().toISOString()
  };

  db.tasks.push(newTask);

  // Log automation event
  const newLog: NotificationLog = {
    id: newId('l'),
    timestamp: new Date().toISOString(),
    type: 'system_template',
    message: `New creative request "${newTask.Title}" created. Automatically pre-populated specifications and guidelines for Asset Type: ${Asset_Type}.`,
    meta: {
      taskId: newTask.Task_ID,
      assetType: Asset_Type,
      vendorId: vendor.Vendor_ID,
      vendorName: vendor.Company_Name
    }
  };
  pushLog(newLog);

  // Notify the assigned vendor's portal in real time
  pushLiveEvent({
    title: '📋 New Brief Assigned!',
    message: `A new creative brief "${newTask.Title}" (${Asset_Type}) has been assigned. Due ${Due_Date}.`,
    taskId: newTask.Task_ID,
    vendorId: vendor.Vendor_ID,
    vendorName: vendor.Company_Name
  });

  persist();

  res.status(201).json({ task: newTask, log: newLog });
});

const VALID_STATUSES: TaskStatus[] = ['Assigned', 'In Progress', 'Delivered', 'Approved', 'Needs Revision'];
// Vendors can move their own work forward but never self-approve.
const VENDOR_ALLOWED_STATUSES: TaskStatus[] = ['In Progress', 'Delivered'];

// Update Task Status (For toggling Assigned -> In Progress or approving deliverables)
app.post('/api/tasks/:id/status', getSecurityContext, (req, res) => {
  const user = (req as AuthedRequest).user;
  const taskId = req.params.id;
  const { status } = (req.body ?? {}) as { status: TaskStatus };

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Validation Error: '${status}' is not a valid task status.` });
  }

  const task = db.tasks.find(t => t.Task_ID === taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  // RLS Security enforcement for state updating
  if (user.Role === 'Vendor') {
    if (task.Assigned_Vendor_ID !== user.Vendor_ID) {
      return res.status(403).json({ error: 'RLS Blocked: You are not authorized to edit tasks belonging to other external agencies.' });
    }
    if (!VENDOR_ALLOWED_STATUSES.includes(status)) {
      return res.status(403).json({ error: `RLS Blocked: External agencies cannot set task status to '${status}'. Approval decisions are reserved for internal PFL staff.` });
    }
  }

  const oldStatus = task.Status;
  task.Status = status;

  // Track activity
  const newLog: NotificationLog = {
    id: newId('l'),
    timestamp: new Date().toISOString(),
    type: 'system_template',
    message: `Task "${task.Title}" status changed from '${oldStatus}' to '${status}' by ${user.Name}.`,
    meta: {
      taskId: task.Task_ID,
      taskTitle: task.Title,
      vendorId: task.Assigned_Vendor_ID
    }
  };
  pushLog(newLog);

  // Automation Rule 1: WebSocket Simulation Alert for delivered assets
  if (status === 'Delivered') {
    pushLiveEvent({
      title: '📦 Asset Delivered!',
      message: `Vendor ${user.Name} has uploaded a new creative deliverable for "${task.Title}". Ready for review.`,
      taskId: task.Task_ID,
      vendorId: task.Assigned_Vendor_ID,
      vendorName: vendorName(task.Assigned_Vendor_ID)
    });
  }

  persist();
  res.json({ task, log: newLog });
});

// Post a comment on the request itself (so vendors can ask questions before
// any design exists — deliverables have their own per-version threads)
app.post('/api/tasks/:id/comments', getSecurityContext, (req, res) => {
  const user = (req as AuthedRequest).user;
  const { comment } = (req.body ?? {}) as { comment?: string };

  if (typeof comment !== 'string' || !comment.trim()) {
    return res.status(400).json({ error: 'Validation Error: Comment content is required.' });
  }

  const task = db.tasks.find(t => t.Task_ID === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  if (user.Role === 'Vendor' && task.Assigned_Vendor_ID !== user.Vendor_ID) {
    return res.status(403).json({ error: 'RLS Blocked: You can only comment on requests assigned to your agency.' });
  }

  const trimmed = comment.trim();
  (task.Comments ??= []).push({
    id: newId('c'),
    reviewer: user.Name,
    comment: trimmed,
    date: new Date().toISOString(),
    source: 'Human'
  });

  pushLog({
    id: newId('l'),
    timestamp: new Date().toISOString(),
    type: 'system_template',
    message: `💬 Question/note on request "${task.Title}" from ${user.Name}: "${trimmed.length > 80 ? trimmed.slice(0, 80) + '...' : trimmed}"`,
    meta: { taskId: task.Task_ID, taskTitle: task.Title, vendorId: task.Assigned_Vendor_ID }
  });

  pushLiveEvent({
    title: `💬 Note on "${task.Title.length > 30 ? task.Title.slice(0, 30) + '...' : task.Title}"`,
    message: `${user.Name}: "${trimmed.length > 55 ? trimmed.slice(0, 55) + '...' : trimmed}"`,
    taskId: task.Task_ID,
    vendorId: task.Assigned_Vendor_ID,
    vendorName: vendorName(task.Assigned_Vendor_ID)
  });

  persist();
  res.json({ task });
});

// Edit a request (internal only): title, due date, vendor, specs
app.patch('/api/tasks/:id', getSecurityContext, (req, res) => {
  const user = (req as AuthedRequest).user;
  if (user.Role !== 'Internal') {
    return res.status(403).json({ error: 'RLS Reject: Only internal staff can edit requests.' });
  }

  const task = db.tasks.find(t => t.Task_ID === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const { Title, Due_Date, Assigned_Vendor_ID, Dimensions, BrandGuidelines, Requirements } = (req.body ?? {}) as Partial<Task>;
  const changes: string[] = [];

  if (Title !== undefined) {
    if (typeof Title !== 'string' || !Title.trim()) return res.status(400).json({ error: 'Validation Error: Title cannot be empty.' });
    if (Title.trim() !== task.Title) { changes.push(`title → "${Title.trim()}"`); task.Title = Title.trim(); }
  }
  if (Due_Date !== undefined && Due_Date !== task.Due_Date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(Due_Date) || isNaN(new Date(Due_Date).getTime())) {
      return res.status(400).json({ error: 'Validation Error: Due_Date must be a valid YYYY-MM-DD date.' });
    }
    if (new Date(Due_Date + 'T23:59:59.000Z').getTime() < Date.now()) {
      return res.status(400).json({ error: 'Validation Error: Due_Date is in the past. Please pick a future date.' });
    }
    changes.push(`due date → ${Due_Date}`);
    task.Due_Date = Due_Date;
  }
  if (Assigned_Vendor_ID !== undefined && Assigned_Vendor_ID !== task.Assigned_Vendor_ID) {
    const vendor = db.vendors.find(v => v.Vendor_ID === Assigned_Vendor_ID);
    if (!vendor) return res.status(400).json({ error: 'Validation Error: Specified vendor does not exist.' });
    changes.push(`vendor → ${vendor.Company_Name}`);
    task.Assigned_Vendor_ID = Assigned_Vendor_ID;
  }
  if (Dimensions !== undefined && Dimensions !== task.Dimensions) { task.Dimensions = Dimensions; changes.push('size updated'); }
  if (BrandGuidelines !== undefined && BrandGuidelines !== task.BrandGuidelines) { task.BrandGuidelines = BrandGuidelines; changes.push('guidelines updated'); }
  if (Requirements !== undefined && Requirements !== task.Requirements) { task.Requirements = Requirements; changes.push('requirements updated'); }

  if (changes.length > 0) {
    pushLog({
      id: newId('l'),
      timestamp: new Date().toISOString(),
      type: 'system_template',
      message: `✏️ Request "${task.Title}" updated by ${user.Name}: ${changes.join(', ')}.`,
      meta: { taskId: task.Task_ID, taskTitle: task.Title, vendorId: task.Assigned_Vendor_ID }
    });
    pushLiveEvent({
      title: '✏️ Request Updated',
      message: `"${task.Title}": ${changes.join(', ')}.`,
      taskId: task.Task_ID,
      vendorId: task.Assigned_Vendor_ID,
      vendorName: vendorName(task.Assigned_Vendor_ID)
    });
    persist();
  }

  res.json({ task, changed: changes });
});

// Cancel a request (internal only). Soft-cancel: the task and all its history
// stay in the database forever — long-term record keeping is a core goal.
app.delete('/api/tasks/:id', getSecurityContext, (req, res) => {
  const user = (req as AuthedRequest).user;
  if (user.Role !== 'Internal') {
    return res.status(403).json({ error: 'RLS Reject: Only internal staff can cancel requests.' });
  }

  const task = db.tasks.find(t => t.Task_ID === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (task.Status === 'Cancelled') return res.status(400).json({ error: 'This request is already cancelled.' });

  task.Status = 'Cancelled';

  pushLog({
    id: newId('l'),
    timestamp: new Date().toISOString(),
    type: 'system_template',
    message: `🗑️ Request "${task.Title}" was cancelled by ${user.Name}. It stays in History.`,
    meta: { taskId: task.Task_ID, taskTitle: task.Title, vendorId: task.Assigned_Vendor_ID }
  });
  pushLiveEvent({
    title: '🗑️ Request Cancelled',
    message: `"${task.Title}" has been cancelled — no further work needed.`,
    taskId: task.Task_ID,
    vendorId: task.Assigned_Vendor_ID,
    vendorName: vendorName(task.Assigned_Vendor_ID)
  });

  persist();
  res.json({ removed: task.Task_ID, task });
});

// -------------------------------------------------------------
// VENDOR MANAGEMENT (internal only)
// -------------------------------------------------------------

// Add a vendor together with their contact login (the persona switcher and
// future auth both need a User per vendor contact)
app.post('/api/vendors', getSecurityContext, (req, res) => {
  const user = (req as AuthedRequest).user;
  if (user.Role !== 'Internal') {
    return res.status(403).json({ error: 'RLS Reject: Only internal staff can manage vendors.' });
  }

  const { Company_Name, Specialty, Contact_Name, Contact_Email } = (req.body ?? {}) as Record<string, string>;
  if (!Company_Name?.trim() || !Contact_Name?.trim() || !Contact_Email?.trim()) {
    return res.status(400).json({ error: 'Validation Error: Company name, contact name and contact email are required.' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(Contact_Email.trim())) {
    return res.status(400).json({ error: 'Validation Error: Contact email does not look valid.' });
  }
  if (db.vendors.some(v => v.Company_Name.toLowerCase() === Company_Name.trim().toLowerCase())) {
    return res.status(400).json({ error: 'Validation Error: A vendor with this company name already exists.' });
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

  pushLog({
    id: newId('l'),
    timestamp: new Date().toISOString(),
    type: 'system_template',
    message: `🤝 New vendor added: ${vendor.Company_Name} (contact: ${contact.Name}, ${contact.Email}).`,
    meta: { vendorId: vendor.Vendor_ID, vendorName: vendor.Company_Name }
  });

  persist();
  res.status(201).json({ vendor, contact });
});

// Edit a vendor and optionally its contact person
app.patch('/api/vendors/:id', getSecurityContext, (req, res) => {
  const user = (req as AuthedRequest).user;
  if (user.Role !== 'Internal') {
    return res.status(403).json({ error: 'RLS Reject: Only internal staff can manage vendors.' });
  }

  const vendor = db.vendors.find(v => v.Vendor_ID === req.params.id);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found.' });

  const { Company_Name, Specialty, Contact_Name, Contact_Email } = (req.body ?? {}) as Record<string, string>;

  if (Company_Name !== undefined) {
    if (!Company_Name.trim()) return res.status(400).json({ error: 'Validation Error: Company name cannot be empty.' });
    vendor.Company_Name = Company_Name.trim();
  }
  if (Specialty !== undefined) vendor.Specialty = Specialty.trim();

  const contact = db.users.find(u => u.Role === 'Vendor' && u.Vendor_ID === vendor.Vendor_ID);
  if (contact) {
    if (Contact_Name !== undefined && Contact_Name.trim()) contact.Name = Contact_Name.trim();
    if (Contact_Email !== undefined && Contact_Email.trim()) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(Contact_Email.trim())) {
        return res.status(400).json({ error: 'Validation Error: Contact email does not look valid.' });
      }
      contact.Email = Contact_Email.trim();
    }
  }

  pushLog({
    id: newId('l'),
    timestamp: new Date().toISOString(),
    type: 'system_template',
    message: `✏️ Vendor "${vendor.Company_Name}" details updated by ${user.Name}.`,
    meta: { vendorId: vendor.Vendor_ID, vendorName: vendor.Company_Name }
  });

  persist();
  res.json({ vendor, contact: contact ?? null });
});

// Submit Deliverable (Upload simulating version control)
app.post('/api/deliverables', getSecurityContext, (req, res) => {
  const user = (req as AuthedRequest).user;
  const { Task_ID, File_URL, File_Name } = req.body ?? {};

  if (!Task_ID || typeof File_URL !== 'string' || !File_URL.trim() || typeof File_Name !== 'string' || !File_Name.trim()) {
    return res.status(400).json({ error: 'Validation Error: Task_ID, File_URL, and File_Name are required.' });
  }

  const task = db.tasks.find(t => t.Task_ID === Task_ID);
  if (!task) {
    return res.status(404).json({ error: 'Parent task brief not found.' });
  }

  // RLS Security Check
  if (user.Role === 'Vendor' && task.Assigned_Vendor_ID !== user.Vendor_ID) {
    return res.status(403).json({ error: 'RLS Blocked: You can only submit deliverables for briefs explicitly assigned to your agency.' });
  }

  // Increment version relative to the highest existing version (not array
  // length, which drifts if records are ever removed)
  const nextVersion = db.deliverables
    .filter(d => d.Task_ID === Task_ID)
    .reduce((max, d) => Math.max(max, d.Version), 0) + 1;

  // Create new deliverable record
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

  // Update original task state to 'Delivered'
  task.Status = 'Delivered';

  // Log automation activity
  const newLog: NotificationLog = {
    id: newId('l'),
    timestamp: new Date().toISOString(),
    type: 'delivered',
    message: `New creative file "${newDeliverable.File_Name}" (v${nextVersion}) uploaded by agency. Project state auto-advanced to 'Delivered'.`,
    meta: {
      taskId: task.Task_ID,
      taskTitle: task.Title,
      vendorId: task.Assigned_Vendor_ID,
      vendorName: vendorName(task.Assigned_Vendor_ID)
    }
  };
  pushLog(newLog);

  // Trigger Live Event Popup simulation
  pushLiveEvent({
    title: '📦 Asset Delivered!',
    message: `New deliverable uploaded: "${newDeliverable.File_Name}" (Version ${nextVersion}) for "${task.Title}".`,
    taskId: task.Task_ID,
    vendorId: task.Assigned_Vendor_ID,
    vendorName: vendorName(task.Assigned_Vendor_ID)
  });

  persist();
  res.status(201).json({ deliverable: newDeliverable, task, log: newLog });
});

// Submit Deliverable Review (Approve or Needs Revision with feedback)
app.post('/api/deliverables/:id/review', getSecurityContext, (req, res) => {
  const user = (req as AuthedRequest).user;
  const deliverableId = req.params.id;
  const { status, comment } = (req.body ?? {}) as { status: 'Approved' | 'Rejected'; comment?: string };

  if (user.Role !== 'Internal') {
    return res.status(403).json({ error: 'RLS Reject: Only PFL internal brand managers can review and approve agency deliverables.' });
  }

  if (status !== 'Approved' && status !== 'Rejected') {
    return res.status(400).json({ error: "Validation Error: status must be 'Approved' or 'Rejected'." });
  }

  // Rejections without an explanation leave the vendor guessing
  if (status === 'Rejected' && (!comment || !comment.trim())) {
    return res.status(400).json({ error: 'Please tell the vendor what needs to change — a comment is required when asking for changes.' });
  }

  const deliverable = db.deliverables.find(d => d.Deliverable_ID === deliverableId);
  if (!deliverable) {
    return res.status(404).json({ error: 'Deliverable asset record not found.' });
  }

  const task = db.tasks.find(t => t.Task_ID === deliverable.Task_ID);
  if (!task) {
    return res.status(404).json({ error: 'Parent task brief not found.' });
  }

  deliverable.Approval_Status = status;
  task.Status = status === 'Approved' ? 'Approved' : 'Needs Revision';
  if (status === 'Approved') {
    task.Approved_At = new Date().toISOString();
  }

  if (comment && comment.trim()) {
    deliverable.Feedback_History.push({
      id: newId('f'),
      reviewer: user.Name,
      comment: comment.trim(),
      date: new Date().toISOString(),
      source: 'Human'
    });
  }

  // Create log entry
  const newLog: NotificationLog = {
    id: newId('l'),
    timestamp: new Date().toISOString(),
    type: 'system_template',
    message: `Deliverable review completed for "${deliverable.File_Name}": Set to '${status}'. Task updated to '${task.Status}'.`,
    meta: {
      taskId: task.Task_ID,
      taskTitle: task.Title,
      vendorId: task.Assigned_Vendor_ID
    }
  };
  pushLog(newLog);

  // Notify the vendor portal about the review decision in real time
  pushLiveEvent({
    title: status === 'Approved' ? '✅ Deliverable Approved!' : '🎨 Revision Requested',
    message: `"${deliverable.File_Name}" (v${deliverable.Version}) was ${status === 'Approved' ? 'approved' : 'sent back for revisions'} by ${user.Name}.`,
    taskId: task.Task_ID,
    vendorId: task.Assigned_Vendor_ID,
    vendorName: vendorName(task.Assigned_Vendor_ID)
  });

  persist();
  res.json({ deliverable, task, log: newLog });
});

// Submit Deliverable Back-and-Forth Feedback Comment (For both Internal Brand Managers and Vendors)
app.post('/api/deliverables/:id/feedback', getSecurityContext, (req, res) => {
  const user = (req as AuthedRequest).user;
  const deliverableId = req.params.id;
  const { comment } = (req.body ?? {}) as { comment?: string };

  if (typeof comment !== 'string' || !comment.trim()) {
    return res.status(400).json({ error: 'Validation Error: Comment content is required.' });
  }

  const deliverable = db.deliverables.find(d => d.Deliverable_ID === deliverableId);
  if (!deliverable) {
    return res.status(404).json({ error: 'Deliverable asset record not found.' });
  }

  const task = db.tasks.find(t => t.Task_ID === deliverable.Task_ID);
  if (!task) {
    return res.status(404).json({ error: 'Parent task brief not found.' });
  }

  // RLS Security Check: Vendors can only reply to comments on deliverables assigned to them
  if (user.Role === 'Vendor' && task.Assigned_Vendor_ID !== user.Vendor_ID) {
    return res.status(403).json({ error: 'RLS Reject: You are not authorized to post feedback comments on this agency deliverable.' });
  }

  // Append comment
  deliverable.Feedback_History.push({
    id: newId('f'),
    reviewer: user.Name,
    comment: comment.trim(),
    date: new Date().toISOString(),
    source: 'Human'
  });

  // Create log entry
  const newLog: NotificationLog = {
    id: newId('l'),
    timestamp: new Date().toISOString(),
    type: 'system_template',
    message: `💬 Back-and-forth feedback comment posted on "${deliverable.File_Name}" (v${deliverable.Version}) by ${user.Name} (${user.Role}).`,
    meta: {
      taskId: task.Task_ID,
      taskTitle: task.Title,
      vendorId: task.Assigned_Vendor_ID,
      vendorName: vendorName(task.Assigned_Vendor_ID)
    }
  };
  pushLog(newLog);

  // Trigger Live Event Popup simulation
  const trimmed = comment.trim();
  pushLiveEvent({
    title: `💬 Feedback Comment from ${user.Role === 'Internal' ? 'PFL' : 'Agency'}`,
    message: `"${trimmed.length > 55 ? trimmed.substring(0, 55) + '...' : trimmed}"`,
    taskId: task.Task_ID,
    vendorId: task.Assigned_Vendor_ID,
    vendorName: vendorName(task.Assigned_Vendor_ID)
  });

  persist();
  res.json({ deliverable, task, log: newLog });
});

// -------------------------------------------------------------
// AUTOMATION CRON WORKER & ALERTS SIMULATOR
// -------------------------------------------------------------

// Polling route for receiving simulated real-time WebSocket events.
// Cursor-based: pass ?since=<seq> to receive only newer events. RLS-scoped:
// vendors only see events for their own agency.
app.get('/api/live-events', getSecurityContext, (req, res) => {
  const user = (req as AuthedRequest).user;
  const sinceParam = req.query.since;

  // Bootstrap call: hand the client the current cursor without replaying history
  if (sinceParam === undefined) {
    return res.json({ cursor: eventSeq, events: [] });
  }

  const since = Number(sinceParam);
  if (!Number.isFinite(since)) {
    return res.status(400).json({ error: "Validation Error: 'since' must be a number." });
  }

  const visible = liveEvents.filter(e =>
    e.seq > since && (user.Role === 'Internal' || e.vendorId === user.Vendor_ID)
  );

  res.json({ cursor: eventSeq, events: visible });
});

// Scans all active tasks and dispatches two kinds of alerts:
//  - cron_reminder: task due within 48 hours (once per task)
//  - cron_overdue:  task past its due date (escalated at most once per 24h)
// Runs automatically every hour (see bootstrap) and on demand via the API.
const OVERDUE_REESCALATE_MS = 24 * 60 * 60 * 1000;

function runReminderScan(now: Date): NotificationLog[] {
  const triggeredAlerts: NotificationLog[] = [];

  db.tasks.forEach(task => {
    // Only tasks still awaiting vendor work are actionable
    if (task.Status !== 'Assigned' && task.Status !== 'In Progress') return;

    const dueDate = new Date(task.Due_Date + 'T23:59:59.000Z');
    const hoursRemaining = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    const vendor = db.vendors.find(v => v.Vendor_ID === task.Assigned_Vendor_ID);

    if (hoursRemaining < 0) {
      // OVERDUE: escalate, but at most once per 24 hours per task
      const lastEscalation = db.logs.find(l => l.type === 'cron_overdue' && l.meta.taskId === task.Task_ID);
      if (lastEscalation && now.getTime() - new Date(lastEscalation.timestamp).getTime() < OVERDUE_REESCALATE_MS) {
        return;
      }
      const hoursOverdue = Math.round(-hoursRemaining);
      // Stamp with scan time so the 24h dedup stays consistent when the scan
      // runs with a simulatedNow override
      const overdueLog: NotificationLog = {
        id: newId('l-cron'),
        timestamp: now.toISOString(),
        type: 'cron_overdue',
        message: `🚨 OVERDUE Escalation: Creative asset "${task.Title}" is ${hoursOverdue}h past its due date (${task.Due_Date}) and still '${task.Status}'. Escalation email dispatched to ${vendor?.Company_Name || 'assigned agency'} and internal coordinators.`,
        meta: {
          taskId: task.Task_ID,
          taskTitle: task.Title,
          vendorId: task.Assigned_Vendor_ID,
          vendorName: vendor?.Company_Name,
          dueDate: task.Due_Date,
          hoursLeft: -hoursOverdue
        }
      };
      triggeredAlerts.push(overdueLog);
      pushLog(overdueLog);
      pushLiveEvent({
        title: '🚨 Task Overdue!',
        message: `"${task.Title}" is ${hoursOverdue}h past due and still '${task.Status}'.`,
        taskId: task.Task_ID,
        vendorId: task.Assigned_Vendor_ID,
        vendorName: vendor?.Company_Name || 'External Agency'
      });
    } else if (hoursRemaining <= 48) {
      // DUE SOON: remind once per task
      const alreadyNotified = db.logs.some(l => l.type === 'cron_reminder' && l.meta.taskId === task.Task_ID);
      if (alreadyNotified) return;

      const reminderLog: NotificationLog = {
        id: newId('l-cron'),
        timestamp: now.toISOString(),
        type: 'cron_reminder',
        message: `⏰ Automated 48h Escalation Reminder: Creative asset "${task.Title}" is due in ${Math.round(hoursRemaining)} hours! Automatic email dispatched to ${vendor?.Company_Name || 'assigned agency'}.`,
        meta: {
          taskId: task.Task_ID,
          taskTitle: task.Title,
          vendorId: task.Assigned_Vendor_ID,
          vendorName: vendor?.Company_Name,
          dueDate: task.Due_Date,
          hoursLeft: Math.round(hoursRemaining)
        }
      };
      triggeredAlerts.push(reminderLog);
      pushLog(reminderLog);
      pushLiveEvent({
        title: '⏰ Due-Date Reminder',
        message: `"${task.Title}" is due in ${Math.round(hoursRemaining)} hours.`,
        taskId: task.Task_ID,
        vendorId: task.Assigned_Vendor_ID,
        vendorName: vendor?.Company_Name || 'External Agency'
      });
    }
  });

  if (triggeredAlerts.length > 0) {
    persist();
  }
  return triggeredAlerts;
}

// Manual trigger for the reminder scan. Uses the real clock by default;
// accepts an optional simulatedNow override for demos/testing.
app.post('/api/simulate-cron', getSecurityContext, (req, res) => {
  const user = (req as AuthedRequest).user;

  if (user.Role !== 'Internal') {
    return res.status(403).json({ error: 'Forbidden. Simulated Cron triggers are restricted to internal coordinators.' });
  }

  const { simulatedNow } = (req.body ?? {}) as { simulatedNow?: string };
  const now = simulatedNow ? new Date(simulatedNow) : new Date();
  if (isNaN(now.getTime())) {
    return res.status(400).json({ error: 'Validation Error: simulatedNow must be a valid ISO date string.' });
  }

  const triggeredAlerts = runReminderScan(now);

  res.json({
    triggered: triggeredAlerts.length,
    reminders: triggeredAlerts,
    logs: db.logs
  });
});

// -------------------------------------------------------------
// AI BRIEF ORGANIZER
// Teams send raw requirement text (emails, Teams messages). The AI organizes
// it into a structured brief WITHOUT changing or inventing content — the
// internal team reviews the draft before creating the request.
// -------------------------------------------------------------

app.post('/api/ai/organize-brief', getSecurityContext, async (req, res) => {
  const user = (req as AuthedRequest).user;
  if (user.Role !== 'Internal') {
    return res.status(403).json({ error: 'RLS Reject: Only internal staff can use the brief organizer.' });
  }

  const { rawText } = (req.body ?? {}) as { rawText?: string };
  if (typeof rawText !== 'string' || rawText.trim().length < 10) {
    return res.status(400).json({ error: 'Please paste the raw requirement text first (at least a sentence).' });
  }

  const assetTypeList = Object.keys(ASSET_TEMPLATES).join(', ');
  const prompt = `You organize raw communication requirements into structured briefs for an internal communications team.

STRICT RULES:
- Do NOT invent, add, or change any facts, dates, names, numbers or requirements. Only reorganize and lightly polish the wording that is already there.
- If a field is not mentioned in the raw text, leave it as an empty string — never guess.
- Keep the original language of specific instructions intact wherever possible.

RAW REQUIREMENT (verbatim, from the requesting team):
"""
${rawText.trim().slice(0, 4000)}
"""

Return ONLY a JSON object (no markdown fences, no commentary) with exactly these keys:
{
  "title": "short clear request title drawn from the raw text",
  "asset_type": "the best match from this exact list, or empty string if unclear: ${assetTypeList}",
  "dimensions": "any size/format info found in the text, else empty string",
  "guidelines": "any brand/style/tone instructions found in the text, else empty string",
  "requirements": "the concrete must-haves found in the text (deadlines mentioned inside the content, mandatory elements, approvals), else empty string",
  "due_date": "YYYY-MM-DD if a deadline date is stated in the text, else empty string"
}`;

  try {
    const { text, provider } = await generateWithFallback(prompt);
    // Tolerate models that wrap JSON in code fences despite instructions
    const jsonText = text.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim();
    const start = jsonText.indexOf('{');
    const end = jsonText.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('AI did not return structured data.');
    const parsed = JSON.parse(jsonText.slice(start, end + 1)) as Record<string, unknown>;

    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const assetType = str(parsed.asset_type);
    const draft = {
      title: str(parsed.title),
      asset_type: (assetType in ASSET_TEMPLATES) ? assetType : '',
      dimensions: str(parsed.dimensions),
      guidelines: str(parsed.guidelines),
      requirements: str(parsed.requirements),
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(str(parsed.due_date)) ? str(parsed.due_date) : ''
    };

    res.json({ draft, provider: provider.label });
  } catch (error) {
    console.error('Brief organizer failed:', error);
    res.status(502).json({ error: 'AI could not organize this text right now — please fill the form manually or try again.' });
  }
});

// -------------------------------------------------------------
// GEMINI INTELLIGENT AI ART DIRECTOR REVIEW AGENT
// -------------------------------------------------------------

app.post('/api/gemini/critique', getSecurityContext, async (req, res) => {
  const user = (req as AuthedRequest).user;
  const { deliverableId, fileSummaryText } = req.body ?? {};

  if (!deliverableId) {
    return res.status(400).json({ error: 'Validation Error: deliverableId is required.' });
  }

  const deliverable = db.deliverables.find(d => d.Deliverable_ID === deliverableId);
  if (!deliverable) {
    return res.status(404).json({ error: 'Deliverable record not found.' });
  }

  const task = db.tasks.find(t => t.Task_ID === deliverable.Task_ID);
  if (!task) {
    return res.status(404).json({ error: 'Parent task brief not found.' });
  }

  // RLS Security Check: Vendors can only request critiques on their own deliverables
  if (user.Role === 'Vendor' && task.Assigned_Vendor_ID !== user.Vendor_ID) {
    return res.status(403).json({ error: 'RLS Blocked: You can only request AI critiques for deliverables assigned to your agency.' });
  }

  const vendor = db.vendors.find(v => v.Vendor_ID === task.Assigned_Vendor_ID);

  try {
    // Construct prompt containing task specifications, brand requirements, and submitter description
    const prompt = `You are the ultimate AI Creative Art Director overseeing vendor deliveries.
Analyze the following creative asset delivery and provide immediate, highly professional, constructives, and strict feedback.

CRITICAL TASK SPECIFICATIONS:
- Brief Title: "${task.Title}"
- Asset Type: "${task.Asset_Type}"
- Assigned Agency: "${vendor?.Company_Name}"
- Target Dimensions: "${task.Dimensions}"
- Brand Guidelines & Palette: "${task.BrandGuidelines}"
- Explicit Requirements: "${task.Requirements}"

DELIVERED ASSET SUMMARY:
- File Name: "${deliverable.File_Name}"
- File Version: v${deliverable.Version}
- Submitter Description of Creative Submission: "${fileSummaryText || 'Standard mockup draft file.'}"

YOUR MISSION:
Write a review from the PFL Internal Art Direction team. Be encouraging but exceptionally detail-oriented.
Evaluate:
1. Adherence to Dimensions and Ratios.
2. Alignment with Brand Guidelines / palettes / font style.
3. Satisfaction of Core Functional Requirements.
4. Professional improvements regarding composition, visual balance, contrast, typography spacing, and call-to-action impact.

FORMATTING INSTRUCTIONS:
- Return a structured text review. Keep it punchy (approx 150-220 words).
- Use bullet points for specific visual adjustments.
- Do NOT output any system text or JSON wrapper. Just print the direct, beautifully formatted message.`;

    const { text: critiqueText, provider } = await generateWithFallback(prompt);

    // Append critique to Deliverable's Feedback_History
    deliverable.Feedback_History.push({
      id: newId('f-ai'),
      reviewer: `AI Art Director (${provider.label})`,
      comment: critiqueText,
      date: new Date().toISOString(),
      source: 'AI'
    });

    // Note: the AI critique is advisory only — it must never change the task
    // status. A vendor pre-checking their own draft shouldn't derail the
    // client's pending review.

    // Log the AI critique event
    const newLog: NotificationLog = {
      id: newId('l'),
      timestamp: new Date().toISOString(),
      type: 'system_template',
      message: `🤖 Advisory AI Creative Review added to "${deliverable.File_Name}" (v${deliverable.Version}). Task status unchanged — awaiting human review decision.`,
      meta: {
        taskId: task.Task_ID,
        taskTitle: task.Title,
        vendorId: task.Assigned_Vendor_ID
      }
    };
    pushLog(newLog);

    persist();

    res.json({
      critique: critiqueText,
      deliverable,
      task,
      log: newLog
    });

  } catch (error) {
    console.error('Error in Gemini creative feedback critique endpoint:', error);

    // Provide an elegant fallback critique in case of quota or api configuration issues
    const fallbackCritique = `🤖 AI Creative Director critique is temporarily offline (configure NVIDIA_API_KEY, OPENROUTER_API_KEY, or GEMINI_API_KEY in .env.local — any one of them works).

    **Review Panel Checklist (Manual Review Needed):**
    - **Dimensions**: Verify asset conforms strictly to specified format: "${task.Dimensions}".
    - **Palette**: Ensure colors align with guidelines: "${task.BrandGuidelines}".
    - **Visual Elements**: Confirm central imagery contains high-impact compositions.
    - **CTA Check**: Double check buttons are clearly visible with readable, actionable text.`;

    deliverable.Feedback_History.push({
      id: newId('f-ai-fallback'),
      reviewer: 'AI Director (Offline)',
      comment: fallbackCritique,
      date: new Date().toISOString(),
      source: 'AI'
    });

    persist();

    res.json({
      critique: fallbackCritique,
      deliverable,
      task,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Unknown API routes should return JSON, not the SPA HTML shell
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Not Found: ${req.method} ${req.originalUrl}` });
});

// Centralized error handler so malformed JSON bodies and unexpected throws
// return structured JSON instead of an HTML stack trace
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Validation Error: Request body is not valid JSON.' });
  }
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal Server Error.' });
});

// -------------------------------------------------------------
// VITE MIDDLEWARE & STATIC ASSET PIPELINE
// -------------------------------------------------------------

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    // Import vite dynamically so the production bundle never requires it —
    // a static import would make `npm start` crash without devDependencies.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production mode
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server successfully started on http://0.0.0.0:${PORT}`);
  });

  // Real automation: run the reminder/overdue scan shortly after startup and
  // then every hour — no manual button press required. Tests set
  // DISABLE_AUTOMATION_CRON so background scans can't fire mid-assertion;
  // the /api/simulate-cron trigger still works either way.
  if (process.env.DISABLE_AUTOMATION_CRON !== 'true') {
    setTimeout(() => runReminderScan(new Date()), 10_000);
    setInterval(() => runReminderScan(new Date()), 60 * 60 * 1000);
  }
}

bootstrap();
