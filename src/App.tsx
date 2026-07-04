import { useEffect, useState, useRef } from 'react';
import { DatabaseState, User, TaskStatus, AssetType } from './types';
import { DEMO_MODE, demoFetch, resetDemoDb } from './demoApi';
import InternalDashboard from './components/InternalDashboard';
import VendorPortal from './components/VendorPortal';
import HelpGuide from './components/HelpGuide';
import ActivityFeed from './components/ActivityFeed';
import {
  UserCheck,
  RefreshCw,
  X,
  Bell,
  Sparkles,
  HelpCircle,
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
    logs: []
  });

  // active selected user persona (Sarah Jenkins is default internal staff admin)
  const [selectedUserId, setSelectedUserId] = useState<string>('u-pfl-admin');
  const [loading, setLoading] = useState(true);

  // Step-by-step guide: opens automatically on the very first visit
  const [showGuide, setShowGuide] = useState<boolean>(() => {
    try {
      return !localStorage.getItem('creativeflow-guide-seen');
    } catch {
      return false;
    }
  });

  const closeGuide = () => {
    setShowGuide(false);
    try { localStorage.setItem('creativeflow-guide-seen', '1'); } catch { /* private mode */ }
  };

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
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-6 py-4 flex flex-col lg:flex-row items-center justify-between gap-4 shadow-xs">
        
        {/* Title branding logo */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-slate-900 rounded-lg flex items-center justify-center shadow-xs">
            <Compass className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-sans font-bold text-base tracking-tight text-slate-900">
              CreativeFlow Hub
            </h1>
            <p className="text-xs text-slate-500 font-medium">Design work with your vendors, in one place</p>
          </div>
          <button
            onClick={() => setShowGuide(true)}
            className="ml-2 py-1.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            How it works
          </button>
        </div>

        {/* Persona switcher (demo) */}
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 bg-slate-100 border border-slate-200 p-1.5 rounded-xl w-full lg:w-auto">
          <div className="text-xs text-slate-500 font-semibold px-2 flex items-center gap-1">
            <UserCheck className="h-3.5 w-3.5 text-slate-600" />
            Viewing as:
          </div>

          <div className="grid grid-cols-2 sm:flex gap-1 w-full sm:w-auto">
            {(dbState.users || []).map(u => {
              const isActive = u.User_ID === selectedUserId;
              return (
                <button
                  key={u.User_ID}
                  onClick={() => setSelectedUserId(u.User_ID)}
                  className={`px-3 py-1.5 rounded-lg font-sans text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  <img
                    src={u.Avatar}
                    alt={u.Name}
                    referrerPolicy="no-referrer"
                    className="h-4 w-4 rounded-full object-cover border border-slate-300 shrink-0"
                  />
                  <span className="truncate max-w-[85px]">{u.Name.split(' ')[0]} ({u.Role === 'Internal' ? 'PFL' : 'Vendor'})</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Container Wrapper */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6 pb-24">

        {/* Static demo notice (GitHub Pages build) */}
        {DEMO_MODE && (
          <div className="p-3 rounded-xl border border-violet-200 bg-violet-50 text-violet-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs shadow-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-600 shrink-0" />
              <span>
                <span className="font-bold">Interactive demo</span> — everything runs in your browser and is saved locally. Try switching personas, creating briefs, and submitting files. AI critiques are offline here (they need private API keys).
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

        {/* Friendly greeting instead of security jargon banners */}
        {currentUser && (
          <p className="text-sm text-slate-500">
            {currentUser.Role === 'Vendor'
              ? `Hi ${currentUser.Name.split(' ')[0]} — here are the requests for ${dbState.vendors[0]?.Company_Name || 'your team'}.`
              : `Hi ${currentUser.Name.split(' ')[0]} — here's where all your design requests stand.`}
          </p>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <RefreshCw className="h-6 w-6 text-slate-500 animate-spin" />
            <span className="text-sm text-slate-400">Loading...</span>
          </div>
        ) : (
          <>
            {/* Conditional Rendering of Dashboards based on Security Context Role */}
            {currentUser?.Role === 'Internal' ? (
              <InternalDashboard
                dbState={dbState}
                onAddTask={handleAddTask}
                onReviewDeliverable={handleReviewDeliverable}
                onUpdateTaskStatus={handleUpdateTaskStatus}
                onPostFeedback={handlePostFeedback}
              />
            ) : (
              <VendorPortal
                dbState={dbState}
                onSubmitDeliverable={handleSubmitDeliverable}
                onUpdateTaskStatus={handleUpdateTaskStatus}
                onRequestAICritique={handleRequestAICritique}
                onPostFeedback={handlePostFeedback}
              />
            )}
            
            {/* Plain-language recent activity for the internal team */}
            {currentUser?.Role === 'Internal' && (
              <ActivityFeed logs={dbState.logs || []} />
            )}
          </>
        )}
      </main>

      {/* Step-by-step guide (auto-opens on first visit) */}
      {showGuide && <HelpGuide onClose={closeGuide} />}

      {/* Global Footer */}
      <footer className="border-t border-slate-200 bg-slate-100 p-4 text-center text-xs text-slate-500">
        CreativeFlow Hub — design requests, reviews and reminders in one place. Reminders are sent automatically when work is due soon or overdue.
      </footer>
    </div>
  );
}
