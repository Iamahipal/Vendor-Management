import { useEffect, useState, useRef } from 'react';
import { DatabaseState, User, TaskStatus, AssetType } from './types';
import GlassTile from './components/GlassTile';
import InternalDashboard from './components/InternalDashboard';
import VendorPortal from './components/VendorPortal';
import SystemControlPanel from './components/SystemControlPanel';
import { 
  ShieldCheck, 
  Layers, 
  Activity, 
  Cpu, 
  UserCheck, 
  RefreshCw, 
  Sliders, 
  X, 
  Bell, 
  Sparkles, 
  AlertTriangle,
  Lock,
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

export default function App() {
  const [dbState, setDbState] = useState<DatabaseState & { rlsSimulation?: any }>({
    users: [],
    vendors: [],
    tasks: [],
    deliverables: [],
    logs: []
  });

  // active selected user persona (Sarah Jenkins is default internal staff admin)
  const [selectedUserId, setSelectedUserId] = useState<string>('u-pfl-admin');
  const [loading, setLoading] = useState(true);
  const [isCronRunning, setIsCronRunning] = useState(false);
  const [showSimulator, setShowSimulator] = useState(true);

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
      const res = await fetch('/api/db', {
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
        const res = await fetch(url, {
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
      const res = await fetch('/api/tasks', {
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
      const res = await fetch(`/api/tasks/${taskId}/status`, {
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
      const res = await fetch('/api/deliverables', {
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
      const res = await fetch(`/api/deliverables/${deliverableId}/review`, {
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

  // API Call: Run Cron Reminders
  const handleSimulateCron = async () => {
    setIsCronRunning(true);
    try {
      const res = await fetch('/api/simulate-cron', {
        method: 'POST',
        headers: {
          'x-simulated-user-id': selectedUserId
        }
      });
      if (res.ok) {
        await fetchDb();
      } else {
        const err = await res.json();
        pushErrorAlert(err.error || 'Failed to run automation scan.');
      }
    } catch (e) {
      console.error(e);
      pushErrorAlert('Network error: failed to run automation scan.');
    } finally {
      setIsCronRunning(false);
    }
  };

  // API Call: Post back-and-forth feedback comment on a deliverable
  const handlePostFeedback = async (deliverableId: string, comment: string) => {
    try {
      const res = await fetch(`/api/deliverables/${deliverableId}/feedback`, {
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
      const res = await fetch('/api/gemini/critique', {
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
            <h1 className="font-sans font-bold text-sm tracking-tight text-slate-900 flex items-center gap-2">
              CreativeFlow Hub
              <span className="text-[10px] font-mono bg-blue-50 border border-blue-200 text-blue-600 px-2 py-0.5 rounded-full font-bold">
                PARTNERS & PIPELINE
              </span>
            </h1>
            <p className="text-[10px] text-slate-500 font-medium">Relational Collaborative Asset Pipeline</p>
          </div>
        </div>

        {/* Real-time security context switching header */}
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 bg-slate-100 border border-slate-200 p-1.5 rounded-xl w-full lg:w-auto">
          <div className="text-[10px] font-mono text-slate-500 uppercase font-bold px-2 flex items-center gap-1">
            <UserCheck className="h-3.5 w-3.5 text-slate-600" />
            Active Role:
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
        
        {/* Isolated Vault Guard Notification */}
        {currentUser && (
          <div className={`p-4 rounded-xl border flex items-start sm:items-center justify-between gap-4 shadow-xs ${
            currentUser.Role === 'Vendor'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-blue-50 border-blue-200 text-blue-900'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-1.5 rounded-lg border shrink-0 ${
                currentUser.Role === 'Vendor' 
                  ? 'bg-amber-100 border-amber-300 text-amber-700' 
                  : 'bg-blue-100 border-blue-300 text-blue-700'
              }`}>
                <ShieldCheck className="h-4.5 w-4.5" />
              </div>
              <div className="text-xs">
                <span className="font-bold uppercase tracking-wide font-mono block mb-0.5 text-xs">
                  {currentUser.Role === 'Vendor' ? 'Row-Level Security Active' : 'System Oversight Mode'}
                </span>
                <p className="text-slate-600">
                  {currentUser.Role === 'Vendor'
                    ? `Isolated Vendor Environment. Showing only creative briefs assigned to your vendor profile: ${dbState.vendors[0]?.Company_Name || 'your agency'}. Other agencies' tasks remain strictly isolated and protected.`
                    : 'Showing global administrator dashboard. Accessing all collaborative asset briefings, feedback cycles, and system automation.'
                  }
                </p>
              </div>
            </div>

            <span className="text-[10px] font-mono bg-white/80 border border-slate-200 px-2 py-0.5 rounded-full text-slate-500 shrink-0 hidden sm:inline-block">
              {currentUser.Role === 'Vendor' ? 'RLS: BOUNDED' : 'ROLE: ADMIN'}
            </span>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <RefreshCw className="h-6 w-6 text-slate-500 animate-spin" />
            <span className="text-xs text-slate-400 font-mono">Loading pipeline state...</span>
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
            
            {/* Toggle Button for Security Simulator Drawer */}
            <div className="flex justify-center pt-4">
              <button
                onClick={() => setShowSimulator(!showSimulator)}
                className="py-2 px-4 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-sans font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs"
              >
                <Sliders className="h-4 w-4 text-emerald-600" />
                {showSimulator ? 'Hide System & Automation Settings' : 'Configure System & Automation Reminders'}
              </button>
            </div>

            {/* Embedded Security & Automation Control Panel */}
            {showSimulator && (
              <SystemControlPanel
                dbState={dbState}
                onSimulateCron={handleSimulateCron}
                isCronSimulating={isCronRunning}
                selectedUserId={selectedUserId}
              />
            )}
          </>
        )}
      </main>

      {/* Global Footer credits */}
      <footer className="border-t border-slate-200 bg-slate-100 p-4 text-center text-[10px] font-mono text-slate-500 space-y-1">
        <div>CreativeFlow Hub • Collaborative Vendor Pipeline Manager</div>
        <div>Configured with automatic 48-hour delivery reminders and enterprise isolated security policies.</div>
      </footer>
    </div>
  );
}
