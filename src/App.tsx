import { useEffect, useState, useRef } from 'react';
import { DatabaseState, User, TaskStatus, AssetType } from './types';
import { DEMO_MODE, demoFetch, resetDemoDb } from './demoApi';
import VendorDashboard from './components/VendorDashboard';
import HomeScreen, { HomeView } from './components/HomeScreen';
import CalendarPanel from './components/CalendarPanel';
import ReleaseRequestForm from './components/ReleaseRequestForm';
import {
  RefreshCw,
  X,
  Bell,
  Sparkles,
  Home as HomeIcon,
  Compass
} from 'lucide-react';

interface AlertNotification {
  id: string;
  timestamp: string;
  title: string;
  message: string;
  taskId: string;
  vendorName: string;
}

// In static demo mode (GitHub Pages) the whole API runs in the browser;
// otherwise talk to the Express server as usual.
const apiFetch: typeof fetch = DEMO_MODE ? (demoFetch as typeof fetch) : (...args) => fetch(...args);

export default function App() {
  const [dbState, setDbState] = useState<DatabaseState & { rlsSimulation?: any; aiProviders?: string[] }>({
    users: [],
    vendors: [],
    tasks: [],
    deliverables: [],
    communications: [],
    placements: [],
    webinars: [],
    logs: []
  });

  // active selected user persona (Sarah Jenkins is default internal staff admin)
  const [selectedUserId, setSelectedUserId] = useState<string>('u-pfl-admin');
  const [loading, setLoading] = useState(true);

  // Which of the three areas is open (home = the tile picker)
  const [view, setView] = useState<'home' | HomeView>('home');

  // Live Toast notifications queue
  const [alerts, setAlerts] = useState<AlertNotification[]>([]);

  // Ref to track latest user ID in closures
  const selectedUserRef = useRef(selectedUserId);

  useEffect(() => {
    selectedUserRef.current = selectedUserId;
  }, [selectedUserId]);

  // Monotonic counter so a slow response for a previous user can never
  // overwrite the state of the currently selected user
  const fetchSeqRef = useRef(0);

  // Cursor into the server-side live event stream (null until bootstrapped)
  const eventCursorRef = useRef<number | null>(null);

  // Surface an error as a toast notification (auto-dismissed)
  const pushErrorAlert = (message: string) => {
    const alert: AlertNotification = {
      id: 'err-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      timestamp: new Date().toISOString(),
      title: '⚠️ Action Failed',
      message,
      taskId: '—',
      vendorName: 'System'
    };
    setAlerts(prev => [...prev, alert]);
    setTimeout(() => {
      setAlerts(prev => prev.filter(a => a.id !== alert.id));
    }, 6000);
  };

  // Fetch complete dataset with security context
  const fetchDb = async () => {
    const seq = ++fetchSeqRef.current;
    try {
      const res = await apiFetch('/api/db', {
        headers: {
          'x-simulated-user-id': selectedUserRef.current
        }
      });
      if (res.ok) {
        const data = await res.json();
        // Discard stale responses that finished after a newer request started
        if (seq === fetchSeqRef.current) {
          setDbState(data);
        }
      }
    } catch (e) {
      console.error('Error fetching relational database:', e);
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  };

  // Re-fetch database whenever simulated user changes to trigger server-side RLS filtering
  useEffect(() => {
    setLoading(true);
    fetchDb();
  }, [selectedUserId]);

  // Short polling loop for simulated WebSocket events (cursor-based, so
  // multiple open clients each receive every event exactly once)
  useEffect(() => {
    let cancelled = false;

    const checkLiveEvents = async () => {
      // Skip polling while the tab is hidden to save cycles
      if (document.hidden) return;
      try {
        const cursor = eventCursorRef.current;
        const url = cursor === null ? '/api/live-events' : `/api/live-events?since=${cursor}`;
        const res = await apiFetch(url, {
          headers: { 'x-simulated-user-id': selectedUserRef.current }
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        eventCursorRef.current = data.cursor ?? eventCursorRef.current;
        if (data.events && data.events.length > 0) {
          // Add new events to active alerts toast queue
          setAlerts(prev => [...prev, ...data.events]);
          // Refresh database to show new uploads instantly
          fetchDb();

          // Auto-dismiss toasts after 5 seconds
          data.events.forEach((event: AlertNotification) => {
            setTimeout(() => {
              setAlerts(prev => prev.filter(a => a.id !== event.id));
            }, 5000);
          });
        }
      } catch (err) {
        console.error('Error checking live events:', err);
      }
    };

    const interval = setInterval(checkLiveEvents, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // API Call: Add new creative brief
  const handleAddTask = async (taskData: {
    Title: string;
    Asset_Type: AssetType;
    Assigned_Vendor_ID: string;
    Due_Date: string;
    Custom_Dimensions: string;
    Custom_Guidelines: string;
    Custom_Requirements: string;
  }) => {
    try {
      const res = await apiFetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-simulated-user-id': selectedUserId
        },
        body: JSON.stringify(taskData)
      });
      if (res.ok) {
        await fetchDb();
      } else {
        const err = await res.json();
        pushErrorAlert(err.error || 'Failed to create task brief.');
      }
    } catch (e) {
      console.error(e);
      pushErrorAlert('Network error: failed to create task brief.');
    }
  };

  // API Call: Change Task Status
  const handleUpdateTaskStatus = async (taskId: string, status: TaskStatus) => {
    try {
      const res = await apiFetch(`/api/tasks/${taskId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-simulated-user-id': selectedUserId
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        await fetchDb();
      } else {
        const err = await res.json();
        pushErrorAlert(err.error || 'Failed to update task status.');
      }
    } catch (e) {
      console.error(e);
      pushErrorAlert('Network error: failed to update task status.');
    }
  };

  // API Call: Submit mockup file
  const handleSubmitDeliverable = async (Task_ID: string, File_URL: string, File_Name: string) => {
    try {
      const res = await apiFetch('/api/deliverables', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-simulated-user-id': selectedUserId
        },
        body: JSON.stringify({ Task_ID, File_URL, File_Name })
      });
      if (res.ok) {
        await fetchDb();
      } else {
        const err = await res.json();
        pushErrorAlert(err.error || 'Failed to submit deliverable.');
      }
    } catch (e) {
      console.error(e);
      pushErrorAlert('Network error: failed to submit deliverable.');
    }
  };

  // API Call: Approve or Reject draft with comment
  const handleReviewDeliverable = async (deliverableId: string, status: 'Approved' | 'Rejected', comment: string) => {
    try {
      const res = await apiFetch(`/api/deliverables/${deliverableId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-simulated-user-id': selectedUserId
        },
        body: JSON.stringify({ status, comment })
      });
      if (res.ok) {
        await fetchDb();
      } else {
        const err = await res.json();
        pushErrorAlert(err.error || 'Failed to review deliverable.');
      }
    } catch (e) {
      console.error(e);
      pushErrorAlert('Network error: failed to review deliverable.');
    }
  };

  // Generic small helper for JSON calls that just need success/failure + refresh
  const apiAction = async (path: string, method: string, body?: unknown, failMsg = 'Action failed.'): Promise<boolean> => {
    try {
      const res = await apiFetch(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-simulated-user-id': selectedUserId
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      if (res.ok) {
        await fetchDb();
        return true;
      }
      const err = await res.json();
      pushErrorAlert(err.error || failMsg);
      return false;
    } catch (e) {
      console.error(e);
      pushErrorAlert('Network error: ' + failMsg);
      return false;
    }
  };

  // API Call: Post a question/note on the request itself
  const handlePostTaskComment = (taskId: string, comment: string) =>
    apiAction(`/api/tasks/${taskId}/comments`, 'POST', { comment }, 'could not send your note.');

  // API Call: Edit a request (internal)
  const handleEditTask = (taskId: string, fields: Record<string, string>) =>
    apiAction(`/api/tasks/${taskId}`, 'PATCH', fields, 'could not save changes.');

  // API Call: Cancel & remove a request (internal)
  const handleDeleteTask = (taskId: string) =>
    apiAction(`/api/tasks/${taskId}`, 'DELETE', undefined, 'could not cancel the request.');

  // API Call: Add a vendor with contact person (internal)
  const handleAddVendor = (fields: Record<string, string>) =>
    apiAction('/api/vendors', 'POST', fields, 'could not add the vendor.');

  // API Call: Edit a vendor / contact person (internal)
  const handleEditVendor = (vendorId: string, fields: Record<string, string>) =>
    apiAction(`/api/vendors/${vendorId}`, 'PATCH', fields, 'could not save vendor details.');

  // API Call: AI organizes raw requirement text into a structured brief draft
  const handleOrganizeBrief = async (rawText: string) => {
    try {
      const res = await apiFetch('/api/ai/organize-brief', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-simulated-user-id': selectedUserId
        },
        body: JSON.stringify({ rawText })
      });
      const data = await res.json();
      if (res.ok) return data.draft;
      pushErrorAlert(data.error || 'AI could not organize the text.');
      return null;
    } catch (e) {
      console.error(e);
      pushErrorAlert('Network error: AI brief organizer unavailable.');
      return null;
    }
  };

  // Calendar / release pipeline actions (return the updated communication or null)
  const commAction = async (path: string, method: string, body?: unknown, failMsg = 'Action failed.'): Promise<any | null> => {
    try {
      const res = await apiFetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-simulated-user-id': selectedUserId },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await fetchDb();
        return data;
      }
      pushErrorAlert(data.error || failMsg);
      return null;
    } catch (e) {
      console.error(e);
      pushErrorAlert('Network error: ' + failMsg);
      return null;
    }
  };

  const handleBookSlot = (fields: Record<string, unknown>) =>
    commAction('/api/communications', 'POST', fields, 'could not book the slot.').then(d => !!d);
  const handleEditBooking = (id: string, fields: Record<string, unknown>) =>
    commAction(`/api/communications/${id}`, 'PATCH', fields, 'could not save the booking.').then(d => !!d);
  const handleCancelBooking = (id: string) =>
    commAction(`/api/communications/${id}`, 'DELETE', undefined, 'could not cancel the booking.').then(d => !!d);
  const handleCreateDesignTask = (id: string, vendorId: string) =>
    commAction(`/api/communications/${id}/create-task`, 'POST', { Assigned_Vendor_ID: vendorId }, 'could not create the design task.').then(d => !!d);
  const handleMarkReady = (id: string, creativeLink?: string) =>
    commAction(`/api/communications/${id}/ready`, 'POST', { Creative_Link: creativeLink }, 'could not mark ready.').then(d => !!d);
  const handleHandoff = (id: string, fields: Record<string, unknown>) =>
    commAction(`/api/communications/${id}/handoff`, 'POST', fields, 'could not hand off the release.').then(d => !!d);
  const handleRelease = (id: string) =>
    commAction(`/api/communications/${id}/release`, 'POST', undefined, 'could not mark released.').then(d => !!d);

  // Release Request form: book the slot then immediately hand it off for release
  const handleCreateReleaseRequest = async (fields: Record<string, unknown>) => {
    const booked = await commAction('/api/communications', 'POST', fields, 'could not save the release request.');
    if (!booked?.communication) return false;
    const id = booked.communication.Comm_ID;
    const handed = await commAction(`/api/communications/${id}/handoff`, 'POST', {
      Sender_ID: fields.Sender_ID, Creative_Link: fields.Creative_Link,
      CTA_Text: fields.CTA_Text, CTA_Link: fields.CTA_Link,
    }, 'saved, but could not hand it off.');
    return !!handed;
  };

  // Weekly placements (Wallpaper / Lockscreen / banners)
  const handleAddPlacement = (fields: Record<string, unknown>) =>
    commAction('/api/placements', 'POST', fields, 'could not book the placement.').then(d => !!d);
  const handleEditPlacement = (id: string, fields: Record<string, unknown>) =>
    commAction(`/api/placements/${id}`, 'PATCH', fields, 'could not save the placement.').then(d => !!d);
  const handleDeletePlacement = (id: string) =>
    commAction(`/api/placements/${id}`, 'DELETE', undefined, 'could not remove the placement.').then(d => !!d);

  // Webinars
  const handleAddWebinar = (fields: Record<string, unknown>) =>
    commAction('/api/webinars', 'POST', fields, 'could not schedule the webinar.').then(d => !!d);
  const handleDeleteWebinar = (id: string) =>
    commAction(`/api/webinars/${id}`, 'DELETE', undefined, 'could not remove the webinar.').then(d => !!d);

  // API Call: Post back-and-forth feedback comment on a deliverable
  const handlePostFeedback = async (deliverableId: string, comment: string) => {
    try {
      const res = await apiFetch(`/api/deliverables/${deliverableId}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-simulated-user-id': selectedUserId
        },
        body: JSON.stringify({ comment })
      });
      if (res.ok) {
        await fetchDb();
      } else {
        const err = await res.json();
        pushErrorAlert(err.error || 'Failed to post feedback comment.');
      }
    } catch (e) {
      console.error(e);
      pushErrorAlert('Network error: failed to post feedback comment.');
    }
  };

  // API Call: Request Gemini creative feedback and critique
  const handleRequestAICritique = async (deliverableId: string, summary: string): Promise<string> => {
    try {
      const res = await apiFetch('/api/gemini/critique', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-simulated-user-id': selectedUserId
        },
        body: JSON.stringify({ deliverableId, fileSummaryText: summary })
      });
      if (res.ok) {
        const data = await res.json();
        await fetchDb();
        return data.critique;
      }
      return 'API Error: Feedback offline.';
    } catch (e) {
      console.error(e);
      return 'Connection Error: Offline critique.';
    }
  };

  // Dismiss a live alert notification toast
  const handleDismissAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const currentUser = (dbState.users || []).find(u => u.User_ID === selectedUserId);

  // Bookings landing in the current Mon–Sun week (home tile metric)
  const _now = new Date();
  const _weekStart = new Date(_now);
  _weekStart.setDate(_now.getDate() - ((_now.getDay() + 6) % 7));
  const _weekEnd = new Date(_weekStart);
  _weekEnd.setDate(_weekStart.getDate() + 6);
  const wkStart = _weekStart.toISOString().slice(0, 10);
  const wkEnd = _weekEnd.toISOString().slice(0, 10);
  const bookedThisWeekCount = (dbState.communications || [])
    .filter(c => c.Status !== 'Cancelled' && c.Release_Date >= wkStart && c.Release_Date <= wkEnd).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col relative overflow-hidden font-sans">
      
      {/* Floating real-time popup notification toasts (Simulated WebSockets) */}
      <div className="fixed top-4 right-4 z-50 space-y-3 w-full max-w-sm pointer-events-none">
        {alerts.map(alert => (
          <div
            key={alert.id}
            className="pointer-events-auto bg-white border border-emerald-300 shadow-xl p-4 rounded-xl flex items-start gap-3 animate-slide-in"
          >
            <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-600 shrink-0">
              <Bell className="h-4 w-4" />
            </div>
            <div className="flex-1 text-xs">
              <div className="flex justify-between items-start">
                <h4 className="font-bold text-slate-900 text-sm">{alert.title}</h4>
                <button
                  onClick={() => handleDismissAlert(alert.id)}
                  className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-slate-600 mt-1 leading-relaxed">{alert.message}</p>
              <div className="flex gap-2 text-slate-400 font-mono text-[10px] mt-1.5 pt-1.5 border-t border-slate-100">
                <span>By: {alert.vendorName}</span>
                <span>•</span>
                <span>ID: {alert.taskId}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Global Application Header bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4 shadow-xs">

        {/* Title branding logo — click to go home */}
        <div className="flex items-center gap-3">
          <button onClick={() => setView('home')} aria-label="Home"
            className="h-9 w-9 bg-slate-900 rounded-lg flex items-center justify-center shadow-xs cursor-pointer">
            <Compass className="h-5 w-5 text-white" />
          </button>
          <div>
            <h1 className="font-sans font-bold text-base tracking-tight text-slate-900">
              CreativeFlow Hub
            </h1>
            <p className="text-xs text-slate-500 font-medium">Bajaj Finance · Internal Communication</p>
          </div>
        </div>

        {view !== 'home' && (
          <button onClick={() => setView('home')}
            className="py-2 px-4 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer">
            <HomeIcon className="h-4 w-4" />
            Home
          </button>
        )}
      </header>

      {/* Main Container Wrapper */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6 pb-24">

        {/* Static demo notice (GitHub Pages build) */}
        {DEMO_MODE && (
          <div className="p-3 rounded-xl border border-violet-200 bg-violet-50 text-violet-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs shadow-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-600 shrink-0" />
              <span>
                <span className="font-bold">Interactive demo</span> — everything runs in your browser and is saved on this device. Try booking slots, submitting a release request, and briefing vendors.
              </span>
            </div>
            <button
              onClick={() => { resetDemoDb(); window.location.reload(); }}
              className="self-start sm:self-auto shrink-0 px-3 py-1.5 bg-white border border-violet-300 hover:bg-violet-100 text-violet-800 font-bold rounded-lg text-[11px] transition-all cursor-pointer"
            >
              Reset Demo Data
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <RefreshCw className="h-6 w-6 text-slate-500 animate-spin" />
            <span className="text-sm text-slate-400">Loading...</span>
          </div>
        ) : view === 'home' ? (
          <HomeScreen
            userName={currentUser?.Name?.split(' ')[0]}
            counts={{
              openRequests: (dbState.communications || []).filter(c => c.Status === 'Handed Off').length,
              bookedThisWeek: bookedThisWeekCount,
              activeTasks: (dbState.tasks || []).filter(t => t.Status !== 'Cancelled' && t.Status !== 'Approved').length,
            }}
            onOpen={setView}
          />
        ) : view === 'release' ? (
          <ReleaseRequestForm
            communications={dbState.communications || []}
            onSubmit={handleCreateReleaseRequest}
            onRelease={handleRelease}
          />
        ) : view === 'calendar' ? (
          <CalendarPanel
            communications={dbState.communications || []}
            placements={dbState.placements || []}
            vendors={dbState.vendors || []}
            tasks={dbState.tasks || []}
            onBook={handleBookSlot}
            onEdit={handleEditBooking}
            onCancel={handleCancelBooking}
            onCreateTask={handleCreateDesignTask}
            onMarkReady={handleMarkReady}
            onHandoff={handleHandoff}
            onOpenTask={() => setView('vendor')}
            onAddPlacement={handleAddPlacement}
            onEditPlacement={handleEditPlacement}
            onDeletePlacement={handleDeletePlacement}
          />
        ) : (
          <VendorDashboard
            dbState={dbState}
            onAddTask={handleAddTask}
            onReviewDeliverable={handleReviewDeliverable}
            onUpdateTaskStatus={handleUpdateTaskStatus}
            onPostFeedback={handlePostFeedback}
            onPostTaskComment={handlePostTaskComment}
            onEditTask={handleEditTask}
            onDeleteTask={handleDeleteTask}
            onAddVendor={handleAddVendor}
            onEditVendor={handleEditVendor}
            onOrganizeBrief={handleOrganizeBrief}
          />
        )}
      </main>

      {/* Global Footer */}
      <footer className="border-t border-slate-200 bg-slate-100 p-4 text-center text-xs text-slate-500">
        CreativeFlow Hub — design requests, reviews and reminders in one place. Reminders are sent automatically when work is due soon or overdue.
      </footer>
    </div>
  );
}
