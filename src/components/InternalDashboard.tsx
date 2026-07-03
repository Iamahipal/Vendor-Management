import { useState, FormEvent } from 'react';
import { DatabaseState, Task, Deliverable, Vendor, AssetType, TaskStatus, ASSET_TEMPLATES } from '../types';
import GlassTile from './GlassTile';
import { Plus, Filter, Clock, CheckCircle, AlertTriangle, User, Layers, ArrowRight, ExternalLink, FileCode, Check, X } from 'lucide-react';

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
}

export default function InternalDashboard({
  dbState,
  onAddTask,
  onReviewDeliverable,
  onUpdateTaskStatus,
  onPostFeedback,
}: InternalDashboardProps) {
  const { tasks = [], vendors = [], deliverables = [] } = dbState;

  // UI state filters
  const [filterAssetType, setFilterAssetType] = useState<string>('ALL');
  const [filterVendor, setFilterVendor] = useState<string>('ALL');
  
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

  // Filter tasks
  const filteredTasks = tasks.filter(task => {
    const matchAsset = filterAssetType === 'ALL' || task.Asset_Type === filterAssetType;
    const matchVendor = filterVendor === 'ALL' || task.Assigned_Vendor_ID === filterVendor;
    return matchAsset && matchVendor;
  });

  // Kanban Column aggregation
  const columns: { label: string; status: TaskStatus; bg: string; border: string; text: string }[] = [
    { label: 'Brief Assigned', status: 'Assigned', bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700' },
    { label: 'In Production', status: 'In Progress', bg: 'bg-amber-50/50', border: 'border-amber-200', text: 'text-amber-800' },
    { label: 'Delivered (Needs Review)', status: 'Delivered', bg: 'bg-blue-50/50', border: 'border-blue-200', text: 'text-blue-800' },
    { label: 'Needs Revisions', status: 'Needs Revision', bg: 'bg-rose-50/50', border: 'border-rose-200', text: 'text-rose-800' },
    { label: 'Approved & Signed', status: 'Approved', bg: 'bg-emerald-50/50', border: 'border-emerald-200', text: 'text-emerald-800' },
  ];

  // Helper to resolve vendor name
  const getVendorName = (vendorId: string) => {
    return vendors.find(v => v.Vendor_ID === vendorId)?.Company_Name || 'Unknown Vendor';
  };

  // Get deliverables for a task
  const getTaskDeliverables = (taskId: string) => {
    return deliverables.filter(d => d.Task_ID === taskId);
  };

  // Derived current reviewing deliverable to ensure fresh comments list
  const currentReviewingDeliverable = reviewingDeliverable
    ? deliverables.find(d => d.Deliverable_ID === reviewingDeliverable.Deliverable_ID) || reviewingDeliverable
    : null;

  return (
    <div id="internal-dashboard" className="space-y-6 animate-fade-in">
      
      {/* Portfolio Quick Stats (Sleek High Contrast Cards) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <GlassTile className="border-slate-200 bg-white hover:bg-slate-50 transition-all shadow-xs">
          <span className="text-slate-500 text-[10px] font-mono uppercase tracking-wider block">TOTAL REQUESTS</span>
          <span className="text-3xl font-extrabold font-sans mt-2 text-slate-900">{tasks.length}</span>
          <span className="text-[10px] text-slate-400 mt-1 font-mono">Active briefs</span>
        </GlassTile>

        <GlassTile className="border-amber-200 bg-amber-50/30">
          <span className="text-amber-700 text-[10px] font-mono uppercase tracking-wider block">IN PROGRESS</span>
          <span className="text-3xl font-extrabold font-sans mt-2 text-amber-900">
            {tasks.filter(t => t.Status === 'In Progress').length}
          </span>
          <span className="text-[10px] text-amber-600 mt-1 font-mono">Agencies editing</span>
        </GlassTile>

        <GlassTile className="border-blue-200 bg-blue-50/30">
          <span className="text-blue-700 text-[10px] font-mono uppercase tracking-wider block">NEEDS REVIEW</span>
          <span className="text-3xl font-extrabold font-sans mt-2 text-blue-900">
            {tasks.filter(t => t.Status === 'Delivered').length}
          </span>
          <span className="text-[10px] text-blue-600 mt-1 font-mono">Files submitted</span>
        </GlassTile>

        <GlassTile className="border-rose-200 bg-rose-50/30">
          <span className="text-rose-700 text-[10px] font-mono uppercase tracking-wider block">REVISIONS</span>
          <span className="text-3xl font-extrabold font-sans mt-2 text-rose-900">
            {tasks.filter(t => t.Status === 'Needs Revision').length}
          </span>
          <span className="text-[10px] text-rose-600 mt-1 font-mono">Iterating drafts</span>
        </GlassTile>

        <GlassTile className="border-emerald-200 bg-emerald-50/30 col-span-2 md:col-span-1">
          <span className="text-emerald-700 text-[10px] font-mono uppercase tracking-wider block">APPROVED</span>
          <span className="text-3xl font-extrabold font-sans mt-2 text-emerald-900">
            {tasks.filter(t => t.Status === 'Approved').length}
          </span>
          <span className="text-[10px] text-emerald-600 mt-1 font-mono">Campaigns complete</span>
        </GlassTile>
      </div>

      {/* Main Control Center: Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Asset Type Filter */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            <select
              value={filterAssetType}
              onChange={(e) => setFilterAssetType(e.target.value)}
              className="bg-transparent text-xs font-sans font-semibold text-slate-700 outline-none cursor-pointer"
            >
              <option value="ALL">All Asset Types</option>
              <option value="LinkedIn">LinkedIn Creative</option>
              <option value="Emailer">Email Header</option>
              <option value="Desktop Pop-up">Desktop Pop-up</option>
              <option value="Instagram">Instagram (1:1)</option>
              <option value="Offline Banner">Offline Banner</option>
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

        {/* Create Brief Button */}
        <button
          onClick={handleOpenCreateForm}
          className="w-full md:w-auto py-2 px-4 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-bold font-sans text-xs rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
        >
          <Plus className="h-4 w-4" />
          Create Creative Request
        </button>
      </div>

      {/* Kanban Board View */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-[1100px] h-[580px] select-none">
          {columns.map(col => {
            const colTasks = filteredTasks.filter(t => t.Status === col.status);
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
                      <span className="text-slate-400 font-sans text-xxs">No requests.</span>
                    </div>
                  ) : (
                    colTasks.map(task => {
                      const taskDels = getTaskDeliverables(task.Task_ID);
                      const latestDel = taskDels[taskDels.length - 1];

                      return (
                        <div
                          key={task.Task_ID}
                          className="group bg-white border border-slate-200 hover:border-slate-300 p-4 rounded-xl shadow-xs transition-all duration-150 relative cursor-pointer"
                          onClick={() => {
                            if (task.Status === 'Delivered' && latestDel) {
                              setReviewingDeliverable(latestDel);
                            }
                          }}
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
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                              <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[120px] font-medium">{getVendorName(task.Assigned_Vendor_ID)}</span>
                            </div>

                            {/* Date warning status */}
                            <div className="flex items-center gap-1 text-[11px] text-slate-500 font-mono">
                              <Clock className="h-3 w-3 shrink-0 text-slate-400" />
                              <span>{task.Due_Date.substring(5)}</span>
                            </div>
                          </div>

                          {/* Latest Deliverable Version badge */}
                          {taskDels.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] font-mono">
                              <span className="text-slate-600 flex items-center gap-1 truncate max-w-[140px]">
                                <FileCode className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                {latestDel.File_Name}
                              </span>

                              {task.Status === 'Delivered' ? (
                                <span className="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wide animate-pulse">
                                  Review Draft
                                </span>
                              ) : (
                                <span className="text-slate-500">
                                  v{latestDel.Version} {latestDel.Approval_Status}
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
                                Start Production →
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

      {/* Slide-over or Frosted Glass Pop-up: Create New Creative Request */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl shadow-2xl overflow-hidden animate-slide-in">
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="font-sans font-bold text-slate-900 text-sm">New Creative Campaign Brief</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateTask} className="p-6 space-y-4 max-h-[500px] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Title */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-slate-600 font-sans text-xs font-semibold">Campaign Title / Asset Concept Name</label>
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
                  <label className="text-slate-600 font-sans text-xs font-semibold">Asset Format Target</label>
                  <select
                    value={newAssetType}
                    onChange={(e) => handleAssetTypeChange(e.target.value as AssetType)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-400 font-sans transition-all cursor-pointer"
                  >
                    <option value="LinkedIn">LinkedIn Creative (1200x627)</option>
                    <option value="Emailer">Email Header Header (600px)</option>
                    <option value="Desktop Pop-up">Desktop Modal Popup (800x500)</option>
                    <option value="Instagram">Instagram Square (1080x1080)</option>
                    <option value="Offline Banner">Offline Banner Banner (10x3 ft)</option>
                  </select>
                </div>

                {/* Assigned Vendor */}
                <div className="space-y-1.5">
                  <label className="text-slate-600 font-sans text-xs font-semibold">Assigned External Agency</label>
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
                  <label className="text-slate-600 font-sans text-xs font-semibold">Milestone Due Date</label>
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
                  <label className="text-slate-600 font-sans text-xs font-semibold">Standard Output Dimensions</label>
                  <input
                    type="text"
                    value={customDimensions}
                    onChange={(e) => setCustomDimensions(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-xs text-slate-700 font-mono focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-slate-600 font-sans text-xs font-semibold">Target Brand Guidelines</label>
                  <textarea
                    rows={2}
                    value={customGuidelines}
                    onChange={(e) => setCustomGuidelines(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-xs text-slate-700 font-sans focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-slate-600 font-sans text-xs font-semibold">Detailed Creative Requirements</label>
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
                  {isSubmittingTask ? 'Creating...' : 'Confirm & Dispatch Brief'}
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
                Asset Attachment
              </span>

              {/* Image rendering */}
              <div className="w-full h-full flex items-center justify-center p-2">
                <img
                  src={currentReviewingDeliverable.File_URL}
                  alt={currentReviewingDeliverable.File_Name}
                  referrerPolicy="no-referrer"
                  className="max-h-[380px] max-w-full rounded-lg object-contain shadow-xs border border-slate-200"
                />
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
                    <h3 className="font-sans font-bold text-sm text-slate-900">Review Draft</h3>
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
                  <div className="text-slate-500 font-bold uppercase text-[9px]">Brief Specifications:</div>
                  <div className="text-slate-700">Size: <span className="font-mono text-slate-900 text-[10px] block">{tasks.find(t => t.Task_ID === currentReviewingDeliverable.Task_ID)?.Dimensions}</span></div>
                  <div className="text-slate-700 mt-1.5">Guidelines: <span className="text-slate-900 block mt-0.5 font-sans leading-tight">{tasks.find(t => t.Task_ID === currentReviewingDeliverable.Task_ID)?.BrandGuidelines}</span></div>
                </div>

                {/* Feedback Thread list */}
                <div className="space-y-2">
                  <div className="text-slate-500 font-bold uppercase text-[9px]">Feedback Thread ({currentReviewingDeliverable.Feedback_History.length}):</div>
                  <div className="space-y-2 max-h-[130px] overflow-y-auto pr-1 bg-slate-50 p-2.5 rounded-lg border border-slate-150">
                    {currentReviewingDeliverable.Feedback_History.length === 0 ? (
                      <div className="text-[10px] text-slate-400 font-mono text-center py-2">No past comments.</div>
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
                  <label className="text-slate-600 font-sans text-xs font-semibold">Critique & Feedback</label>
                  <textarea
                    rows={2}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Provide clear visual critique or feedback notes..."
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
                  Approve Deliverable
                </button>
                <button
                  onClick={() => handleSubmitReview('Rejected')}
                  disabled={isReviewSubmitting}
                  className="w-full py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-sans font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <X className="h-4 w-4" />
                  Request Revisions
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
                  {isReviewSubmitting ? 'Processing...' : 'Post Comment Only'}
                </button>
                <p className="text-[9px] text-center text-slate-400 font-mono">
                  Feedback feeds directly to vendor dashboard.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
