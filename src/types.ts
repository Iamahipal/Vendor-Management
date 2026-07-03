export type Role = 'Internal' | 'Vendor';

export type AssetType = 'LinkedIn' | 'Emailer' | 'Desktop Pop-up' | 'Instagram' | 'Offline Banner';

export type TaskStatus = 'Assigned' | 'In Progress' | 'Delivered' | 'Approved' | 'Needs Revision';

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
  type: 'delivered' | 'cron_reminder' | 'system_template';
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

export interface DatabaseState {
  users: User[];
  vendors: Vendor[];
  tasks: Task[];
  deliverables: Deliverable[];
  logs: NotificationLog[];
  user?: User;
}

export interface AssetTemplate {
  dimensions: string;
  brandGuidelines: string;
  requirements: string;
}

export const ASSET_TEMPLATES: Record<AssetType, AssetTemplate> = {
  'LinkedIn': {
    dimensions: '1200 x 627 px (Standard landscape)',
    brandGuidelines: 'Use company standard dark blue (#0A66C2) and charcoal gray (#1D2226). High contrast typography using "Inter" or similar clean sans-serif. Place branding in top-left corners.',
    requirements: 'Must feature a prominent CTA ("Learn More" / "Register Now"), a clean background with 40% empty space, and the logo must have a safety margin of at least 32px.'
  },
  'Emailer': {
    dimensions: '600 px width (Fluid responsive height)',
    brandGuidelines: 'Light background colors ONLY. Text hierarchy: Headers in 24px bold, subheaders in 16px, body in 14px. Button color must be high-contrast accent.',
    requirements: 'Optimize for dark mode (no hardcoded pure-white images). Inline images must be less than 500KB. Ensure key information is in HTML text, not embedded inside graphics.'
  },
  'Desktop Pop-up': {
    dimensions: '800 x 500 px (Lightbox modal style)',
    brandGuidelines: 'Frosted glassmorphic borders with a deep overlay background (#000000B3). Modern, visual focus with a large display heading ("Space Grotesk"). Minimalist footer.',
    requirements: 'A functional "Close" button in the top-right corner is mandatory. Ensure the dismiss target is at least 44x44px. CTA must trigger immediately on click.'
  },
  'Instagram': {
    dimensions: '1080 x 1080 px (Square 1:1 format)',
    brandGuidelines: 'Bold, highly energetic color palette. Central, single-focus imagery. Modern editorial feel with elegant sans-serif headings. Minimal brand presence.',
    requirements: 'Observe the 20% text rule (text overlay must not dominate the square). All key content must sit within the 900x900px central safety zone.'
  },
  'Offline Banner': {
    dimensions: '10 x 3 feet (Horizontal landscape banner)',
    brandGuidelines: 'Extraordinarily high contrast colors. Large, display typography legible from 20 feet. Simple, high-fidelity logos on a solid background.',
    requirements: 'Asset files must be submitted in CMYK color format. Export resolution must be at least 300 DPI with a 0.5-inch bleed border. Embed vector graphic shapes.'
  }
};
