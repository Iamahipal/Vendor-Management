// 'Internal' = IC team (book slots, brief vendors, hand off to release);
// 'Vendor' = external agency (creatives); 'Release' = the release SPOC who
// pushes communications live via Factorial and marks them Released.
export type Role = 'Internal' | 'Vendor' | 'Release';

// Full internal-communications channel catalogue: internal (Snapcoms-deployed),
// social/employer branding, and offline/print. The original five names are
// kept unchanged so existing data stays valid.
export type AssetType =
  // Internal comms
  | 'Emailer'
  | 'Desktop Pop-up'
  | 'Ticker / Teams Notification'
  | 'Desktop Wallpaper'
  | 'Lock Screen Wallpaper'
  // Social media / employer branding
  | 'LinkedIn'
  | 'Instagram'
  | 'Carousel'
  | 'Reel / Video'
  // Offline & print
  | 'Offline Banner'
  | 'Standee'
  | 'Poster / Print'
  | 'Wall Branding';

export type AssetCategory = 'Internal Comms' | 'Social Media' | 'Offline & Print';

export type TaskStatus = 'Assigned' | 'In Progress' | 'Delivered' | 'Approved' | 'Needs Revision' | 'Cancelled';

// Special vendor id representing work fulfilled by the internal team itself
// (wallpapers, tickers, popups deployed via Snapcoms etc.)
export const INHOUSE_VENDOR_ID = 'v-inhouse';

export interface User {
  User_ID: string;
  Name: string;
  Email: string;
  Role: Role;
  Vendor_ID: string | null; // null for internal staff, required for vendors
  Avatar: string;
}

export interface Vendor {
  Vendor_ID: string;
  Company_Name: string;
  Specialty: string;
  Logo: string;
}

export interface Task {
  Task_ID: string;
  Title: string;
  Asset_Type: AssetType;
  Assigned_Vendor_ID: string;
  Due_Date: string; // YYYY-MM-DD
  Status: TaskStatus;
  Dimensions: string;
  BrandGuidelines: string;
  Requirements: string;
  Created_At: string;
  // Set when a deliverable is approved — basis for on-time metrics
  Approved_At?: string;
  // Task-level conversation so questions can be asked before any design
  // is submitted (deliverables have their own per-version threads)
  Comments?: FeedbackItem[];
}

export interface FeedbackItem {
  id: string;
  reviewer: string;
  comment: string;
  date: string;
  source: 'Human' | 'AI';
}

export interface Deliverable {
  Deliverable_ID: string;
  Task_ID: string;
  File_URL: string;
  File_Name: string;
  Version: number;
  Uploaded_At: string;
  Approval_Status: 'Pending' | 'Approved' | 'Rejected';
  Feedback_History: FeedbackItem[];
}

export interface NotificationLog {
  id: string;
  timestamp: string;
  type: 'delivered' | 'cron_reminder' | 'cron_overdue' | 'system_template';
  message: string;
  meta: {
    taskId?: string;
    taskTitle?: string;
    vendorId?: string;
    vendorName?: string;
    dueDate?: string;
    hoursLeft?: number;
    assetType?: string;
  };
}

// -------------------------------------------------------------
// CALENDAR / RELEASE PIPELINE
// A Communication is a booked slot on the IC calendar. It flows:
//   Booked -> In Design (if a creative is needed) -> Ready ->
//   Handed Off (release form sent to SPOC) -> Released.
// -------------------------------------------------------------

// The internal-comms channels that get booked on the daily calendar,
// matching the IC calendar sheet. Channels that need a designed asset map
// to an AssetType (see CHANNEL_ASSET_TYPE).
export type CommsChannel =
  | 'Mail'
  | 'Desktop Pop-up'
  | 'Desktop Wallpaper'
  | 'Lockscreen Wallpaper'
  | 'Sigma'
  | 'MS Teams'
  | 'Ticker'
  | 'Sales One'
  | 'DMS'
  | 'BFL Social'
  | 'SMS'
  | 'Snapcomms';

export const COMMS_CHANNELS: CommsChannel[] = [
  'Mail', 'Desktop Pop-up', 'Desktop Wallpaper', 'Lockscreen Wallpaper', 'Sigma', 'MS Teams', 'Ticker',
  'Sales One', 'DMS', 'BFL Social', 'SMS', 'Snapcomms'
];

// Day-of-week numbers: 0=Sun … 6=Sat
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Scheduling rules per channel, from the sheet's SCHEDULE tab: the default
// slot time(s), which weekdays it runs, its recommended frequency, and
// whether it typically needs a designed creative. `days: null` = every day.
export interface ChannelRule {
  times: string[];
  days: Weekday[] | null;
  frequency: string;
  needsCreative: boolean;
  note?: string;
}

export const CHANNEL_RULES: Record<CommsChannel, ChannelRule> = {
  'Mail':          { times: ['10:00', '12:00', '15:00', '17:00'], days: null, frequency: '4 / day (+ as needed)', needsCreative: true },
  'Desktop Pop-up':{ times: ['11:00'], days: null, frequency: '1 / day', needsCreative: true, note: "Can't share a time with Ticker" },
  'Desktop Wallpaper':  { times: [], days: null, frequency: 'Weekly (one campaign per week)', needsCreative: true },
  'Lockscreen Wallpaper':{ times: [], days: null, frequency: 'Weekly (one campaign per week)', needsCreative: true },
  'Sigma':         { times: ['11:30'], days: [5, 6], frequency: '1 / day (Fri, Sat)', needsCreative: false },
  'MS Teams':      { times: ['16:30'], days: null, frequency: '1 / day', needsCreative: false },
  'Ticker':        { times: ['14:00'], days: null, frequency: '1 / day', needsCreative: false, note: "Can't share a time with Pop-up" },
  'Sales One':     { times: ['09:30'], days: [1, 3], frequency: '1 / day (Mon, Wed)', needsCreative: false },
  'DMS':           { times: ['11:30'], days: [2, 4], frequency: '1 / day (Tue, Thu)', needsCreative: false },
  'BFL Social':    { times: [], days: null, frequency: 'Any time', needsCreative: true },
  'SMS':           { times: ['11:00'], days: null, frequency: 'As needed', needsCreative: false },
  'Snapcomms':     { times: [], days: null, frequency: 'Any time', needsCreative: false },
};

// The recommended daily slot grid, in display order (time + channel). Mail
// also allows extra "as per request" bookings beyond its fixed times.
export const DAILY_SLOTS: { time: string; channel: CommsChannel }[] = [
  { time: '09:30', channel: 'Sales One' },
  { time: '10:00', channel: 'Mail' },
  { time: '11:00', channel: 'Desktop Pop-up' },
  { time: '11:00', channel: 'SMS' },
  { time: '11:30', channel: 'Sigma' },
  { time: '11:30', channel: 'DMS' },
  { time: '12:00', channel: 'Mail' },
  { time: '14:00', channel: 'Ticker' },
  { time: '15:00', channel: 'Mail' },
  { time: '16:30', channel: 'MS Teams' },
  { time: '17:00', channel: 'Mail' },
];

// The slots that actually apply on a given date, honouring day-of-week rules.
export function slotsForDate(dateISO: string): { time: string; channel: CommsChannel }[] {
  const weekday = new Date(dateISO + 'T00:00:00').getDay() as Weekday;
  return DAILY_SLOTS.filter(s => {
    const days = CHANNEL_RULES[s.channel].days;
    return days === null || days.includes(weekday);
  });
}

export const SLOT_TIMES = ['09:30', '10:00', '11:00', '11:30', '12:00', '14:00', '15:00', '16:00', '16:30', '17:00'];

// Channels that typically need a designed creative → default vendor asset type.
export const CHANNEL_ASSET_TYPE: Partial<Record<CommsChannel, AssetType>> = {
  'Mail': 'Emailer',
  'Desktop Pop-up': 'Desktop Pop-up',
  'Desktop Wallpaper': 'Desktop Wallpaper',
  'Lockscreen Wallpaper': 'Lock Screen Wallpaper',
  'MS Teams': 'Ticker / Teams Notification',
  'BFL Social': 'Instagram',
};

// The four standard release slots (from the IC calendar). Other times are
// possible on request — the form offers a "special time" override.
export const STANDARD_RELEASE_TIMES = ['10:00', '12:00', '15:00', '17:00'];

export type CommStatus = 'Booked' | 'In Design' | 'Ready' | 'Handed Off' | 'Released' | 'Cancelled';

export type Audience = 'All Employees' | 'Targeted';
export const AUDIENCES: Audience[] = ['All Employees', 'Targeted'];

// The IC team's Comms SPOCs (slot owners). Booking picks one; the calendar
// colour-codes slots by SPOC. Free-text "Other" is also allowed on the form.
export const IC_SPOCS = ['Sarah Jenkins', 'Niharika Srivastava', 'Naythan Vaz', 'Tushangi Rastogi', 'Monika Mishra'];

// A stable, light-mode palette; each SPOC hashes to one entry so their colour
// is consistent everywhere (month cells, week cells, legend).
export interface SpocColor { bg: string; text: string; border: string; dot: string; }
export const SPOC_PALETTE: SpocColor[] = [
  { bg: 'bg-blue-50',    text: 'text-blue-800',    border: 'border-blue-200',    dot: 'bg-blue-500' },
  { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  { bg: 'bg-violet-50',  text: 'text-violet-800',  border: 'border-violet-200',  dot: 'bg-violet-500' },
  { bg: 'bg-amber-50',   text: 'text-amber-800',   border: 'border-amber-200',   dot: 'bg-amber-500' },
  { bg: 'bg-rose-50',    text: 'text-rose-800',    border: 'border-rose-200',    dot: 'bg-rose-500' },
  { bg: 'bg-cyan-50',    text: 'text-cyan-800',    border: 'border-cyan-200',    dot: 'bg-cyan-500' },
  { bg: 'bg-fuchsia-50', text: 'text-fuchsia-800', border: 'border-fuchsia-200', dot: 'bg-fuchsia-500' },
  { bg: 'bg-teal-50',    text: 'text-teal-800',    border: 'border-teal-200',    dot: 'bg-teal-500' },
];
const SPOC_NEUTRAL: SpocColor = { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200', dot: 'bg-slate-300' };

export function spocColor(name?: string): SpocColor {
  if (!name) return SPOC_NEUTRAL;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SPOC_PALETTE[h % SPOC_PALETTE.length];
}

// Sub-type of a mail-style communication (the "Mailer/Bulletin" column)
export type CommSubType = 'Mailer' | 'Bulletin' | 'Notification' | 'Mail';
export const COMM_SUBTYPES: CommSubType[] = ['Mailer', 'Bulletin', 'Notification', 'Mail'];

// Shape returned by POST /api/ai/parse-booking (email → booking draft)
export interface BookingDraft {
  channel: string; campaign_name: string; subject_line: string; department: string;
  business_spoc: string; audience: string; languages: string[];
  release_date: string; release_time: string; priority: string;
}

// Campaign priority category (Sheet2)
export type CommCategory = 'Critical' | 'Important' | 'General';
export const COMM_CATEGORIES: CommCategory[] = ['Critical', 'Important', 'General'];

// Languages a communication ships in (multi-select). "Vernac" covers the
// regional/vernacular languages as a single choice.
export const COMM_LANGUAGES = ['English', 'Vernac'];

export interface Communication {
  Comm_ID: string;
  // Booking core
  Channel: CommsChannel;
  Release_Date: string;   // YYYY-MM-DD
  Release_Time: string;
  Department: string;     // requesting team
  Campaign_Name: string;
  Subject_Line: string;
  Comms_SPOC: string;     // IC owner handling it
  Business_SPOC: string;  // requester-side owner
  Audience: Audience;
  Languages: string[];    // one or more of COMM_LANGUAGES
  Sub_Type?: CommSubType;
  Category?: CommCategory;
  // A reserved-but-empty slot (the sheet's "Blocked" status)
  Blocked?: boolean;
  // Release-form (handoff) fields
  CTA_Text?: string;
  CTA_Link?: string;
  Sender_ID?: string;
  Creative_Link?: string; // OneDrive link to final creative
  // Links & lifecycle
  Linked_Task_ID?: string; // vendor creative task, if any
  Status: CommStatus;
  Created_At: string;
  Handed_Off_At?: string;
  Released_At?: string;
  Released_By?: string;
  Notes?: string;
}

// -------------------------------------------------------------
// WEEKLY PLACEMENTS — Wallpaper, Lockscreen, and banner surfaces book by the
// week (Start → End), one campaign per week, not by daily time slot.
// -------------------------------------------------------------
export type PlacementSurface = 'Wallpaper' | 'Lockscreen' | 'Croma Banner' | 'Illume Banner';
export const PLACEMENT_SURFACES: PlacementSurface[] = ['Wallpaper', 'Lockscreen', 'Croma Banner', 'Illume Banner'];

export interface WeeklyPlacement {
  Placement_ID: string;
  Surface: PlacementSurface;
  Start_Date: string; // YYYY-MM-DD (week start)
  End_Date: string;   // YYYY-MM-DD (week end)
  Business_Unit: string;
  Campaign_Theme: string;
  Comms_SPOC: string;
  Business_SPOC: string;
  Audience: string;
  Status: 'Planned' | 'Blocked' | 'Live';
  Comments?: string;
  Created_At: string;
}

// -------------------------------------------------------------
// WEBINARS — a separate calendar of scheduled sessions.
// -------------------------------------------------------------
export interface Webinar {
  Webinar_ID: string;
  Date: string;       // YYYY-MM-DD
  Start_Time: string;
  End_Time: string;
  Department: string;
  Topic: string;
  Host: string;
  Comms_SPOC: string;
  Audience: string;
  Views?: number;
  Created_At: string;
}

export interface DatabaseState {
  users: User[];
  vendors: Vendor[];
  tasks: Task[];
  deliverables: Deliverable[];
  communications: Communication[];
  placements: WeeklyPlacement[];
  webinars: Webinar[];
  logs: NotificationLog[];
  user?: User;
}

// True when a URL points at an image we can render inline; false for share
// links (OneDrive, Google Drive, Dropbox, ...) that should open in a new tab.
export function isDirectImage(url: string): boolean {
  try {
    const u = new URL(url);
    if (/\.(png|jpe?g|gif|webp|svg|avif)($|\?)/i.test(u.pathname + u.search)) return true;
    return /(^|\.)images\.unsplash\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

// Deadline urgency for a task, shown as badges in both dashboards.
// Returns null when the task is done or the deadline is comfortably far out.
export function getDueUrgency(task: Pick<Task, 'Due_Date' | 'Status'>): { label: string; tone: 'overdue' | 'soon' } | null {
  if (task.Status === 'Approved' || task.Status === 'Delivered' || task.Status === 'Cancelled') return null;
  const end = new Date(task.Due_Date + 'T23:59:59.000Z').getTime();
  const diffMs = end - Date.now();
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < 0) {
    const daysOver = Math.max(1, Math.ceil(-diffMs / day));
    return { label: `Overdue ${daysOver}d`, tone: 'overdue' };
  }
  const daysLeft = Math.ceil(diffMs / day);
  if (daysLeft <= 2) {
    return { label: daysLeft <= 1 ? 'Due today' : `Due in ${daysLeft}d`, tone: 'soon' };
  }
  return null;
}

export interface AssetTemplate {
  category: AssetCategory;
  dimensions: string;
  brandGuidelines: string;
  requirements: string;
}

export const ASSET_TEMPLATES: Record<AssetType, AssetTemplate> = {
  // ---- Internal comms (Snapcoms / company devices) ----
  'Emailer': {
    category: 'Internal Comms',
    dimensions: '600 px width (Fluid responsive height)',
    brandGuidelines: 'Light background colors ONLY. Text hierarchy: Headers in 24px bold, subheaders in 16px, body in 14px. Button color must be high-contrast accent.',
    requirements: 'Optimize for dark mode (no hardcoded pure-white images). Inline images must be less than 500KB. Ensure key information is in HTML text, not embedded inside graphics.'
  },
  'Desktop Pop-up': {
    category: 'Internal Comms',
    dimensions: '800 x 500 px (Lightbox modal style)',
    brandGuidelines: 'Frosted glassmorphic borders with a deep overlay background (#000000B3). Modern, visual focus with a large display heading ("Space Grotesk"). Minimalist footer.',
    requirements: 'A functional "Close" button in the top-right corner is mandatory. Ensure the dismiss target is at least 44x44px. CTA must trigger immediately on click.'
  },
  'Ticker / Teams Notification': {
    category: 'Internal Comms',
    dimensions: '1920 x 60 px strip (or Teams card 600 x 200 px)',
    brandGuidelines: 'Single-line message, high contrast on brand background. No dense graphics — text must stay legible at a glance.',
    requirements: 'Message under 120 characters. Provide both the strip artwork and the plain text line. Include start/end date for the ticker run.'
  },
  'Desktop Wallpaper': {
    category: 'Internal Comms',
    dimensions: '1920 x 1080 px (16:9, full HD)',
    brandGuidelines: 'Brand palette, uncluttered composition. Keep the center-left area calm — desktop icons sit on the left side of the screen.',
    requirements: 'Keep all critical text/logos inside the central 80% safe zone. Also export a 2560 x 1440 px version for larger monitors. JPG or PNG under 2MB.'
  },
  'Lock Screen Wallpaper': {
    category: 'Internal Comms',
    dimensions: '1920 x 1080 px (16:9, full HD)',
    brandGuidelines: 'Calm, low-noise background so the clock and login prompt stay readable. Brand accent colors welcome; avoid busy patterns.',
    requirements: 'Keep the lower-center third free — Windows shows time, date and login UI there. No small text anywhere. JPG or PNG under 2MB.'
  },
  // ---- Social media / employer branding ----
  'LinkedIn': {
    category: 'Social Media',
    dimensions: '1200 x 627 px (Standard landscape)',
    brandGuidelines: 'Use company standard dark blue (#0A66C2) and charcoal gray (#1D2226). High contrast typography using "Inter" or similar clean sans-serif. Place branding in top-left corners.',
    requirements: 'Must feature a prominent CTA ("Learn More" / "Register Now"), a clean background with 40% empty space, and the logo must have a safety margin of at least 32px.'
  },
  'Instagram': {
    category: 'Social Media',
    dimensions: '1080 x 1080 px (Square 1:1 format)',
    brandGuidelines: 'Bold, highly energetic color palette. Central, single-focus imagery. Modern editorial feel with elegant sans-serif headings. Minimal brand presence.',
    requirements: 'Observe the 20% text rule (text overlay must not dominate the square). All key content must sit within the 900x900px central safety zone.'
  },
  'Carousel': {
    category: 'Social Media',
    dimensions: '1080 x 1350 px per slide (4:5 portrait), 3-10 slides',
    brandGuidelines: 'Consistent template across slides: same margins, heading style and page indicator. Strong hook on slide 1, single idea per slide.',
    requirements: 'Deliver each slide as a separate numbered file plus a combined preview. Last slide must carry the CTA and brand sign-off. Keep text within the central safe zone on every slide.'
  },
  'Reel / Video': {
    category: 'Social Media',
    dimensions: '1080 x 1920 px (9:16 vertical), 15-60 seconds',
    brandGuidelines: 'Fast opening hook in the first 2 seconds. On-screen captions for all spoken content. Brand outro card in the final 2 seconds.',
    requirements: 'MP4 (H.264), under 100MB, 30fps. Keep text inside the vertical safe zone (top 15% and bottom 20% are covered by platform UI). Provide a thumbnail frame separately.'
  },
  // ---- Offline & print ----
  'Offline Banner': {
    category: 'Offline & Print',
    dimensions: '10 x 3 feet (Horizontal landscape banner)',
    brandGuidelines: 'Extraordinarily high contrast colors. Large, display typography legible from 20 feet. Simple, high-fidelity logos on a solid background.',
    requirements: 'Asset files must be submitted in CMYK color format. Export resolution must be at least 300 DPI with a 0.5-inch bleed border. Embed vector graphic shapes.'
  },
  'Standee': {
    category: 'Offline & Print',
    dimensions: '6 x 3 feet (vertical roll-up standee)',
    brandGuidelines: 'Key message in the top third (eye level). Large typography, minimal body copy, strong single visual.',
    requirements: 'CMYK, 300 DPI, 0.5-inch bleed on all sides. Keep critical content 4 inches away from the bottom edge (roll-up mechanism). Deliver print-ready PDF plus source file.'
  },
  'Poster / Print': {
    category: 'Offline & Print',
    dimensions: 'A3 (297 x 420 mm) — confirm final size with requester',
    brandGuidelines: 'Follow brand print palette. Headline readable from 3 meters. Include QR code block if a link is part of the message.',
    requirements: 'CMYK, 300 DPI, 3mm bleed, print-ready PDF/X. Also export an A4 version and a screen-resolution JPG for digital sharing.'
  },
  'Wall Branding': {
    category: 'Offline & Print',
    dimensions: 'Site-specific — exact wall measurements will be shared in the request',
    brandGuidelines: 'Large-format brand storytelling. Account for viewing distance and physical obstructions (switches, doors, edges) noted in the measurements.',
    requirements: 'Vector artwork strongly preferred. CMYK, scale-proof at 1:10. Deliver print-ready file plus a mockup visual placed on the provided wall photo.'
  }
};
