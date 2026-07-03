import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { ASSET_TEMPLATES, DatabaseState, Task, Deliverable, User, Vendor, NotificationLog, TaskStatus, AssetType } from './src/types';

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), 'data.json');

app.use(express.json());

// Initialize Gemini SDK lazily to prevent crash on startup if key is missing
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set. Please configure it in Settings > Secrets.');
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

// Seed Initial Data
const DEFAULT_DB: DatabaseState = {
  vendors: [
    {
      Vendor_ID: 'v-pixel',
      Company_Name: 'PixelCraft Digital',
      Specialty: 'Social Media & Digital Creatives',
      Logo: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=120&auto=format&fit=crop&q=80'
    },
    {
      Vendor_ID: 'v-press',
      Company_Name: 'HighPress Prints Ltd',
      Specialty: 'Offline Banners & Print Layouts',
      Logo: 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=120&auto=format&fit=crop&q=80'
    },
    {
      Vendor_ID: 'v-modal',
      Company_Name: 'ModalUX Interactive',
      Specialty: 'In-App Web & UI Elements',
      Logo: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=120&auto=format&fit=crop&q=80'
    }
  ],
  users: [
    {
      User_ID: 'u-pfl-admin',
      Name: 'Sarah Jenkins',
      Email: 'sarah.pfl@company.com',
      Role: 'Internal',
      Vendor_ID: null,
      Avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80'
    },
    {
      User_ID: 'u-pixel-vendor',
      Name: 'Alex Rivero',
      Email: 'alex@pixelcraft.co',
      Role: 'Vendor',
      Vendor_ID: 'v-pixel',
      Avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80'
    },
    {
      User_ID: 'u-press-vendor',
      Name: 'Marcus Vance',
      Email: 'marcus@highpress.co',
      Role: 'Vendor',
      Vendor_ID: 'v-press',
      Avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120&auto=format&fit=crop&q=80'
    },
    {
      User_ID: 'u-modal-vendor',
      Name: 'Chloe Wu',
      Email: 'chloe@modalux.io',
      Role: 'Vendor',
      Vendor_ID: 'v-modal',
      Avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&auto=format&fit=crop&q=80'
    }
  ],
  tasks: [
    {
      Task_ID: 't-1',
      Title: 'LinkedIn Campaign: Q3 Product Release Briefing',
      Asset_Type: 'LinkedIn',
      Assigned_Vendor_ID: 'v-pixel',
      Due_Date: '2026-07-06',
      Status: 'In Progress',
      Dimensions: '1200 x 627 px (Standard landscape)',
      BrandGuidelines: 'Use company standard dark blue (#0A66C2) and charcoal gray (#1D2226). High contrast typography using "Inter" or similar clean sans-serif. Place branding in top-left corners.',
      Requirements: 'Must feature a prominent CTA ("Learn More" / "Register Now"), a clean background with 40% empty space, and the logo must have a safety margin of at least 32px.',
      Created_At: '2026-07-01T12:00:00.000Z'
    },
    {
      Task_ID: 't-2',
      Title: 'Customer Onboarding Email Flow Header Graphic',
      Asset_Type: 'Emailer',
      Assigned_Vendor_ID: 'v-pixel',
      Due_Date: '2026-07-04',
      Status: 'Assigned',
      Dimensions: '600 px width (Fluid responsive height)',
      BrandGuidelines: 'Light background colors ONLY. Text hierarchy: Headers in 24px bold, subheaders in 16px, body in 14px. Button color must be high-contrast accent.',
      Requirements: 'Optimize for dark mode (no hardcoded pure-white images). Inline images must be less than 500KB. Ensure key information is in HTML text, not embedded inside graphics.',
      Created_At: '2026-07-02T09:15:00.000Z'
    },
    {
      Task_ID: 't-3',
      Title: 'Annual Retail Summit Outdoor Billboard Banner',
      Asset_Type: 'Offline Banner',
      Assigned_Vendor_ID: 'v-press',
      Due_Date: '2026-07-10',
      Status: 'In Progress',
      Dimensions: '10 x 3 feet (Horizontal landscape banner)',
      BrandGuidelines: 'Extraordinarily high contrast colors. Large, display typography legible from 20 feet. Simple, high-fidelity logos on a solid background.',
      Requirements: 'Asset files must be submitted in CMYK color format. Export resolution must be at least 300 DPI with a 0.5-inch bleed border. Embed vector graphic shapes.',
      Created_At: '2026-06-30T10:00:00.000Z'
    },
    {
      Task_ID: 't-4',
      Title: 'Welcome Lightbox Pop-up for Core Application Update',
      Asset_Type: 'Desktop Pop-up',
      Assigned_Vendor_ID: 'v-modal',
      Due_Date: '2026-07-03',
      Status: 'Needs Revision',
      Dimensions: '800 x 500 px (Lightbox modal style)',
      BrandGuidelines: 'Frosted glassmorphic borders with a deep overlay background (#000000B3). Modern, visual focus with a large display heading ("Space Grotesk"). Minimalist footer.',
      Requirements: 'A functional "Close" button in the top-right corner is mandatory. Ensure the dismiss target is at least 44x44px. CTA must trigger immediately on click.',
      Created_At: '2026-06-28T08:00:00.000Z'
    }
  ],
  deliverables: [
    {
      Deliverable_ID: 'd-1',
      Task_ID: 't-4',
      File_URL: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=800&auto=format&fit=crop&q=80',
      File_Name: 'welcome_modal_v1.png',
      Version: 1,
      Uploaded_At: '2026-06-29T14:32:00.000Z',
      Approval_Status: 'Rejected',
      Feedback_History: [
        {
          id: 'f-1',
          reviewer: 'Sarah Jenkins',
          comment: 'The dismiss close button in the top right is missing. Also, please increase the backdrop-blur value to separate the modal card from background web content.',
          date: '2026-06-29T16:00:00.000Z',
          source: 'Human'
        }
      ]
    },
    {
      Deliverable_ID: 'd-2',
      Task_ID: 't-1',
      File_URL: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&auto=format&fit=crop&q=80',
      File_Name: 'linkedin_q3_draft_v1.png',
      Version: 1,
      Uploaded_At: '2026-07-02T10:15:00.000Z',
      Approval_Status: 'Pending',
      Feedback_History: []
    }
  ],
  logs: [
    {
      id: 'l-1',
      timestamp: '2026-06-28T08:05:00.000Z',
      type: 'system_template',
      message: 'Welcome Lightbox Pop-up task created. Pre-populated standard "Desktop Pop-up" dimensions and design templates.',
      meta: { taskId: 't-4', assetType: 'Desktop Pop-up' }
    },
    {
      id: 'l-2',
      timestamp: '2026-06-29T14:32:00.000Z',
      type: 'delivered',
      message: 'Deliverable welcome_modal_v1.png uploaded by ModalUX Interactive. Alerting internal PFL staff.',
      meta: { taskId: 't-4', vendorName: 'ModalUX Interactive' }
    },
    {
      id: 'l-3',
      timestamp: '2026-07-01T12:05:00.000Z',
      type: 'system_template',
      message: 'LinkedIn Campaign task created. Applied automated social advertising layout blueprints.',
      meta: { taskId: 't-1', assetType: 'LinkedIn' }
    }
  ]
};

// Database Read/Write Helpers
function loadDb(): DatabaseState {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading db file, using default state:', err);
  }
  // Write default state to disk
  saveDb(DEFAULT_DB);
  return DEFAULT_DB;
}

function saveDb(data: DatabaseState) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing to db file:', err);
  }
}

// Global active notifications list for simulated live WebSockets (using standard long polling updates)
let liveEvents: any[] = [];

// API Middleware: Get current simulated user and enforce Row-Level Security constraints
function getSecurityContext(req: any, res: any, next: any) {
  const userId = req.headers['x-simulated-user-id'] as string;
  const db = loadDb();
  
  const user = db.users.find(u => u.User_ID === userId);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Simulated User Header is missing or invalid.' });
  }

  req.user = user;
  req.db = db;
  next();
}

// -------------------------------------------------------------
// SECURE API ROUTES (ROW-LEVEL SECURITY ENFORCED)
// -------------------------------------------------------------

// Retrieve relational state based on user isolation credentials
app.get('/api/db', getSecurityContext, (req: any, res: any) => {
  const user: User = req.user;
  const db: DatabaseState = req.db;
  
  // Security Layer (RLS Engine Logging)
  const rlsLogs: string[] = [];
  
  let allowedTasks = [...db.tasks];
  let allowedDeliverables = [...db.deliverables];
  let allowedVendors = [...db.vendors];
  
  rlsLogs.push(`User Authenticated: ${user.Name} (${user.Role})`);
  
  if (user.Role === 'Vendor') {
    // THE RLS RULE: Vendors can ONLY access and view rows where their User.Vendor_ID matches the Assigned_Vendor_ID
    rlsLogs.push(`RLS Query Constraint Triggered: Role == Vendor (Vendor_ID: ${user.Vendor_ID})`);
    rlsLogs.push(`Enforcing rule: Assigned_Vendor_ID == '${user.Vendor_ID}'`);
    
    allowedTasks = db.tasks.filter(t => t.Assigned_Vendor_ID === user.Vendor_ID);
    allowedDeliverables = db.deliverables.filter(d => {
      const parentTask = db.tasks.find(t => t.Task_ID === d.Task_ID);
      return parentTask && parentTask.Assigned_Vendor_ID === user.Vendor_ID;
    });
    
    // Only show their own vendor registry profile
    allowedVendors = db.vendors.filter(v => v.Vendor_ID === user.Vendor_ID);
    
    rlsLogs.push(`RLS Result: Filtered database down to ${allowedTasks.length} Tasks, ${allowedDeliverables.length} Deliverables.`);
  } else {
    rlsLogs.push(`RLS Bypass: Internal PFL Team Member. Full administrative read query granted.`);
  }

  res.json({
    user,
    users: db.users,
    vendors: allowedVendors,
    tasks: allowedTasks,
    deliverables: allowedDeliverables,
    logs: db.logs,
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
app.post('/api/tasks', getSecurityContext, (req: any, res: any) => {
  const user: User = req.user;
  const db: DatabaseState = req.db;

  if (user.Role !== 'Internal') {
    return res.status(403).json({ error: 'RLS Reject: Only internal PFL staff members are authorized to create or configure creative task briefs.' });
  }

  const { Title, Asset_Type, Assigned_Vendor_ID, Due_Date, Custom_Dimensions, Custom_Guidelines, Custom_Requirements } = req.body;

  if (!Title || !Asset_Type || !Assigned_Vendor_ID || !Due_Date) {
    return res.status(400).json({ error: 'Validation Error: Title, Asset_Type, Assigned_Vendor_ID, and Due_Date are required fields.' });
  }

  // Look up vendor to confirm they exist
  const vendor = db.vendors.find(v => v.Vendor_ID === Assigned_Vendor_ID);
  if (!vendor) {
    return res.status(400).json({ error: 'Validation Error: Specified vendor does not exist in registry.' });
  }

  // Automation Rule 3: Automatically pre-populate default layout templates and branding specs
  const standardTemplate = ASSET_TEMPLATES[Asset_Type as AssetType];
  const finalDimensions = Custom_Dimensions || standardTemplate?.dimensions || 'Custom specifications';
  const finalGuidelines = Custom_Guidelines || standardTemplate?.brandGuidelines || 'Standard company guidelines';
  const finalRequirements = Custom_Requirements || standardTemplate?.requirements || 'Standard output delivery guidelines';

  const newTask: Task = {
    Task_ID: 't-' + (db.tasks.length + 1) + '-' + Math.floor(Math.random() * 1000),
    Title,
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
    id: 'l-' + Date.now(),
    timestamp: new Date().toISOString(),
    type: 'system_template',
    message: `New creative request "${Title}" created. Automatically pre-populated specifications and guidelines for Asset Type: ${Asset_Type}.`,
    meta: {
      taskId: newTask.Task_ID,
      assetType: Asset_Type,
      vendorName: vendor.Company_Name
    }
  };
  db.logs.unshift(newLog);

  saveDb(db);

  res.status(201).json({ task: newTask, log: newLog });
});

// Update Task Status (For toggling Assigned -> In Progress or approving deliverables)
app.post('/api/tasks/:id/status', getSecurityContext, (req: any, res: any) => {
  const user: User = req.user;
  const db: DatabaseState = req.db;
  const taskId = req.params.id;
  const { status } = req.body as { status: TaskStatus };

  const task = db.tasks.find(t => t.Task_ID === taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  // RLS Security enforcement for state updating
  if (user.Role === 'Vendor' && task.Assigned_Vendor_ID !== user.Vendor_ID) {
    return res.status(403).json({ error: 'RLS Blocked: You are not authorized to edit tasks belonging to other external agencies.' });
  }

  const oldStatus = task.Status;
  task.Status = status;

  // Track activity
  const newLog: NotificationLog = {
    id: 'l-' + Date.now(),
    timestamp: new Date().toISOString(),
    type: 'system_template',
    message: `Task "${task.Title}" status changed from '${oldStatus}' to '${status}' by ${user.Name}.`,
    meta: {
      taskId: task.Task_ID,
      taskTitle: task.Title,
      vendorId: task.Assigned_Vendor_ID
    }
  };
  db.logs.unshift(newLog);

  // Automation Rule 1: WebSocket Simulation Alert for delivered assets
  if (status === 'Delivered') {
    const liveAlert = {
      id: 'alert-' + Date.now(),
      timestamp: new Date().toISOString(),
      title: '📦 Asset Delivered!',
      message: `Vendor ${user.Name} has uploaded a new creative deliverable for "${task.Title}". Ready for review.`,
      taskId: task.Task_ID,
      vendorName: db.vendors.find(v => v.Vendor_ID === task.Assigned_Vendor_ID)?.Company_Name || 'External Agency'
    };
    liveEvents.push(liveAlert);
  }

  saveDb(db);
  res.json({ task, log: newLog });
});

// Submit Deliverable (Upload simulating version control)
app.post('/api/deliverables', getSecurityContext, (req: any, res: any) => {
  const user: User = req.user;
  const db: DatabaseState = req.db;
  const { Task_ID, File_URL, File_Name } = req.body;

  if (!Task_ID || !File_URL || !File_Name) {
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

  // Count existing versions to increment version counter
  const existingDeliverables = db.deliverables.filter(d => d.Task_ID === Task_ID);
  const nextVersion = existingDeliverables.length + 1;

  // Create new deliverable record
  const newDeliverable: Deliverable = {
    Deliverable_ID: 'd-' + (db.deliverables.length + 1) + '-' + Math.floor(Math.random() * 1000),
    Task_ID,
    File_URL,
    File_Name,
    Version: nextVersion,
    Uploaded_At: new Date().toISOString(),
    Approval_Status: 'Pending',
    Feedback_History: []
  };

  db.deliverables.push(newDeliverable);

  // Update original task state to 'Delivered'
  const oldStatus = task.Status;
  task.Status = 'Delivered';

  // Log automation activity
  const newLog: NotificationLog = {
    id: 'l-' + Date.now(),
    timestamp: new Date().toISOString(),
    type: 'delivered',
    message: `New creative file "${File_Name}" (v${nextVersion}) uploaded by agency. Project state auto-advanced to 'Delivered'.`,
    meta: {
      taskId: task.Task_ID,
      taskTitle: task.Title,
      vendorId: task.Assigned_Vendor_ID,
      vendorName: db.vendors.find(v => v.Vendor_ID === task.Assigned_Vendor_ID)?.Company_Name || 'External Agency'
    }
  };
  db.logs.unshift(newLog);

  // Trigger Live Event Popup simulation
  const liveAlert = {
    id: 'alert-' + Date.now(),
    timestamp: new Date().toISOString(),
    title: '📦 Asset Delivered!',
    message: `New deliverable uploaded: "${File_Name}" (Version ${nextVersion}) for "${task.Title}".`,
    taskId: task.Task_ID,
    vendorName: db.vendors.find(v => v.Vendor_ID === task.Assigned_Vendor_ID)?.Company_Name || 'External Agency'
  };
  liveEvents.push(liveAlert);

  saveDb(db);
  res.status(201).json({ deliverable: newDeliverable, task, log: newLog });
});

// Submit Deliverable Review (Approve or Needs Revision with feedback)
app.post('/api/deliverables/:id/review', getSecurityContext, (req: any, res: any) => {
  const user: User = req.user;
  const db: DatabaseState = req.db;
  const deliverableId = req.params.id;
  const { status, comment } = req.body as { status: 'Approved' | 'Rejected'; comment: string };

  if (user.Role !== 'Internal') {
    return res.status(403).json({ error: 'RLS Reject: Only PFL internal brand managers can review and approve agency deliverables.' });
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

  if (comment) {
    deliverable.Feedback_History.push({
      id: 'f-' + Date.now(),
      reviewer: user.Name,
      comment,
      date: new Date().toISOString(),
      source: 'Human'
    });
  }

  // Create log entry
  const newLog: NotificationLog = {
    id: 'l-' + Date.now(),
    timestamp: new Date().toISOString(),
    type: 'system_template',
    message: `Deliverable review completed for "${deliverable.File_Name}": Set to '${status}'. Task updated to '${task.Status}'.`,
    meta: {
      taskId: task.Task_ID,
      taskTitle: task.Title,
      vendorId: task.Assigned_Vendor_ID
    }
  };
  db.logs.unshift(newLog);

  saveDb(db);
  res.json({ deliverable, task, log: newLog });
});

// Submit Deliverable Back-and-Forth Feedback Comment (For both Internal Brand Managers and Vendors)
app.post('/api/deliverables/:id/feedback', getSecurityContext, (req: any, res: any) => {
  const user: User = req.user;
  const db: DatabaseState = req.db;
  const deliverableId = req.params.id;
  const { comment } = req.body as { comment: string };

  if (!comment) {
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
    id: 'f-rep-' + Date.now(),
    reviewer: user.Name,
    comment,
    date: new Date().toISOString(),
    source: 'Human'
  });

  // Create log entry
  const newLog: NotificationLog = {
    id: 'l-' + Date.now(),
    timestamp: new Date().toISOString(),
    type: 'system_template',
    message: `💬 Back-and-forth feedback comment posted on "${deliverable.File_Name}" (v${deliverable.Version}) by ${user.Name} (${user.Role}).`,
    meta: {
      taskId: task.Task_ID,
      taskTitle: task.Title,
      vendorId: task.Assigned_Vendor_ID,
      vendorName: db.vendors.find(v => v.Vendor_ID === task.Assigned_Vendor_ID)?.Company_Name || 'External Agency'
    }
  };
  db.logs.unshift(newLog);

  // Trigger Live Event Popup simulation
  const liveAlert = {
    id: 'alert-' + Date.now(),
    timestamp: new Date().toISOString(),
    title: `💬 Feedback Comment from ${user.Role === 'Internal' ? 'PFL' : 'Agency'}`,
    message: `"${comment.length > 55 ? comment.substring(0, 55) + '...' : comment}"`,
    taskId: task.Task_ID,
    vendorName: db.vendors.find(v => v.Vendor_ID === task.Assigned_Vendor_ID)?.Company_Name || 'External Agency'
  };
  liveEvents.push(liveAlert);

  saveDb(db);
  res.json({ deliverable, task, log: newLog });
});

// -------------------------------------------------------------
// AUTOMATION CRON WORKER & ALERTS SIMULATOR
// -------------------------------------------------------------

// Polling route for receiving simulated real-time WebSocket events
app.get('/api/live-events', (req, res) => {
  const currentAlerts = [...liveEvents];
  liveEvents = []; // clear queue
  res.json({ events: currentAlerts });
});

// Trigger 48 hours overdue check (Simulates hourly Cron Job task runner)
app.post('/api/simulate-cron', getSecurityContext, (req: any, res: any) => {
  const db: DatabaseState = req.db;
  const user: User = req.user;
  
  if (user.Role !== 'Internal') {
    return res.status(403).json({ error: 'Forbidden. Simulated Cron triggers are restricted to internal coordinators.' });
  }

  const triggeredAlerts: NotificationLog[] = [];
  
  // Set simulated "current time" to compare due dates (e.g. 2026-07-02 as base)
  const currentSimulatedTime = new Date('2026-07-02T23:42:00.000Z');
  
  db.tasks.forEach(task => {
    // Check if task status is still Assigned or In Progress
    if (task.Status === 'Assigned' || task.Status === 'In Progress') {
      const dueDate = new Date(task.Due_Date + 'T23:59:59.000Z');
      const timeDiff = dueDate.getTime() - currentSimulatedTime.getTime();
      const hoursRemaining = timeDiff / (1000 * 60 * 60);

      // Trigger condition: within 48 hours of due date (hoursRemaining <= 48 && hoursRemaining > 0)
      if (hoursRemaining <= 48 && hoursRemaining >= 0) {
        // Verify if a notification log already exists for this task to prevent duplicates
        const alreadyNotified = db.logs.some(l => l.type === 'cron_reminder' && l.meta.taskId === task.Task_ID);
        
        if (!alreadyNotified) {
          const vendor = db.vendors.find(v => v.Vendor_ID === task.Assigned_Vendor_ID);
          const reminderLog: NotificationLog = {
            id: 'l-cron-' + Date.now() + '-' + task.Task_ID,
            timestamp: new Date().toISOString(),
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
          db.logs.unshift(reminderLog);
        }
      }
    }
  });

  if (triggeredAlerts.length > 0) {
    saveDb(db);
  }

  res.json({
    triggered: triggeredAlerts.length,
    reminders: triggeredAlerts,
    logs: db.logs
  });
});

// -------------------------------------------------------------
// GEMINI INTELLIGENT AI ART DIRECTOR REVIEW AGENT
// -------------------------------------------------------------

app.post('/api/gemini/critique', getSecurityContext, async (req: any, res: any) => {
  const db: DatabaseState = req.db;
  const { deliverableId, fileSummaryText } = req.body;

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

  const vendor = db.vendors.find(v => v.Vendor_ID === task.Assigned_Vendor_ID);

  try {
    const ai = getGeminiClient();
    
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

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.7,
        maxOutputTokens: 1000,
      }
    });

    const critiqueText = response.text || "AI Art Director unable to generate constructive critique at this moment. Structure: Check dimensions, inspect typography, and confirm color balance are compliant.";

    // Append critique to Deliverable's Feedback_History
    deliverable.Feedback_History.push({
      id: 'f-ai-' + Date.now(),
      reviewer: 'AI Art Director (Gemini)',
      comment: critiqueText.trim(),
      date: new Date().toISOString(),
      source: 'AI'
    });

    // Auto update task status if AI found feedback so the vendor can iterate
    task.Status = 'Needs Revision';

    // Log the AI critique event
    const newLog: NotificationLog = {
      id: 'l-' + Date.now(),
      timestamp: new Date().toISOString(),
      type: 'system_template',
      message: `🤖 Automated AI Creative Review dispatched for "${deliverable.File_Name}" (v${deliverable.Version}). Task status flagged as 'Needs Revision' for agency iteration.`,
      meta: {
        taskId: task.Task_ID,
        taskTitle: task.Title,
        vendorId: task.Assigned_Vendor_ID
      }
    };
    db.logs.unshift(newLog);

    saveDb(db);

    res.json({
      critique: critiqueText,
      deliverable,
      task,
      log: newLog
    });

  } catch (error) {
    console.error('Error in Gemini creative feedback critique endpoint:', error);
    
    // Provide an elegant fallback critique in case of quota or api configuration issues
    const fallbackCritique = `🤖 AI Creative Director critique failed to load (Please confirm GEMINI_API_KEY is configured in Settings > Secrets). 
    
    **Review Panel Checklist (Manual Review Needed):**
    - **Dimensions**: Verify asset conforms strictly to specified format: "${task.Dimensions}".
    - **Palette**: Ensure colors align with guidelines: "${task.BrandGuidelines}".
    - **Visual Elements**: Confirm central imagery contains high-impact compositions.
    - **CTA Check**: Double check buttons are clearly visible with readable, actionable text.`;
    
    deliverable.Feedback_History.push({
      id: 'f-ai-fallback-' + Date.now(),
      reviewer: 'AI Director (Offline)',
      comment: fallbackCritique,
      date: new Date().toISOString(),
      source: 'AI'
    });
    
    task.Status = 'Needs Revision';
    saveDb(db);

    res.json({
      critique: fallbackCritique,
      deliverable,
      task,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// -------------------------------------------------------------
// VITE MIDDLEWARE & STATIC ASSET PIPELINE
// -------------------------------------------------------------

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    // Mount Vite dev server middleware to handle HMR, code compiling, and SPA assets automatically
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
    // Load database on start
    loadDb();
  });
}

bootstrap();
