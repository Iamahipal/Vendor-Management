import { useState } from 'react';
import { DatabaseState, NotificationLog, Task, Deliverable, Vendor, User } from '../types';
import { ShieldAlert, ShieldCheck, Terminal, Database, Mail, RefreshCw, Layers, Lock } from 'lucide-react';

interface SystemControlPanelProps {
  dbState: DatabaseState & { rlsSimulation?: any; aiProviders?: string[] };
  onSimulateCron: () => Promise<void>;
  isCronSimulating: boolean;
  selectedUserId: string;
}

export default function SystemControlPanel({
  dbState,
  onSimulateCron,
  isCronSimulating,
  selectedUserId,
}: SystemControlPanelProps) {
  const [activeTab, setActiveTab] = useState<'rls' | 'tables' | 'cron' | 'alerts'>('rls');
  const [selectedTableName, setSelectedTableName] = useState<'users' | 'vendors' | 'tasks' | 'deliverables'>('tasks');

  const { rlsSimulation, users = [], vendors = [], tasks = [], deliverables = [], logs = [], aiProviders = [] } = dbState;

  const activeUser = users.find(u => u.User_ID === selectedUserId);

  // Simulated email alerts triggered by cron (due-soon reminders + overdue escalations)
  const emailAlerts = logs.filter(l => l.type === 'cron_reminder' || l.type === 'cron_overdue');

  return (
    <div id="system-control-panel" className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs relative overflow-hidden animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-slate-100 rounded-lg border border-slate-200 text-slate-700 shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-sans font-bold text-sm text-slate-900 tracking-tight flex items-center gap-2">
              System Control & Security Settings
              <span className="text-[9px] font-mono bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                ENGINE V2.0
              </span>
            </h2>
            <p className="text-[11px] text-slate-500">
              Inspect mock database structures, row-level isolation bounds, and automatic cron workers.
            </p>
          </div>
        </div>

        {/* Current Security Status Badging */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-250 p-1.5 rounded-lg text-xs">
          <div className="flex items-center gap-1 font-mono text-slate-700 font-bold text-[10px]">
            <Lock className="h-3 w-3" />
            RLS Policy Check:
          </div>
          <div className="h-3 w-px bg-slate-200" />
          <div className="text-slate-600 text-[10px] font-medium">
            Role Context: <span className="font-mono font-bold text-slate-900">{activeUser?.Name} ({activeUser?.Role})</span>
          </div>
        </div>
      </div>

      {/* Segmented Tab Bar */}
      <div className="flex border-b border-slate-100 mb-4 p-1 bg-slate-50 rounded-xl max-w-lg">
        <button
          onClick={() => setActiveTab('rls')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
            activeTab === 'rls'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          Row Isolation Rules
        </button>
        <button
          onClick={() => setActiveTab('tables')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
            activeTab === 'tables'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Database className="h-3.5 w-3.5" />
          Relational Tables
        </button>
        <button
          onClick={() => setActiveTab('cron')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
            activeTab === 'cron'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Mail className="h-3.5 w-3.5" />
          Automation Work
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
            activeTab === 'alerts'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Terminal className="h-3.5 w-3.5" />
          Engine Trace ({logs.length})
        </button>
      </div>

      {/* Tab Content 1: Row-Level Security Details */}
      {activeTab === 'rls' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Status card */}
            <div className="lg:col-span-1 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <span className="text-slate-500 text-[10px] font-mono uppercase font-bold">SECURITY ENFORCEMENT</span>
                <div className="flex items-center gap-1.5 mt-1.5 mb-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-xs font-bold text-slate-800 font-mono">ISOLATED MODE BOUNDED</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-normal">
                  Our system evaluates client sessions dynamically to block cross-agency leaking. Vendors can view only self-assigned campaigns.
                </p>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 space-y-1 text-[10px] font-mono text-slate-500">
                <div>Enforced Policy: <span className="text-slate-800 font-bold">COLLAB_ISOLATION_RULE</span></div>
                <div>Server Pipeline: <span className="text-slate-800 font-bold">Express Router (Port 3000)</span></div>
              </div>
            </div>

            {/* SQL rule preview */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-950 rounded-xl p-4 font-mono text-xs">
              <span className="text-slate-400 text-[10px] block mb-2 uppercase font-bold">DEPLOYED FIRESTORE ISOLATION ALGORITHM</span>
              <pre className="text-emerald-400 overflow-x-auto bg-slate-950 p-3 rounded-lg border border-slate-800 max-h-[140px] leading-relaxed text-[11px]">
{`match /tasks/{taskId} {
  allow read: if request.auth != null && (
    resource.data.Assigned_Vendor_ID == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.Vendor_ID
    || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.Role == 'Internal'
  );
  allow create: if request.auth != null && getRole() == 'Internal';
}`}
              </pre>
            </div>
          </div>

          {/* Real-time Query Filter Output */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 font-mono text-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-700 font-bold flex items-center gap-1.5 font-sans">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Query Filter Resolution Ledger
              </span>
              <span className="text-[10px] text-slate-400 font-mono">STATUS: {rlsSimulation?.status || 'OK'}</span>
            </div>

            <div className="bg-slate-900 p-4 rounded-lg border border-slate-950 text-emerald-400 space-y-1 max-h-[150px] overflow-y-auto leading-relaxed text-[11px]">
              {rlsSimulation?.logs?.map((line: string, index: number) => (
                <div key={index} className="flex gap-2">
                  <span className="text-emerald-600 font-bold select-none">&gt;</span>
                  <span className={line.includes('Constraint') ? 'text-amber-400 font-bold' : ''}>{line}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 2: Relational Tables Browser */}
      {activeTab === 'tables' && (
        <div className="space-y-4">
          <div className="flex gap-2 border-b border-slate-100 pb-2 overflow-x-auto">
            {(['users', 'vendors', 'tasks', 'deliverables'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setSelectedTableName(tab)}
                className={`px-3 py-1 text-xs font-mono font-bold rounded-lg transition-all capitalize whitespace-nowrap cursor-pointer ${
                  selectedTableName === tab
                    ? 'bg-slate-900 border border-slate-800 text-white'
                    : 'text-slate-500 hover:text-slate-800 bg-slate-50 border border-slate-150'
                }`}
              >
                {tab === 'users' && `Users (${users.length})`}
                {tab === 'vendors' && `Vendors (${vendors.length})`}
                {tab === 'tasks' && `Tasks (${tasks.length})`}
                {tab === 'deliverables' && `Deliverables (${deliverables.length})`}
              </button>
            ))}
          </div>

          {/* Table Data Viewer */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto max-h-[250px] overflow-y-auto">
            {selectedTableName === 'tasks' && (
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                    <th className="p-3 font-semibold">Task_ID</th>
                    <th className="p-3 font-semibold">Title</th>
                    <th className="p-3 font-semibold">Asset_Type</th>
                    <th className="p-3 font-semibold">Vendor_ID</th>
                    <th className="p-3 font-semibold">Due_Date</th>
                    <th className="p-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-slate-700">
                  {tasks.map((task: Task) => (
                    <tr key={task.Task_ID} className="hover:bg-slate-50/55">
                      <td className="p-3 font-bold text-slate-950">{task.Task_ID}</td>
                      <td className="p-3 truncate max-w-[180px]">{task.Title}</td>
                      <td className="p-3">
                        <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-600 text-[10px]">
                          {task.Asset_Type}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-950">{task.Assigned_Vendor_ID}</td>
                      <td className="p-3">{task.Due_Date}</td>
                      <td className="p-3">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${
                          task.Status === 'Approved' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                          task.Status === 'Delivered' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                          task.Status === 'Needs Revision' ? 'bg-rose-50 text-rose-800 border border-rose-200' :
                          task.Status === 'In Progress' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                          'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {task.Status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {selectedTableName === 'deliverables' && (
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                    <th className="p-3 font-semibold">Deliverable_ID</th>
                    <th className="p-3 font-semibold">Task_ID</th>
                    <th className="p-3 font-semibold">File_Name</th>
                    <th className="p-3 font-semibold">Version</th>
                    <th className="p-3 font-semibold">Uploaded_At</th>
                    <th className="p-3 font-semibold">Approval_Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-slate-700">
                  {deliverables.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-400">No submitted deliverables in database tables.</td>
                    </tr>
                  ) : (
                    deliverables.map((del: Deliverable) => (
                      <tr key={del.Deliverable_ID} className="hover:bg-slate-50/55">
                        <td className="p-3 font-bold text-slate-950">{del.Deliverable_ID}</td>
                        <td className="p-3 font-bold text-slate-950">{del.Task_ID}</td>
                        <td className="p-3 truncate max-w-[150px]">{del.File_Name}</td>
                        <td className="p-3">v{del.Version}</td>
                        <td className="p-3 text-slate-500 truncate max-w-[100px]">{new Date(del.Uploaded_At).toLocaleDateString()}</td>
                        <td className="p-3">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${
                            del.Approval_Status === 'Approved' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                            del.Approval_Status === 'Rejected' ? 'bg-rose-50 text-rose-800 border border-rose-200' :
                            'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}>
                            {del.Approval_Status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {selectedTableName === 'users' && (
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                    <th className="p-3 font-semibold">User_ID</th>
                    <th className="p-3 font-semibold">Name</th>
                    <th className="p-3 font-semibold">Email</th>
                    <th className="p-3 font-semibold">Role</th>
                    <th className="p-3 font-semibold">Vendor_ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-slate-700">
                  {users.map((u: User) => (
                    <tr key={u.User_ID} className="hover:bg-slate-50/55">
                      <td className="p-3 font-bold text-slate-950">{u.User_ID}</td>
                      <td className="p-3">{u.Name}</td>
                      <td className="p-3 truncate max-w-[120px]">{u.Email}</td>
                      <td className="p-3 font-bold text-slate-700">{u.Role}</td>
                      <td className="p-3 font-bold text-slate-500">{u.Vendor_ID || 'NULL'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {selectedTableName === 'vendors' && (
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                    <th className="p-3 font-semibold">Vendor_ID</th>
                    <th className="p-3 font-semibold">Company_Name</th>
                    <th className="p-3 font-semibold">Specialty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-slate-700">
                  {vendors.map((v: Vendor) => (
                    <tr key={v.Vendor_ID} className="hover:bg-slate-50/55">
                      <td className="p-3 font-bold text-slate-950">{v.Vendor_ID}</td>
                      <td className="p-3 font-bold text-slate-900">{v.Company_Name}</td>
                      <td className="p-3 text-slate-500">{v.Specialty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Tab Content 3: Automated Cron Simulation */}
      {activeTab === 'cron' && (
        <div className="space-y-4">
          {/* AI Provider status */}
          <div className={`p-3 rounded-xl border flex items-center gap-2 text-xs ${
            aiProviders.length > 0
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}>
            <span className="font-bold font-mono text-[10px] uppercase shrink-0">🤖 AI Art Director:</span>
            <span className="font-sans">
              {aiProviders.length > 0
                ? `Online — provider chain: ${aiProviders.join(' → ')} (auto-failover)`
                : 'Offline — set NVIDIA_API_KEY, OPENROUTER_API_KEY, or GEMINI_API_KEY in .env.local to enable AI critiques.'}
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 font-sans">
                <Layers className="h-4 w-4 text-slate-600" />
                Target Trigger: Delivery Due Reminders
              </h3>
              <p className="text-[11px] text-slate-500 max-w-lg leading-normal">
                Runs automatically every hour: reminds vendors of assignments due within 48 hours and escalates overdue tasks (re-escalated daily until resolved). The button below triggers an immediate scan.
              </p>
            </div>

            <button
              onClick={onSimulateCron}
              disabled={isCronSimulating}
              className="py-2 px-4 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-bold font-sans text-xs rounded-lg flex items-center justify-center gap-1.5 transition-all shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isCronSimulating ? 'animate-spin' : ''}`} />
              Run 48h Scan
            </button>
          </div>

          {/* List of Simulated Emails Dispatched */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">AUTOMATED ALERTS LOGGED:</h4>
            
            {emailAlerts.length === 0 ? (
              <div className="p-6 bg-slate-50 border border-slate-200 rounded-lg text-center text-xs text-slate-400 font-mono">
                No reminders dispatched yet. Select "Run 48h Scan" to verify.
              </div>
            ) : (
              <div className="space-y-2 max-h-[160px] overflow-y-auto">
                {emailAlerts.map((reminder) => (
                  <div key={reminder.id} className="p-3 bg-white border border-slate-250 rounded-lg flex items-start gap-3">
                    <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-200 text-slate-600 shrink-0">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div className="text-[11px] font-mono">
                      <div className="text-slate-800 font-bold">SENT TO: {reminder.meta.vendorName}</div>
                      <div className="text-slate-600 mt-1">{reminder.message}</div>
                      <div className="text-[10px] text-slate-400 mt-1">Logged: {new Date(reminder.timestamp).toLocaleTimeString()} | Target ID: {reminder.meta.taskId}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Content 4: Real-time alert notifications log */}
      {activeTab === 'alerts' && (
        <div className="space-y-3 font-mono text-xs">
          <div className="flex justify-between items-center pb-1">
            <span className="text-slate-500 font-bold">Pipeline Engine Ledger Trace</span>
            <span className="text-[10px] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-500">Total Events: {logs.length}</span>
          </div>

          <div className="space-y-2 max-h-[220px] overflow-y-auto bg-slate-50 p-4 rounded-xl border border-slate-200 text-[11px]">
            {logs.map((log: NotificationLog) => (
              <div
                key={log.id}
                className={`p-2.5 rounded-lg border flex items-start gap-3 transition-colors ${
                  log.type === 'delivered'
                    ? 'bg-blue-50/50 border-blue-200 text-blue-900'
                    : log.type === 'cron_reminder'
                    ? 'bg-amber-50/50 border-amber-200 text-amber-900'
                    : log.type === 'cron_overdue'
                    ? 'bg-rose-50/50 border-rose-200 text-rose-900'
                    : 'bg-white border-slate-200 text-slate-700'
                }`}
              >
                <div className="shrink-0 mt-0.5 font-bold select-none text-xs">
                  {log.type === 'delivered' ? '📦' : log.type === 'cron_reminder' ? '⏰' : log.type === 'cron_overdue' ? '🚨' : '⚙️'}
                </div>
                <div className="flex-1 space-y-0.5">
                  <div className="leading-relaxed font-sans">{log.message}</div>
                  <div className="text-[9px] text-slate-400 flex gap-2 font-mono">
                    <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span>•</span>
                    <span className="uppercase tracking-wider font-bold">{log.type}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
