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

// The "Type of communication" from the Release Request Form. Channels that
// need a designed asset map to an AssetType (see CHANNEL_ASSET_TYPE).
export type CommsChannel =
  | 'Email'
  | 'MS Teams'
  | 'Sigma Notification'
  | 'SMS'
  | 'Wallpaper / Lockscreen'
  | 'Ticker'
  | 'Desktop Pop-up'
  | 'Survey'
  | 'Open Banner'
  | 'DMS-Sales Notification'
  | 'Bulletin';

export const COMMS_CHANNELS: CommsChannel[] = [
  'Email', 'MS Teams', 'Sigma Notification', 'SMS', 'Wallpaper / Lockscreen',
  'Ticker', 'Desktop Pop-up', 'Survey', 'Open Banner', 'DMS-Sales Notification', 'Bulletin'
];

// Fixed daily booking slots (from the IC calendar). Adjustable when the exact
// sheet arrives — one booking per (date, time, channel).
export const SLOT_TIMES = ['10:00', '11:00', '11:30', '12:00', '14:00', '15:00', '16:30', '17:00'];

// Channels that typically need a designed creative → default vendor asset type.
// Channels not listed here are text/config-only and need no creative.
export const CHANNEL_ASSET_TYPE: Partial<Record<CommsChannel, AssetType>> = {
  'Email': 'Emailer',
  'Desktop Pop-up': 'Desktop Pop-up',
  'Ticker': 'Ticker / Teams Notification',
  'MS Teams': 'Ticker / Teams Notification',
  'Wallpaper / Lockscreen': 'Desktop Wallpaper',
  'Open Banner': 'Offline Banner',
  'Bulletin': 'Poster / Print'
};

export type CommStatus = 'Booked' | 'In Design' | 'Ready' | 'Handed Off' | 'Released' | 'Cancelled';

export type Audience = 'All Employees' | 'Targeted';
export type CommLanguage = 'English' | 'Vernacular';

export interface Communication {
  Comm_ID: string;
  // Booking core
  Channel: CommsChannel;
  Release_Date: string;   // YYYY-MM-DD
  Release_Time: string;   // one of SLOT_TIMES (or custom)
  Department: string;     // requesting team
  Campaign_Name: string;
  Subject_Line: string;
  Comms_SPOC: string;     // IC owner handling it
  Business_SPOC: string;  // requester-side owner
  Audience: Audience;
  Language: CommLanguage;
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

export interface DatabaseState {
  users: User[];
  vendors: Vendor[];
  tasks: Task[];
  deliverables: Deliverable[];
  communications: Communication[];
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
