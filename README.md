# CreativeFlow Hub — Vendor Management Dashboard

A collaborative creative-asset pipeline for managing external vendor agencies: internal staff create creative briefs, vendors submit deliverables, and both sides iterate through review/feedback cycles — with simulated row-level security (RLS), live event notifications, automated due-date reminders, and an optional AI art director.

**▶ Live demo:** https://iamahipal.github.io/Vendor-Management/ — an interactive static build deployed automatically to GitHub Pages on every push to `main`. The entire API runs in your browser (data persists in localStorage; use "Reset Demo Data" to start over). AI critiques are offline in the demo since a public page cannot hold API keys — run locally to enable them.

## Features

- **Internal dashboard** — Kanban board of creative briefs across five statuses, quick stats, filters by asset type and vendor, and a review modal for approving/rejecting deliverables with threaded feedback.
- **Vendor portal** — RLS-isolated view showing only the vendor's own briefs, a simulated file uploader with versioned deliverables, feedback threads, and an on-demand AI critique.
- **Row-level security simulation** — the server filters tasks, deliverables, vendors, logs, and live events per role. Vendors can never read (or act on) another agency's data; approval decisions are reserved for internal staff.
- **Live events** — cursor-based polling stream (simulated WebSockets). Every open client receives every event scoped to its role.
- **Automation** — a simulated cron worker that scans for briefs due within 48 hours and dispatches reminder notifications.
- **AI Art Director** — reviews a deliverable against the brief's dimensions, brand guidelines, and requirements. Works with **NVIDIA Build, OpenRouter, or Gemini** (any one key is enough) and automatically fails over between configured providers; falls back to a manual checklist when none are configured or all are down.

## Architecture

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 6 + Tailwind CSS 4, `lucide-react` icons, `motion` animations |
| Backend | Express (TypeScript, run with `tsx` in dev, bundled with esbuild for prod) |
| Storage | JSON file (`data.json`) held in memory and persisted with debounced atomic writes |
| AI | Multi-provider with auto-failover: NVIDIA Build / OpenRouter (OpenAI-compatible, via fetch) and Gemini (`@google/genai`) |

The Express server owns both the API (`/api/*`) and the frontend: in development it mounts Vite middleware (HMR included); in production it serves the built `dist/` folder.

## Run locally

**Prerequisites:** Node.js 20+

```bash
npm install
npm run dev          # http://localhost:3000
```

## AI Art Director setup (free)

The AI critique feature works with **any one** of three providers — configure whichever you have in `.env.local` (copy `.env.example` to get started):

```
NVIDIA_API_KEY=nvapi-...        # free credits at https://build.nvidia.com
OPENROUTER_API_KEY=sk-or-...    # free-tier models at https://openrouter.ai/keys
GEMINI_API_KEY=...              # free tier at https://aistudio.google.com/apikey
```

**Reliability:** if you configure more than one key, the server tries them in order (`AI_PROVIDER_ORDER`, default `nvidia,openrouter,gemini`) with a 45-second timeout each — when one provider errors out or hits a rate limit, the next takes over automatically. If every provider fails, vendors get a manual review checklist instead of an error, so the app never breaks.

The System Control Panel (Automation Work tab) shows which providers are detected. Without any key the app still fully works; only AI critiques are replaced by the checklist.

## Production build

```bash
npm run build        # builds the SPA and bundles the server to dist/server.cjs
NODE_ENV=production npm start
```

Production installs only need runtime dependencies (`express`, `@google/genai`, `dotenv`) — Vite and React are build-time only.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server (Express + Vite middleware, HMR) |
| `npm run build` | Build frontend and bundle server into `dist/` |
| `npm start` | Run the production bundle |
| `npm run lint` | Typecheck (`tsc --noEmit`, strict mode) |
| `npm run clean` | Remove build output |

## API overview

All API routes require the `x-simulated-user-id` header (the app's persona switcher supplies it).

| Endpoint | Method | Access | Description |
|---|---|---|---|
| `/api/db` | GET | All | Full RLS-filtered relational state |
| `/api/tasks` | POST | Internal | Create a brief (auto-populates templates per asset type) |
| `/api/tasks/:id/status` | POST | Owner/Internal | Update task status (vendors limited to In Progress / Delivered) |
| `/api/deliverables` | POST | Owner/Internal | Submit a versioned deliverable |
| `/api/deliverables/:id/review` | POST | Internal | Approve or reject a deliverable |
| `/api/deliverables/:id/feedback` | POST | Owner/Internal | Post a threaded feedback comment |
| `/api/live-events?since=N` | GET | All (RLS-scoped) | Cursor-based live event stream |
| `/api/simulate-cron` | POST | Internal | Run the 48-hour due-date reminder scan |
| `/api/gemini/critique` | POST | Owner/Internal | Request an AI art-director review |

## Demo data

The database seeds four personas (one internal admin, three vendor contacts across three agencies) and a handful of in-flight briefs. Delete `data.json` to reset to the seed state.
