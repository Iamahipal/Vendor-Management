import { useState, FormEvent } from 'react';
import { DatabaseState, Task, Deliverable, Vendor, AssetType, TaskStatus, ASSET_TEMPLATES, getDueUrgency, isDirectImage } from '../types';
import GlassTile from './GlassTile';
import TaskDetailModal from './TaskDetailModal';
import VendorsPanel from './VendorsPanel';
import HistoryPanel from './HistoryPanel';
import { Plus, Filter, Clock, CheckCircle, AlertTriangle, User, Layers, ArrowRight, ExternalLink, FileCode, Check, X, Search, LayoutGrid, Users, Archive, Sparkles } from 'lucide-react';

// Asset types grouped by category for the dropdowns
const ASSET_GROUPS = (['Internal Comms', 'Social Media', 'Offline & Print'] as const).map(cat => ({
  category: cat,
  types: (Object.keys(ASSET_TEMPLATES) as AssetType[]).filter(t => ASSET_TEMPLATES[t].category === cat)
}));

export interface BriefDraft {
  title: string;
  asset_type: string;
  dimensions: string;
  guidelines: string;
  requirements: string;
  due_date: string;
}

interface InternalDashboardProps {
  dbState: DatabaseState;
  onAddTask: (taskData: {
    Title: string;
    Asset_Type: AssetType;
    Assigned_Vendor_ID: string;
    Due_Date: string;
    Custom_Dimensions: string;
    Custom_Guidelines: string;
    Custom_Requirements: string;
  }) => Promise<void>;
  onReviewDeliverable: (deliverableId: string, status: 'Approved' | 'Rejected', comment: string) => Promise<void>;
  onUpdateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  onPostFeedback: (deliverableId: string, comment: string) => Promise<void>;
  onPostTaskComment: (taskId: string, comment: string) => Promise<boolean>;
  onEditTask: (taskId: string, fields: Record<string, string>) => Promise<boolean>;
  onDeleteTask: (taskId: string) => Promise<boolean>;
  onAddVendor: (fields: Record<string, string>) => Promise<boolean>;
  onEditVendor: (vendorId: string, fields: Record<string, string>) => Promise<boolean>;
  onOrganizeBrief: (rawText: string) => Promise<BriefDraft | null>;
}

export default function InternalDashboard({
  dbState,
  onAddTask,
  onReviewDeliverable,
  onUpdateTaskStatus,
  onPostFeedback,
  onPostTaskComment,
  onEditTask,
  onDeleteTask,
  onAddVendor,
  onEditVendor,
  onOrganizeBrief,
}: InternalDashboardProps) {
  const { tasks = [], vendors = [], deliverables = [], users = [] } = dbState;

  // Cancelled requests stay in the database (History) but leave the board
  const activeTasks = tasks.filter(t => t.Status !== 'Cancelled');

  // Board / vendors / history view
  const [view, setView] = useState<'board' | 'vendors' | 'history'>('board');
  const [historyVendorId, setHistoryVendorId] = useState<string | null>(null);

  // AI brief organizer state (inside the create form)
  const [rawBrief, setRawBrief] = useState('');
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [organizedBy, setOrganizedBy] = useState<string | null>(null);

  // Task detail modal (opens for any card)
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  // UI state filters
  const [filterAssetType, setFilterAssetType] = useState<string>('ALL');
  const [filterVendor, setFilterVendor] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Create Task Form State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAssetType, setNewAssetType] = useState<AssetType>('LinkedIn');
  const [newVendorId, setNewVendorId] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [customDimensions, setCustomDimensions] = useState('');
  const [customGuidelines, setCustomGuidelines] = useState('');
  const [customRequirements, setCustomRequirements] = useState('');

  // Active review modal state
  const [reviewingDeliverable, setReviewingDeliverable] = useState<Deliverable | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [isReviewSubmitting, setIsReviewSubmitting] = useState(false);

  // Auto populate custom template guidelines on asset type change to give excellent preview
  const handleAssetTypeChange = (type: AssetType) => {
    setNewAssetType(type);
    const template = ASSET_TEMPLATES[type];
    setCustomDimensions(template.dimensions);
    setCustomGuidelines(template.brandGuidelines);
    setCustomRequirements(template.requirements);
  };

  const handleOpenCreateForm = () => {
    setShowCreateModal(true);
    // Initialize default vendor
    if (vendors.length > 0 && !newVendorId) {
      setNewVendorId(vendors[0].Vendor_ID);
    }
    // Initialize default template values
    handleAssetTypeChange('LinkedIn');
    setRawBrief('');
    setOrganizedBy(null);
  };

  // AI: structure the pasted raw requirement into the form fields.
  // The AI only organizes — the team always reviews before creating.
  const handleOrganizeClick = async () => {
    if (!rawBrief.trim() || isOrganizing) return;
    setIsOrganizing(true);
    setOrganizedBy(null);
    const draft = await onOrganizeBrief(rawBrief.trim());
    setIsOrganizing(false);
    if (!draft) return;
    if (draft.asset_type && draft.asset_type in ASSET_TEMPLATES) {
      handleAssetTypeChange(draft.asset_type as AssetType);
    }
    if (draft.title) setNewTitle(draft.title);
    if (draft.due_date) setNewDueDate(draft.due_date);
    if (draft.dimensions) setCustomDimensions(draft.dimensions);
    if (draft.guidelines) setCustomGuidelines(draft.guidelines);
    if (draft.requirements) setCustomRequirements(draft.requirements);
    setOrganizedBy('AI organized the text below into the form — please check every field before creating.');
  };

  const handleCreateTask = async (e: FormEvent) => {
    e.preventDefault();
    const vendorToUse = newVendorId || (vendors.length > 0 ? vendors[0].Vendor_ID : '');
    if (!newTitle || !newDueDate || !vendorToUse) return;

    setIsSubmittingTask(true);
    try {
      await onAddTask({
        Title: newTitle,
        Asset_Type: newAssetType,
        Assigned_Vendor_ID: vendorToUse,
        Due_Date: newDueDate,
        Custom_Dimensions: customDimensions,
        Custom_Guidelines: customGuidelines,
        Custom_Requirements: customRequirements,
      });

      // Reset Form
      setNewTitle('');
      setShowCreateModal(false);
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleSubmitReview = async (status: 'Approved' | 'Rejected') => {
    if (!reviewingDeliverable) return;
    setIsReviewSubmitting(true);
    try {
      await onReviewDeliverable(reviewingDeliverable.Deliverable_ID, status, reviewComment);
      setReviewingDeliverable(null);
      setReviewComment('');
    } catch (e) {
      console.error(e);
    } finally {
      setIsReviewSubmitting(false);
    }
  };

  // Filter tasks (asset type, vendor, and free-text search across title/id/vendor)
  const query = searchQuery.trim().toLowerCase();
  const filteredTasks = activeTasks.filter(task => {
    const matchAsset = filterAssetType === 'ALL' || task.Asset_Type === filterAssetType;
    const matchVendor = filterVendor === 'ALL' || task.Assigned_Vendor_ID === filterVendor;
    const matchSearch = !query
      || task.Title.toLowerCase().includes(query)
      || task.Task_ID.toLowerCase().includes(query)
      || (vendors.find(v => v.Vendor_ID === task.Assigned_Vendor_ID)?.Company_Name.toLowerCase().includes(query) ?? false);
    return matchAsset && matchVendor && matchSearch;
  });

  // Overdue awareness for the toolbar
  const overdueCount = activeTasks.filter(t => getDueUrgency(t)?.tone === 'overdue').length;

  // Kanban Column aggregation
  const columns: { label: string; status: TaskStatus; bg: string; border: string; text: string }[] = [
    { label: 'New', status: 'Assigned', bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700' },
    { label: 'Being Made', status: 'In Progress', bg: 'bg-amber-50/50', border: 'border-amber-200', text: 'text-amber-800' },
    { label: 'Ready for Review', status: 'Delivered', bg: 'bg-blue-50/50', border: 'border-blue-200', text: 'text-blue-800' },
    { label: 'Changes Needed', status: 'Needs Revision', bg: 'bg-rose-50/50', border: 'border-rose-200', text: 'text-rose-800' },
    { label: 'Approved', status: 'Approved', bg: 'bg-emerald-50/50', border: 'border-emerald-200', text: 'text-emerald-800' },
  ];

  // Helper to resolve vendor name
  const getVendorName = (vendorId: string) => {
    return vendors.find(v => v.Vendor_ID === vendorId)?.Company_Name || 'Unknown Vendor';
  };

  // Get deliverables for a task, oldest version first
  const getTaskDeliverables = (taskId: string) => {
    return deliverables
      .filter(d => d.Task_ID === taskId)
      .sort((a, b) => a.Version - b.Version);
  };

  // Derived current reviewing deliverable to ensure fresh comments list
  const currentReviewingDeliverable = reviewingDeliverable
    ? deliverables.find(d => d.Deliverable_ID === reviewingDeliverable.Deliverable_ID) || reviewingDeliverable
    : null;

  // Derived detail task so edits/comments refresh live
  const detailTask = detailTaskId ? tasks.find(t => t.Task_ID === detailTaskId) || null : null;

  return (
    <div id="internal-dashboard" className="space-y-6 animate-fade-in">

      {/* Board / Vendors view toggle */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setView('board')}
          className={`py-2 px-4 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            view === 'board' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
          }`}
        >
          <LayoutGrid className="h-4 w-4" />
          Requests
        </button>
        <button
          onClick={() => setView('vendors')}
          className={`py-2 px-4 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            view === 'vendors' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="h-4 w-4" />
          Vendors ({vendors.length})
        </button>
        <button
          onClick={() => { setHistoryVendorId(null); setView('history'); }}
          className={`py-2 px-4 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            view === 'history' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
          }`}
        >
          <Archive className="h-4 w-4" />
          History
        </button>
      </div>

      {view === 'vendors' ? (
        <VendorsPanel
          vendors={vendors}
          users={users}
          tasks={tasks}
          deliverables={deliverables}
          onAddVendor={onAddVendor}
          onEditVendor={onEditVendor}
          onViewHistory={(vendorId) => { setHistoryVendorId(vendorId); setView('history'); }}
        />
      ) : view === 'history' ? (
        <HistoryPanel
          key={historyVendorId ?? 'all'}
          tasks={tasks}
          vendors={vendors}
          deliverables={deliverables}
          initialVendorId={historyVendorId}
          onOpenTask={(taskId) => setDetailTaskId(taskId)}
        />
      ) : (
      <>
      
      {/* Portfolio Quick Stats (Sleek High Contrast Cards) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <GlassTile className="border-slate-200 bg-white hover:bg-slate-50 transition-all shadow-xs">
          <span className="text-slate-500 text-[10px] font-mono uppercase tracking-wider block">ALL REQUESTS</span>
          <span className="text-3xl font-extrabold font-sans mt-2 text-slate-900">{activeTasks.length}</span>
          <span className="text-[10px] text-slate-400 mt-1 font-mono">everything in flight</span>
        </GlassTile>

        <GlassTile className="border-amber-200 bg-amber-50/30">
          <span className="text-amber-700 text-[10px] font-mono uppercase tracking-wider block">BEING MADE</span>
          <span className="text-3xl font-extrabold font-sans mt-2 text-amber-900">
            {activeTasks.filter(t => t.Status === 'In Progress').length}
          </span>
          <span className="text-[10px] text-amber-600 mt-1 font-mono">vendors working on these</span>
        </GlassTile>

        <GlassTile className="border-blue-200 bg-blue-50/30">
          <span className="text-blue-700 text-[10px] font-mono uppercase tracking-wider block">READY FOR REVIEW</span>
          <span className="text-3xl font-extrabold font-sans mt-2 text-blue-900">
            {activeTasks.filter(t => t.Status === 'Delivered').length}
          </span>
          <span className="text-[10px] text-blue-600 mt-1 font-mono">waiting on you</span>
        </GlassTile>

        <GlassTile className="border-rose-200 bg-rose-50/30">
          <span className="text-rose-700 text-[10px] font-mono uppercase tracking-wider block">CHANGES NEEDED</span>
          <span className="text-3xl font-extrabold font-sans mt-2 text-rose-900">
            {activeTasks.filter(t => t.Status === 'Needs Revision').length}
          </span>
          <span className="text-[10px] text-rose-600 mt-1 font-mono">back with the vendor</span>
        </GlassTile>

        <GlassTile className="border-emerald-200 bg-emerald-50/30 col-span-2 md:col-span-1">
          <span className="text-emerald-700 text-[10px] font-mono uppercase tracking-wider block">APPROVED</span>
          <span className="text-3xl font-extrabold font-sans mt-2 text-emerald-900">
            {activeTasks.filter(t => t.Status === 'Approved').length}
          </span>
          <span className="text-[10px] text-emerald-600 mt-1 font-mono">all done</span>
        </GlassTile>
      </div>

      {/* Main Control Center: Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Search box */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <Search className="h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search briefs, vendors, IDs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs font-sans font-semibold text-slate-700 outline-none w-44 placeholder:font-normal placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Asset Type Filter */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            <select
              value={filterAssetType}
              onChange={(e) => setFilterAssetType(e.target.value)}
              className="bg-transparent text-xs font-sans font-semibold text-slate-700 outline-none cursor-pointer"
            >
              <option value="ALL">All Asset Types</option>
              {ASSET_GROUPS.map(g => (
                <optgroup key={g.category} label={g.category}>
                  {g.types.map(t => <option key={t} value={t}>{t}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Vendor Filter */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <User className="h-3.5 w-3.5 text-slate-500" />
            <select
              value={filterVendor}
              onChange={(e) => setFilterVendor(e.target.value)}
              className="bg-transparent text-xs font-sans font-semibold text-slate-700 outline-none cursor-pointer"
            >
              <option value="ALL">All Vendors</option>
              {vendors.map(v => (
                <option key={v.Vendor_ID} value={v.Vendor_ID}>{v.Company_Name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Overdue awareness chip */}
        {overdueCount > 0 && (
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg font-mono shrink-0">
            <AlertTriangle className="h-3.5 w-3.5" />
            {overdueCount} OVERDUE
          </span>
        )}

        {/* Create Brief Button */}
        <button
          onClick={handleOpenCreateForm}
          className="w-full md:w-auto py-2 px-4 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-bold font-sans text-xs rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
        >
          <Plus className="h-4 w-4" />
          New Request
        </button>
      </div>

      {/* Kanban Board View */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-[1100px] h-[580px] select-none">
          {columns.map(col => {
            // Most urgent first within each column
            const colTasks = filteredTasks
              .filter(t => t.Status === col.status)
              .sort((a, b) => a.Due_Date.localeCompare(b.Due_Date));
            return (
              <div
                key={col.status}
                className={`flex-1 flex flex-col rounded-xl border ${col.border} ${col.bg} p-4 max-w-[280px] h-full overflow-hidden`}
              >
                {/* Column Title */}
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <h3 className={`font-sans font-bold text-xs tracking-wide uppercase ${col.text}`}>
                    {col.label}
                  </h3>
                  <span className="font-mono text-[10px] bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full shadow-2xs">
                    {colTasks.length}
                  </span>
                </div>

                {/* Column Scrollable Content */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-4">
                  {colTasks.length === 0 ? (
                    <div className="h-28 rounded-xl border border-dashed border-slate-200 bg-white/50 flex items-center justify-center p-4 text-center">
                      <span className="text-slate-400 font-sans text-xxs">Nothing here.</span>
                    </div>
                  ) : (
                    colTasks.map(task => {
                      const taskDels = getTaskDeliverables(task.Task_ID);
                      const latestDel = taskDels[taskDels.length - 1];
                      const urgency = getDueUrgency(task);

                      return (
                        <div
                          key={task.Task_ID}
                          className={`group bg-white border p-4 rounded-xl shadow-xs transition-all duration-150 relative cursor-pointer ${
                            urgency?.tone === 'overdue'
                              ? 'border-rose-300 hover:border-rose-400'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                          onClick={() => setDetailTaskId(task.Task_ID)}
                        >
                          {/* Asset badge & Type */}
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                              {task.Asset_Type}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {task.Task_ID}
                            </span>
                          </div>

                          {/* Task Title */}
                          <h4 className="font-sans font-semibold text-sm text-slate-800 line-clamp-2 leading-tight group-hover:text-slate-900 transition-colors">
                            {task.Title}
                          </h4>

                          {/* Vendor assignee */}
                          <div className="mt-3 flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 min-w-0">
                              <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="truncate font-medium">{getVendorName(task.Assigned_Vendor_ID)}</span>
                            </div>

                            {/* Date warning status */}
                            {urgency ? (
                              <span className={`flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border whitespace-nowrap shrink-0 ${
                                urgency.tone === 'overdue'
                                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                                  : 'bg-amber-50 border-amber-200 text-amber-700'
                              }`}>
                                <Clock className="h-3 w-3 shrink-0" />
                                {urgency.label}
                              </span>
                            ) : (
                              <div className="flex items-center gap-1 text-[11px] text-slate-500 font-mono whitespace-nowrap shrink-0">
                                <Clock className="h-3 w-3 shrink-0 text-slate-400" />
                                <span>{task.Due_Date.substring(5)}</span>
                              </div>
                            )}
                          </div>

                          {/* Latest Deliverable Version badge */}
                          {taskDels.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-[10px] font-mono">
                              <span className="text-slate-600 flex items-center gap-1 flex-1 min-w-0">
                                <FileCode className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="truncate">{latestDel.File_Name}</span>
                              </span>

                              {task.Status === 'Delivered' ? (
                                <span className="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wide animate-pulse whitespace-nowrap shrink-0">
                                  Review now
                                </span>
                              ) : (
                                <span className="text-slate-500 whitespace-nowrap shrink-0">
                                  v{latestDel.Version} · {latestDel.Approval_Status === 'Pending' ? 'Waiting' : latestDel.Approval_Status}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Status buttons for fast manual progress/testing simulation */}
                          <div className="mt-3 pt-2 border-t border-slate-100 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                            {task.Status === 'Assigned' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateTaskStatus(task.Task_ID, 'In Progress');
                                }}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] rounded text-slate-700 transition-colors font-medium cursor-pointer"
                              >
                                Mark as started →
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      </>
      )}

      {/* Slide-over or Frosted Glass Pop-up: Create New Creative Request */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl shadow-2xl overflow-hidden animate-slide-in">
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="font-sans font-bold text-slate-900 text-sm">New design request</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateTask} className="p-6 space-y-4 max-h-[500px] overflow-y-auto">

              {/* AI brief organizer: paste raw team requirement, get a structured draft */}
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-violet-900 text-xs font-bold">
                  <Sparkles className="h-4 w-4 text-violet-600" />
                  Got a raw requirement from a team? Paste it — AI fills the form (it only organizes, never changes the content).
                </div>
                <textarea
                  rows={3}
                  value={rawBrief}
                  onChange={(e) => setRawBrief(e.target.value)}
                  placeholder={'Paste the email / Teams message here, e.g.:\n"Hi team, we need an emailer for the Diwali celebration on 20th Oct, festive but corporate look, must include the CEO message and RSVP link..."'}
                  className="w-full bg-white border border-violet-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-violet-400"
                />
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleOrganizeClick}
                    disabled={isOrganizing || !rawBrief.trim()}
                    className="py-1.5 px-3 bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {isOrganizing ? 'Organizing...' : 'Organize with AI'}
                  </button>
                  {organizedBy && <span className="text-[11px] text-violet-700">{organizedBy}</span>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Title */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-slate-600 font-sans text-xs font-semibold">What do you need?</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Q3 Cloud Security Campaign Header"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-400 font-sans transition-all"
                  />
                </div>

                {/* Asset Type */}
                <div className="space-y-1.5">
                  <label className="text-slate-600 font-sans text-xs font-semibold">Type of design</label>
                  <select
                    value={newAssetType}
                    onChange={(e) => handleAssetTypeChange(e.target.value as AssetType)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-400 font-sans transition-all cursor-pointer"
                  >
                    {ASSET_GROUPS.map(g => (
                      <optgroup key={g.category} label={g.category}>
                        {g.types.map(t => <option key={t} value={t}>{t}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {/* Assigned Vendor */}
                <div className="space-y-1.5">
                  <label className="text-slate-600 font-sans text-xs font-semibold">Which vendor?</label>
                  <select
                    value={newVendorId || (vendors.length > 0 ? vendors[0].Vendor_ID : '')}
                    onChange={(e) => setNewVendorId(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-400 font-sans transition-all cursor-pointer"
                  >
                    {vendors.map(v => (
                      <option key={v.Vendor_ID} value={v.Vendor_ID}>
                        {v.Company_Name} ({v.Specialty})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Due Date */}
                <div className="space-y-1.5">
                  <label className="text-slate-600 font-sans text-xs font-semibold">Due date</label>
                  <input
                    type="date"
                    required
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-400 font-mono transition-all"
                  />
                </div>

                {/* System automation note */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 md:col-span-2 text-[10px] text-blue-800 font-mono leading-relaxed flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-600 shrink-0" />
                  <div>
                    <span className="font-bold">Automated Specification Pipeline:</span> Loading target sizes and standard guidelines for {newAssetType}.
                  </div>
                </div>

                {/* Editable specifications populated by default templates */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-slate-600 font-sans text-xs font-semibold">Size</label>
                  <input
                    type="text"
                    value={customDimensions}
                    onChange={(e) => setCustomDimensions(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-xs text-slate-700 font-mono focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-slate-600 font-sans text-xs font-semibold">Brand guidelines</label>
                  <textarea
                    rows={2}
                    value={customGuidelines}
                    onChange={(e) => setCustomGuidelines(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-xs text-slate-700 font-sans focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-slate-600 font-sans text-xs font-semibold">What it must include</label>
                  <textarea
                    rows={2}
                    value={customRequirements}
                    onChange={(e) => setCustomRequirements(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-xs text-slate-700 font-sans focus:outline-none"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isSubmittingTask}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTask}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingTask ? 'Creating...' : 'Create request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Dialog: View Submitted Mockup Asset & Run Manual Approvals */}
      {currentReviewingDeliverable && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden animate-slide-in flex flex-col md:flex-row h-[580px]">
            {/* Visual Mockup File Preview */}
            <div className="flex-1 bg-slate-50 relative overflow-hidden flex flex-col justify-between p-4 border-r border-slate-200">
              <span className="absolute top-4 left-4 text-[10px] font-mono bg-white px-2 py-1 rounded border border-slate-200 text-slate-500 uppercase tracking-wider z-10 shadow-3xs">
                Design
              </span>

              {/* Image preview for direct images; open-link card for share links (OneDrive/Drive/...) */}
              <div className="w-full h-full flex items-center justify-center p-2">
                {isDirectImage(currentReviewingDeliverable.File_URL) ? (
                  <img
                    src={currentReviewingDeliverable.File_URL}
                    alt={currentReviewingDeliverable.File_Name}
                    referrerPolicy="no-referrer"
                    className="max-h-[380px] max-w-full rounded-lg object-contain shadow-xs border border-slate-200"
                  />
                ) : (
                  <a
                    href={currentReviewingDeliverable.File_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-3 p-8 bg-white border border-slate-200 hover:border-slate-400 rounded-xl shadow-xs transition-all text-center"
                  >
                    <ExternalLink className="h-8 w-8 text-slate-400" />
                    <span className="font-bold text-sm text-slate-800">Open design ↗</span>
                    <span className="text-xs text-slate-500 max-w-[220px] break-all">
                      This design is a shared link (OneDrive / Drive / Dropbox). Click to open it in a new tab.
                    </span>
                  </a>
                )}
              </div>

              <div className="text-center font-mono text-[10px] text-slate-500 shrink-0 pt-2 border-t border-slate-100 truncate">
                {currentReviewingDeliverable.File_Name} (Version {currentReviewingDeliverable.Version})
              </div>
            </div>

            {/* Review Decision Panel */}
            <div className="w-full md:w-[280px] flex flex-col justify-between p-5 bg-white">
              <div className="space-y-4 overflow-y-auto max-h-[440px] pr-1">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-sans font-bold text-sm text-slate-900">Review design</h3>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {currentReviewingDeliverable.Deliverable_ID}</p>
                  </div>
                  <button
                    onClick={() => setReviewingDeliverable(null)}
                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Requirements check list */}
                <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-150 text-[11px]">
                  <div className="text-slate-500 font-bold uppercase text-[9px]">What was asked for:</div>
                  <div className="text-slate-700">Size: <span className="font-mono text-slate-900 text-[10px] block">{tasks.find(t => t.Task_ID === currentReviewingDeliverable.Task_ID)?.Dimensions}</span></div>
                  <div className="text-slate-700 mt-1.5">Guidelines: <span className="text-slate-900 block mt-0.5 font-sans leading-tight">{tasks.find(t => t.Task_ID === currentReviewingDeliverable.Task_ID)?.BrandGuidelines}</span></div>
                </div>

                {/* Feedback Thread list */}
                <div className="space-y-2">
                  <div className="text-slate-500 font-bold uppercase text-[9px]">Conversation ({currentReviewingDeliverable.Feedback_History.length}):</div>
                  <div className="space-y-2 max-h-[130px] overflow-y-auto pr-1 bg-slate-50 p-2.5 rounded-lg border border-slate-150">
                    {currentReviewingDeliverable.Feedback_History.length === 0 ? (
                      <div className="text-[10px] text-slate-400 font-mono text-center py-2">No comments yet.</div>
                    ) : (
                      currentReviewingDeliverable.Feedback_History.map(fb => (
                        <div key={fb.id} className="text-[11px] leading-snug border-b border-slate-100 pb-1.5 last:border-0 last:pb-0">
                          <div className="flex justify-between items-center text-[9px] text-slate-400 mb-0.5 font-mono">
                            <span className="font-bold text-slate-600 truncate max-w-[120px]">{fb.reviewer}</span>
                            <span>{new Date(fb.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="text-slate-600 whitespace-pre-wrap text-[10px]">{fb.comment}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Write comment */}
                <div className="space-y-1">
                  <label className="text-slate-600 font-sans text-xs font-semibold">Your feedback</label>
                  <textarea
                    rows={2}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Write what you think or what should change..."
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-400"
                  />
                </div>
              </div>

              {/* Decisions Buttons */}
              <div className="space-y-2 pt-3 border-t border-slate-100">
                <button
                  onClick={() => handleSubmitReview('Approved')}
                  disabled={isReviewSubmitting}
                  className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-sans font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  Approve
                </button>
                <button
                  onClick={() => handleSubmitReview('Rejected')}
                  disabled={isReviewSubmitting || !reviewComment.trim()}
                  title={!reviewComment.trim() ? 'Write what needs to change first' : undefined}
                  className="w-full py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-sans font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <X className="h-4 w-4" />
                  {reviewComment.trim() ? 'Ask for changes' : 'Ask for changes (write a comment first)'}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!reviewComment.trim()) return;
                    setIsReviewSubmitting(true);
                    try {
                      await onPostFeedback(currentReviewingDeliverable.Deliverable_ID, reviewComment.trim());
                      setReviewComment('');
                    } catch (e) {
                      console.error(e);
                    } finally {
                      setIsReviewSubmitting(false);
                    }
                  }}
                  disabled={isReviewSubmitting || !reviewComment.trim()}
                  className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-250 text-slate-700 font-sans font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isReviewSubmitting ? 'Processing...' : 'Send comment only'}
                </button>
                <p className="text-[9px] text-center text-slate-400 font-mono">
                  The vendor sees your feedback instantly.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full request detail: edit, cancel, question thread, versions */}
      {detailTask && !currentReviewingDeliverable && (
        <TaskDetailModal
          task={detailTask}
          vendors={vendors}
          deliverables={getTaskDeliverables(detailTask.Task_ID)}
          onClose={() => setDetailTaskId(null)}
          onEdit={onEditTask}
          onDelete={onDeleteTask}
          onPostComment={onPostTaskComment}
          onOpenDeliverable={(del) => setReviewingDeliverable(del)}
        />
      )}

    </div>
  );
}
