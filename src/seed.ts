import { DatabaseState } from './types';

// Seed data shared by the server (data.json bootstrap) and the static demo
// mode (browser localStorage bootstrap).
export const DEFAULT_DB: DatabaseState = {
  vendors: [
    {
      Vendor_ID: 'v-inhouse',
      Company_Name: 'In-house Team',
      Specialty: 'Deployed internally via Snapcoms (wallpapers, tickers, popups)',
      Logo: ''
    },
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
      meta: { taskId: 't-4', vendorId: 'v-modal', assetType: 'Desktop Pop-up' }
    },
    {
      id: 'l-2',
      timestamp: '2026-06-29T14:32:00.000Z',
      type: 'delivered',
      message: 'Deliverable welcome_modal_v1.png uploaded by ModalUX Interactive. Alerting internal PFL staff.',
      meta: { taskId: 't-4', vendorId: 'v-modal', vendorName: 'ModalUX Interactive' }
    },
    {
      id: 'l-3',
      timestamp: '2026-07-01T12:05:00.000Z',
      type: 'system_template',
      message: 'LinkedIn Campaign task created. Applied automated social advertising layout blueprints.',
      meta: { taskId: 't-1', vendorId: 'v-pixel', assetType: 'LinkedIn' }
    }
  ]
};
