import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
  startServer,
  TestServer,
  daysFromNow,
  ADMIN,
  PIXEL_VENDOR,
  PRESS_VENDOR
} from './helpers';

// Black-box tests against the real HTTP server: each suite boots its own
// server process with a fresh seed database in a temp directory.

describe('authentication and error envelope', () => {
  let s: TestServer;
  before(async () => { s = await startServer(); });
  after(() => s.stop());

  it('rejects requests without the simulated-user header', async () => {
    const { status, json } = await s.api(null, 'GET', '/api/db');
    assert.equal(status, 401);
    assert.match(json.error, /Unauthorized/);
  });

  it('rejects requests with an unknown user id', async () => {
    const { status } = await s.api('u-nobody', 'GET', '/api/db');
    assert.equal(status, 401);
  });

  it('returns structured JSON 404 for unknown API routes', async () => {
    const { status, json } = await s.api(ADMIN, 'GET', '/api/no-such-route');
    assert.equal(status, 404);
    assert.match(json.error, /Not Found/);
  });

  it('returns structured JSON 400 for malformed JSON bodies', async () => {
    const res = await fetch(s.baseUrl + '/api/tasks', {
      method: 'POST',
      headers: { 'x-simulated-user-id': ADMIN, 'Content-Type': 'application/json' },
      body: '{not json'
    });
    assert.equal(res.status, 400);
    const json = await res.json() as { error: string };
    assert.match(json.error, /not valid JSON/);
  });
});

describe('row-level security on reads (/api/db)', () => {
  let s: TestServer;
  before(async () => { s = await startServer(); });
  after(() => s.stop());

  it('gives internal staff the full database', async () => {
    const { status, json } = await s.api(ADMIN, 'GET', '/api/db');
    assert.equal(status, 200);
    assert.equal(json.tasks.length, 4);
    // 3 external agencies + the seeded In-house Team
    assert.equal(json.vendors.length, 4);
    assert.equal(json.rlsSimulation.applied, false);
  });

  it('filters tasks and deliverables down to the vendor own agency', async () => {
    const { json } = await s.api(PIXEL_VENDOR, 'GET', '/api/db');
    assert.equal(json.rlsSimulation.applied, true);
    assert.deepEqual(
      json.tasks.map((t: any) => t.Task_ID).sort(),
      ['t-1', 't-2']
    );
    // d-2 belongs to t-1 (v-pixel); d-1 belongs to t-4 (v-modal)
    assert.deepEqual(json.deliverables.map((d: any) => d.Deliverable_ID), ['d-2']);
  });

  it('shows a vendor only their own vendor registry profile', async () => {
    const { json } = await s.api(PIXEL_VENDOR, 'GET', '/api/db');
    assert.deepEqual(json.vendors.map((v: any) => v.Vendor_ID), ['v-pixel']);
  });

  it('redacts other users email addresses for vendors', async () => {
    const { json } = await s.api(PIXEL_VENDOR, 'GET', '/api/db');
    for (const u of json.users) {
      if (u.User_ID === PIXEL_VENDOR) {
        assert.equal(u.Email, 'alex@pixelcraft.co');
      } else {
        assert.equal(u.Email, '');
      }
    }
  });

  it('scopes activity logs to the vendor own agency', async () => {
    const { json } = await s.api(PIXEL_VENDOR, 'GET', '/api/db');
    assert.ok(json.logs.length > 0, 'vendor should see own-agency logs');
    for (const log of json.logs) {
      assert.equal(log.meta.vendorId, 'v-pixel');
    }
  });
});

describe('task creation', () => {
  let s: TestServer;
  before(async () => { s = await startServer(); });
  after(() => s.stop());

  const validBrief = () => ({
    Title: 'Homepage Hero Refresh',
    Asset_Type: 'LinkedIn',
    Assigned_Vendor_ID: 'v-pixel',
    Due_Date: daysFromNow(7)
  });

  it('forbids vendors from creating briefs', async () => {
    const { status } = await s.api(PIXEL_VENDOR, 'POST', '/api/tasks', validBrief());
    assert.equal(status, 403);
  });

  it('rejects missing required fields', async () => {
    const { status, json } = await s.api(ADMIN, 'POST', '/api/tasks', { Title: 'No date' });
    assert.equal(status, 400);
    assert.match(json.error, /required fields/);
  });

  it('rejects unknown asset types', async () => {
    const { status } = await s.api(ADMIN, 'POST', '/api/tasks', { ...validBrief(), Asset_Type: 'Skywriting' });
    assert.equal(status, 400);
  });

  it('rejects malformed due dates', async () => {
    const { status } = await s.api(ADMIN, 'POST', '/api/tasks', { ...validBrief(), Due_Date: '07/20/2026' });
    assert.equal(status, 400);
  });

  it('rejects due dates in the past', async () => {
    const { status, json } = await s.api(ADMIN, 'POST', '/api/tasks', { ...validBrief(), Due_Date: '2020-01-01' });
    assert.equal(status, 400);
    assert.match(json.error, /past/);
  });

  it('rejects vendors that do not exist in the registry', async () => {
    const { status } = await s.api(ADMIN, 'POST', '/api/tasks', { ...validBrief(), Assigned_Vendor_ID: 'v-ghost' });
    assert.equal(status, 400);
  });

  it('creates a brief with template specs auto-populated', async () => {
    const { status, json } = await s.api(ADMIN, 'POST', '/api/tasks', validBrief());
    assert.equal(status, 201);
    assert.equal(json.task.Status, 'Assigned');
    assert.ok(json.task.Dimensions.includes('1200 x 627'), 'LinkedIn template dimensions applied');
    assert.ok(json.task.BrandGuidelines.length > 0);
    assert.ok(json.log.meta.taskId === json.task.Task_ID);
  });

  it('persists mutations to data.json on disk', async () => {
    const { json } = await s.api(ADMIN, 'POST', '/api/tasks', { ...validBrief(), Title: 'Persistence Probe' });
    const dbFile = path.join(s.dataDir, 'data.json');
    // Writes are debounced (~100ms), so poll briefly
    const deadline = Date.now() + 3000;
    for (;;) {
      if (fs.existsSync(dbFile)) {
        const onDisk = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
        if (onDisk.tasks.some((t: any) => t.Task_ID === json.task.Task_ID)) break;
      }
      assert.ok(Date.now() < deadline, 'data.json never captured the new task');
      await new Promise(r => setTimeout(r, 100));
    }
  });
});

describe('task status updates', () => {
  let s: TestServer;
  before(async () => { s = await startServer(); });
  after(() => s.stop());

  it('rejects invalid status values', async () => {
    const { status } = await s.api(ADMIN, 'POST', '/api/tasks/t-1/status', { status: 'Vaporized' });
    assert.equal(status, 400);
  });

  it('returns 404 for unknown tasks', async () => {
    const { status } = await s.api(ADMIN, 'POST', '/api/tasks/t-none/status', { status: 'Approved' });
    assert.equal(status, 404);
  });

  it('blocks vendors from touching another agency task', async () => {
    // t-1 belongs to v-pixel; press vendor must be rejected
    const { status } = await s.api(PRESS_VENDOR, 'POST', '/api/tasks/t-1/status', { status: 'In Progress' });
    assert.equal(status, 403);
  });

  it('blocks vendors from self-approving', async () => {
    const { status, json } = await s.api(PIXEL_VENDOR, 'POST', '/api/tasks/t-1/status', { status: 'Approved' });
    assert.equal(status, 403);
    assert.match(json.error, /reserved for internal/);
  });

  it('lets a vendor move their own work forward', async () => {
    const { status, json } = await s.api(PIXEL_VENDOR, 'POST', '/api/tasks/t-2/status', { status: 'In Progress' });
    assert.equal(status, 200);
    assert.equal(json.task.Status, 'In Progress');
  });

  it('lets internal staff set any valid status', async () => {
    const { status, json } = await s.api(ADMIN, 'POST', '/api/tasks/t-2/status', { status: 'Approved' });
    assert.equal(status, 200);
    assert.equal(json.task.Status, 'Approved');
  });
});

describe('deliverables and versioning', () => {
  let s: TestServer;
  before(async () => { s = await startServer(); });
  after(() => s.stop());

  const upload = (name: string) => ({
    Task_ID: 't-1',
    File_URL: 'https://example.com/' + name,
    File_Name: name
  });

  it('rejects submissions with missing fields', async () => {
    const { status } = await s.api(PIXEL_VENDOR, 'POST', '/api/deliverables', { Task_ID: 't-1' });
    assert.equal(status, 400);
  });

  it('returns 404 for a nonexistent parent task', async () => {
    const { status } = await s.api(PIXEL_VENDOR, 'POST', '/api/deliverables', { ...upload('x.png'), Task_ID: 't-none' });
    assert.equal(status, 404);
  });

  it('blocks vendors from submitting to another agency brief', async () => {
    const { status } = await s.api(PRESS_VENDOR, 'POST', '/api/deliverables', upload('sneaky.png'));
    assert.equal(status, 403);
  });

  it('increments the version past the highest existing one and auto-delivers the task', async () => {
    // t-1 already has d-2 at version 1 in the seed
    const first = await s.api(PIXEL_VENDOR, 'POST', '/api/deliverables', upload('draft_v2.png'));
    assert.equal(first.status, 201);
    assert.equal(first.json.deliverable.Version, 2);
    assert.equal(first.json.task.Status, 'Delivered');

    const second = await s.api(PIXEL_VENDOR, 'POST', '/api/deliverables', upload('draft_v3.png'));
    assert.equal(second.json.deliverable.Version, 3);
  });
});

describe('reviews and feedback threads', () => {
  let s: TestServer;
  before(async () => { s = await startServer(); });
  after(() => s.stop());

  it('forbids vendors from reviewing deliverables', async () => {
    const { status } = await s.api(PIXEL_VENDOR, 'POST', '/api/deliverables/d-2/review', { status: 'Approved' });
    assert.equal(status, 403);
  });

  it('rejects review decisions other than Approved/Rejected', async () => {
    const { status } = await s.api(ADMIN, 'POST', '/api/deliverables/d-2/review', { status: 'Meh' });
    assert.equal(status, 400);
  });

  it('returns 404 for unknown deliverables', async () => {
    const { status } = await s.api(ADMIN, 'POST', '/api/deliverables/d-none/review', { status: 'Approved' });
    assert.equal(status, 404);
  });

  it('rejecting with a comment sets Needs Revision and threads the comment', async () => {
    const { status, json } = await s.api(ADMIN, 'POST', '/api/deliverables/d-2/review', {
      status: 'Rejected',
      comment: 'Logo safety margin is too tight.'
    });
    assert.equal(status, 200);
    assert.equal(json.deliverable.Approval_Status, 'Rejected');
    assert.equal(json.task.Status, 'Needs Revision');
    const last = json.deliverable.Feedback_History.at(-1);
    assert.equal(last.comment, 'Logo safety margin is too tight.');
    assert.equal(last.source, 'Human');
  });

  it('approving sets the task to Approved', async () => {
    const { json } = await s.api(ADMIN, 'POST', '/api/deliverables/d-2/review', { status: 'Approved' });
    assert.equal(json.deliverable.Approval_Status, 'Approved');
    assert.equal(json.task.Status, 'Approved');
  });

  it('rejects empty feedback comments', async () => {
    const { status } = await s.api(PIXEL_VENDOR, 'POST', '/api/deliverables/d-2/feedback', { comment: '   ' });
    assert.equal(status, 400);
  });

  it('blocks vendors from commenting on another agency deliverable', async () => {
    const { status } = await s.api(PRESS_VENDOR, 'POST', '/api/deliverables/d-2/feedback', { comment: 'hello' });
    assert.equal(status, 403);
  });

  it('lets the owning vendor reply in the thread', async () => {
    const { status, json } = await s.api(PIXEL_VENDOR, 'POST', '/api/deliverables/d-2/feedback', { comment: 'On it — fix coming today.' });
    assert.equal(status, 200);
    assert.equal(json.deliverable.Feedback_History.at(-1).reviewer, 'Alex Rivero');
  });
});

describe('live events (cursor-based, RLS-scoped)', () => {
  let s: TestServer;
  before(async () => { s = await startServer(); });
  after(() => s.stop());

  it('bootstrap call returns the current cursor without replaying history', async () => {
    const { status, json } = await s.api(ADMIN, 'GET', '/api/live-events');
    assert.equal(status, 200);
    assert.equal(typeof json.cursor, 'number');
    assert.deepEqual(json.events, []);
  });

  it("rejects a non-numeric 'since' cursor", async () => {
    const { status } = await s.api(ADMIN, 'GET', '/api/live-events?since=abc');
    assert.equal(status, 400);
  });

  it('delivers each event to internal staff and the scoped vendor, but not other vendors', async () => {
    const boot = await s.api(ADMIN, 'GET', '/api/live-events');
    const cursor = boot.json.cursor;

    await s.api(ADMIN, 'POST', '/api/tasks', {
      Title: 'Scoped Event Probe',
      Asset_Type: 'Emailer',
      Assigned_Vendor_ID: 'v-pixel',
      Due_Date: daysFromNow(10)
    });

    const admin = await s.api(ADMIN, 'GET', `/api/live-events?since=${cursor}`);
    const pixel = await s.api(PIXEL_VENDOR, 'GET', `/api/live-events?since=${cursor}`);
    const press = await s.api(PRESS_VENDOR, 'GET', `/api/live-events?since=${cursor}`);

    assert.equal(admin.json.events.length, 1);
    assert.equal(pixel.json.events.length, 1);
    assert.match(pixel.json.events[0].message, /Scoped Event Probe/);
    assert.equal(press.json.events.length, 0);

    // Same client polling again from the advanced cursor gets nothing new
    const again = await s.api(PIXEL_VENDOR, 'GET', `/api/live-events?since=${pixel.json.cursor}`);
    assert.equal(again.json.events.length, 0);
  });
});

describe('cron reminder and overdue escalation', () => {
  let s: TestServer;
  before(async () => { s = await startServer(); });
  after(() => s.stop());

  it('is restricted to internal coordinators', async () => {
    const { status } = await s.api(PIXEL_VENDOR, 'POST', '/api/simulate-cron', {});
    assert.equal(status, 403);
  });

  it('rejects an invalid simulatedNow override', async () => {
    const { status } = await s.api(ADMIN, 'POST', '/api/simulate-cron', { simulatedNow: 'yesterday-ish' });
    assert.equal(status, 400);
  });

  it('fires a due-soon reminder exactly once per task', async () => {
    const { json: created } = await s.api(ADMIN, 'POST', '/api/tasks', {
      Title: 'Due Soon Probe',
      Asset_Type: 'LinkedIn',
      Assigned_Vendor_ID: 'v-pixel',
      Due_Date: daysFromNow(1)
    });
    const taskId = created.task.Task_ID;

    const first = await s.api(ADMIN, 'POST', '/api/simulate-cron', {});
    const mine = first.json.reminders.filter((r: any) => r.meta.taskId === taskId);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].type, 'cron_reminder');

    const second = await s.api(ADMIN, 'POST', '/api/simulate-cron', {});
    assert.equal(second.json.reminders.filter((r: any) => r.meta.taskId === taskId).length, 0);
  });

  it('escalates overdue tasks at most once per 24h, then re-escalates', async () => {
    const { json: created } = await s.api(ADMIN, 'POST', '/api/tasks', {
      Title: 'Overdue Probe',
      Asset_Type: 'Offline Banner',
      Assigned_Vendor_ID: 'v-press',
      Due_Date: daysFromNow(1)
    });
    const taskId = created.task.Task_ID;
    const threeDaysOut = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const after25h = new Date(new Date(threeDaysOut).getTime() + 25 * 60 * 60 * 1000).toISOString();

    const first = await s.api(ADMIN, 'POST', '/api/simulate-cron', { simulatedNow: threeDaysOut });
    const escalations = first.json.reminders.filter((r: any) => r.meta.taskId === taskId);
    assert.equal(escalations.length, 1);
    assert.equal(escalations[0].type, 'cron_overdue');

    // Same scan clock again → deduped
    const repeat = await s.api(ADMIN, 'POST', '/api/simulate-cron', { simulatedNow: threeDaysOut });
    assert.equal(repeat.json.reminders.filter((r: any) => r.meta.taskId === taskId).length, 0);

    // More than 24h later → escalates again
    const later = await s.api(ADMIN, 'POST', '/api/simulate-cron', { simulatedNow: after25h });
    const reEscalations = later.json.reminders.filter((r: any) => r.meta.taskId === taskId);
    assert.equal(reEscalations.length, 1);
    assert.equal(reEscalations[0].type, 'cron_overdue');
  });
});

describe('AI critique endpoint (no providers configured)', () => {
  let s: TestServer;
  before(async () => { s = await startServer(); });
  after(() => s.stop());

  it('reports an empty provider list', async () => {
    const { json } = await s.api(ADMIN, 'GET', '/api/db');
    assert.deepEqual(json.aiProviders, []);
  });

  it('requires a deliverableId', async () => {
    const { status } = await s.api(PIXEL_VENDOR, 'POST', '/api/gemini/critique', {});
    assert.equal(status, 400);
  });

  it('returns 404 for unknown deliverables', async () => {
    const { status } = await s.api(ADMIN, 'POST', '/api/gemini/critique', { deliverableId: 'd-none' });
    assert.equal(status, 404);
  });

  it('blocks vendors from critiquing another agency deliverable', async () => {
    // d-2 belongs to t-1 (v-pixel); press vendor must be rejected
    const { status } = await s.api(PRESS_VENDOR, 'POST', '/api/gemini/critique', { deliverableId: 'd-2' });
    assert.equal(status, 403);
  });

  it('falls back to the manual checklist and never changes the task status', async () => {
    const { status, json } = await s.api(PIXEL_VENDOR, 'POST', '/api/gemini/critique', {
      deliverableId: 'd-2',
      fileSummaryText: 'First draft of the LinkedIn banner.'
    });
    assert.equal(status, 200);
    assert.match(json.critique, /Manual Review Needed/);
    // t-1 seeds as 'In Progress' — the advisory critique must not move it
    assert.equal(json.task.Status, 'In Progress');
    const last = json.deliverable.Feedback_History.at(-1);
    assert.equal(last.source, 'AI');
  });
});

// ---------------------------------------------------------------
// Long-term history & metrics foundations
// ---------------------------------------------------------------
describe('history & metrics foundations', () => {
  let s: TestServer;
  before(async () => { s = await startServer(); });
  after(async () => { await s.stop(); });

  it('seeds the In-house Team vendor for Snapcoms work', async () => {
    const { json } = await s.api(ADMIN, 'GET', '/api/db');
    const inhouse = json.vendors.find((v: any) => v.Vendor_ID === 'v-inhouse');
    assert.ok(inhouse, 'v-inhouse must exist');
    assert.match(inhouse.Company_Name, /In-house/);
  });

  it('cancelling keeps the task in the database as Cancelled', async () => {
    const del = await s.api(ADMIN, 'DELETE', '/api/tasks/t-2');
    assert.equal(del.status, 200);
    const { json } = await s.api(ADMIN, 'GET', '/api/db');
    const t2 = json.tasks.find((t: any) => t.Task_ID === 't-2');
    assert.ok(t2, 'cancelled task must remain for history');
    assert.equal(t2.Status, 'Cancelled');
    // double-cancel is rejected
    const again = await s.api(ADMIN, 'DELETE', '/api/tasks/t-2');
    assert.equal(again.status, 400);
  });

  it('stamps Approved_At when a deliverable is approved', async () => {
    const { status, json } = await s.api(ADMIN, 'POST', '/api/deliverables/d-2/review', {
      status: 'Approved', comment: 'Great work'
    });
    assert.equal(status, 200);
    assert.ok(json.task.Approved_At, 'Approved_At must be set');
    assert.equal(json.task.Status, 'Approved');
  });

  it('accepts new asset types from the expanded catalogue', async () => {
    const { status, json } = await s.api(ADMIN, 'POST', '/api/tasks', {
      Title: 'Republic Day lock screen',
      Asset_Type: 'Lock Screen Wallpaper',
      Assigned_Vendor_ID: 'v-inhouse',
      Due_Date: '2099-01-20'
    });
    assert.equal(status, 201);
    assert.match(json.task.Requirements, /lower-center third/);
  });

  it('brief organizer requires internal role and raw text', async () => {
    const vendor = await s.api(PIXEL_VENDOR, 'POST', '/api/ai/organize-brief', { rawText: 'some long enough requirement text' });
    assert.equal(vendor.status, 403);
    const short = await s.api(ADMIN, 'POST', '/api/ai/organize-brief', { rawText: 'hi' });
    assert.equal(short.status, 400);
    // with no AI keys configured the organizer reports 502, never a crash
    const noAi = await s.api(ADMIN, 'POST', '/api/ai/organize-brief', { rawText: 'We need a Diwali emailer for all employees by 2099-10-20 with CEO message.' });
    assert.equal(noAi.status, 502);
  });
});
