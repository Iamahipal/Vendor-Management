import { useState, FormEvent } from 'react';
import { DatabaseState, Task, Deliverable, TaskStatus, FeedbackItem, ASSET_TEMPLATES, getDueUrgency } from '../types';
import GlassTile from './GlassTile';
import { Inbox, Briefcase, RefreshCw, UploadCloud, Sparkles, History, CheckCircle, ArrowRight, X, Clock } from 'lucide-react';

interface VendorPortalProps {
  dbState: DatabaseState;
  onSubmitDeliverable: (task_ID: string, File_URL: string, File_Name: string) => Promise<void>;
  onUpdateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  onRequestAICritique: (deliverableId: string, summary: string) => Promise<string>;
  onPostFeedback: (deliverableId: string, comment: string) => Promise<void>;
}

export default function VendorPortal({
  dbState,
  onSubmitDeliverable,
  onUpdateTaskStatus,
  onRequestAICritique,
  onPostFeedback,
}: VendorPortalProps) {
  const { tasks = [], deliverables = [], user } = dbState;

  // Active sub-section tab inside the Vendor Portal
  const [activeTab, setActiveTab] = useState<'new_briefs' | 'in_progress' | 'feedback_revisions'>('new_briefs');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Deliverable Submission Form State
  const [isSubmittingFile, setIsSubmittingFile] = useState(false);
  const [submittedFileName, setSubmittedFileName] = useState('');
  const [submittedFileUrl, setSubmittedFileUrl] = useState('');
  const [isSubmitPending, setIsSubmitPending] = useState(false);

  // AI Critique request state
  const [aiSummaryInput, setAiSummaryInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Threaded reply inputs per deliverable
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [isReplySubmitting, setIsReplySubmitting] = useState<Record<string, boolean>>({});

  // Pre-seed mock image choices for easy vendor demo submissions
  const UNSPASH_MOCK_ASSETS = [
    { name: 'Minimal Corporate Cyber Draft', url: 'https://images.unsplash.com/photo-1542744094-3a31f103e35f?w=800&auto=format&fit=crop&q=80' },
    { name: 'SaaS Dashboard Analytics Concept', url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&auto=format&fit=crop&q=80' },
    { name: 'Mobile App Wireframe Mockup', url: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=800&auto=format&fit=crop&q=80' },
    { name: 'Modern Billboard Print Vector Layout', url: 'https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=800&auto=format&fit=crop&q=80' },
  ];

  // Helper to trigger fast mockup URL autofill
  const handleAutofillMockImage = (asset: { name: string; url: string }) => {
    setSubmittedFileName(asset.name.toLowerCase().replace(/\s+/g, '_') + '_draft.png');
    setSubmittedFileUrl(asset.url);
  };

  // Filter tasks belonging exclusively to current vendor based on RLS isolation logic,
  // sorted by deadline so the most urgent work is always at the top
  const byDueDate = (a: Task, b: Task) => a.Due_Date.localeCompare(b.Due_Date);
  const vendorTasks = tasks.filter(t => t.Assigned_Vendor_ID === user?.Vendor_ID).sort(byDueDate);
  const selectedTask = selectedTaskId ? vendorTasks.find(t => t.Task_ID === selectedTaskId) || null : null;

  // 1. "New Requests" -> Tasks in status 'Assigned'
  const newBriefs = vendorTasks.filter(t => t.Status === 'Assigned');

  // 2. "Tasks in Progress" -> Tasks in status 'In Progress' or 'Delivered' (awaiting review)
  const tasksInProgress = vendorTasks.filter(t => t.Status === 'In Progress' || t.Status === 'Delivered' || t.Status === 'Approved');

  // 3. "Feedback/Revisions" -> Tasks in status 'Needs Revision'
  const feedbackRevisions = vendorTasks.filter(t => t.Status === 'Needs Revision');

  const handleStartTask = async (taskId: string) => {
    await onUpdateTaskStatus(taskId, 'In Progress');
    // Auto select to let them upload immediately
    setSelectedTaskId(taskId);
    setActiveTab('in_progress');
  };

  const handleSubmitFile = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !submittedFileUrl || !submittedFileName) return;

    setIsSubmitPending(true);
    try {
      await onSubmitDeliverable(selectedTask.Task_ID, submittedFileUrl, submittedFileName);
      // Clean states
      setIsSubmittingFile(false);
      setSubmittedFileName('');
      setSubmittedFileUrl('');
      setSelectedTaskId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitPending(false);
    }
  };

  const handleRequestAIArtDirectorReview = async (deliverableId: string) => {
    setIsAiLoading(true);
    try {
      // Advisory pre-check: the critique lands in this deliverable's feedback
      // thread right here — no tab switch, no task status change.
      await onRequestAICritique(deliverableId, aiSummaryInput || 'Requesting design layout and guidelines review.');
      setAiSummaryInput('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Resolve deliverables for selected task, oldest version first
  const taskDeliverables = selectedTask
    ? deliverables
        .filter(d => d.Task_ID === selectedTask.Task_ID)
        .sort((a, b) => a.Version - b.Version)
    : [];

  return (
    <div id="vendor-portal" className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
      
      {/* Column 1 & 2: Brief & Production Pipeline Tabs */}
      <div className="lg:col-span-2 space-y-4">
        
        {/* Navigation Tabs - Clean Sleek Light Cards */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => {
              setActiveTab('new_briefs');
              setSelectedTaskId(null);
            }}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer select-none flex flex-col justify-between ${
              activeTab === 'new_briefs'
                ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
              <Inbox className="h-4 w-4" />
              New Requests
            </div>
            <div className="flex items-end justify-between w-full mt-3">
              <span className="text-3xl font-extrabold font-sans leading-none">{newBriefs.length}</span>
              <span className="text-[10px] font-mono opacity-80">waiting for you</span>
            </div>
          </button>

          <button
            onClick={() => {
              setActiveTab('in_progress');
              setSelectedTaskId(null);
            }}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer select-none flex flex-col justify-between ${
              activeTab === 'in_progress'
                ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
              <Briefcase className="h-4 w-4" />
              In Progress
            </div>
            <div className="flex items-end justify-between w-full mt-3">
              <span className="text-3xl font-extrabold font-sans leading-none">{tasksInProgress.length}</span>
              <span className="text-[10px] font-mono opacity-80">underway</span>
            </div>
          </button>

          <button
            onClick={() => {
              setActiveTab('feedback_revisions');
              setSelectedTaskId(null);
            }}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer select-none flex flex-col justify-between ${
              activeTab === 'feedback_revisions'
                ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
              <RefreshCw className="h-4 w-4" />
              Changes
            </div>
            <div className="flex items-end justify-between w-full mt-3">
              <span className="text-3xl font-extrabold font-sans leading-none">{feedbackRevisions.length}</span>
              <span className="text-[10px] font-mono opacity-80">to fix</span>
            </div>
          </button>
        </div>

        {/* Task List Container */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs min-h-[380px]">
          <h3 className="font-sans font-bold text-xs text-slate-800 mb-4 uppercase tracking-wider flex items-center gap-2">
            {activeTab === 'new_briefs' && '📥 New requests waiting for you'}
            {activeTab === 'in_progress' && '⚡ Work in progress'}
            {activeTab === 'feedback_revisions' && '🎨 Changes requested'}
          </h3>

          <div className="space-y-3">
            {activeTab === 'new_briefs' && newBriefs.length === 0 && (
              <div className="py-20 text-center text-slate-400 text-xs font-sans">
                Nothing new right now — you're all caught up!
              </div>
            )}
            {activeTab === 'in_progress' && tasksInProgress.length === 0 && (
              <div className="py-20 text-center text-slate-400 text-xs font-sans">
                No active production tasks. Go to "New Requests" to begin.
              </div>
            )}
            {activeTab === 'feedback_revisions' && feedbackRevisions.length === 0 && (
              <div className="py-20 text-center text-slate-400 text-xs font-sans">
                Great — no changes requested!
              </div>
            )}

            {/* Render Items */}
            {((activeTab === 'new_briefs' ? newBriefs : activeTab === 'in_progress' ? tasksInProgress : feedbackRevisions)).map(task => {
              const dels = deliverables.filter(d => d.Task_ID === task.Task_ID);
              const isSelected = selectedTask?.Task_ID === task.Task_ID;

              return (
                <div
                  key={task.Task_ID}
                  onClick={() => setSelectedTaskId(task.Task_ID)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col md:flex-row justify-between md:items-center gap-4 ${
                    isSelected
                      ? 'bg-slate-50 border-slate-300 shadow-2xs'
                      : 'bg-white border-slate-200 hover:bg-slate-50/80'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-bold uppercase">
                        {task.Asset_Type}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">ID: {task.Task_ID}</span>
                    </div>
                    <h4 className="font-sans font-bold text-sm text-slate-800">{task.Title}</h4>
                    <p className="text-[11px] text-slate-500 font-mono flex items-center gap-2">
                      Due: <span className="text-slate-700 font-bold">{task.Due_Date}</span>
                      {(() => {
                        const urgency = getDueUrgency(task);
                        return urgency ? (
                          <span className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            urgency.tone === 'overdue'
                              ? 'bg-rose-50 border-rose-200 text-rose-700'
                              : 'bg-amber-50 border-amber-200 text-amber-700'
                          }`}>
                            <Clock className="h-3 w-3 shrink-0" />
                            {urgency.label}
                          </span>
                        ) : null;
                      })()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                    {task.Status === 'Assigned' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartTask(task.Task_ID);
                        }}
                        className="py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold font-sans text-xs rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                      >
                        Accept & start
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {task.Status === 'In Progress' && (
                      <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded font-mono font-bold uppercase">
                        In Progress
                      </span>
                    )}

                    {task.Status === 'Delivered' && (
                      <span className="text-[10px] bg-blue-50 text-blue-800 border border-blue-200 px-2 py-1 rounded font-mono font-bold uppercase">
                        Waiting for review (v{dels.length})
                      </span>
                    )}

                    {task.Status === 'Approved' && (
                      <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-1 rounded font-mono font-bold uppercase flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Approved
                      </span>
                    )}

                    {task.Status === 'Needs Revision' && (
                      <span className="text-[10px] bg-rose-50 text-rose-800 border border-rose-200 px-2 py-1 rounded font-mono font-bold uppercase">
                        Changes requested
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Column 3: Active Brief Details & Action Panel */}
      <div className="lg:col-span-1">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs h-full flex flex-col justify-between min-h-[440px]">
          {selectedTask ? (
            <div className="flex-1 flex flex-col justify-between space-y-6">
              
              {/* Detailed specs */}
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">REQUEST DETAILS</span>
                    <h3 className="font-sans font-bold text-sm text-slate-800 mt-1 leading-snug">{selectedTask.Title}</h3>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 shrink-0 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                    {selectedTask.Task_ID}
                  </span>
                </div>

                {/* Specs Box */}
                <div className="space-y-2.5 bg-slate-50 border border-slate-200 p-4 rounded-lg text-xs font-sans text-slate-600">
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase block font-bold">Size:</span>
                    <span className="font-mono text-slate-800">{selectedTask.Dimensions}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase block font-bold mt-1.5">Brand guidelines:</span>
                    <span className="text-slate-800">{selectedTask.BrandGuidelines}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase block font-bold mt-1.5">What it must include:</span>
                    <span className="text-slate-800">{selectedTask.Requirements}</span>
                  </div>
                </div>

                {/* Submission Block */}
                {selectedTask.Status === 'In Progress' || selectedTask.Status === 'Needs Revision' ? (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-mono text-slate-500 uppercase tracking-wider font-bold">SEND YOUR DESIGN</h4>
                    
                    {!isSubmittingFile ? (
                      <button
                        onClick={() => setIsSubmittingFile(true)}
                        className="w-full py-2.5 border border-dashed border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-sans font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <UploadCloud className="h-4.5 w-4.5 text-slate-500" />
                        Send a design link
                      </button>
                    ) : (
                      <form onSubmit={handleSubmitFile} className="space-y-3 border border-slate-200 bg-slate-50 p-4 rounded-xl text-xs">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-mono text-[9px] font-bold text-slate-500">SEND A DESIGN</span>
                          <button
                            type="button"
                            onClick={() => setIsSubmittingFile(false)}
                            className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Autofill selectors */}
                        <div className="space-y-1">
                          <span className="text-[9px] text-slate-400 font-mono block">OR PICK A DEMO IMAGE:</span>
                          <div className="grid grid-cols-2 gap-1.5">
                            {UNSPASH_MOCK_ASSETS.map((asset, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => handleAutofillMockImage(asset)}
                                className="p-1.5 text-[9px] font-mono border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded text-left truncate cursor-pointer"
                              >
                                {asset.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Fields */}
                        <div className="space-y-1 mt-2">
                          <span className="text-slate-500 text-[10px] font-mono">FILE NAME</span>
                          <input
                            type="text"
                            required
                            placeholder="e.g., product_campaign_header.png"
                            value={submittedFileName}
                            onChange={(e) => setSubmittedFileName(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-800"
                          />
                        </div>

                        <div className="space-y-1">
                          <span className="text-slate-500 text-[10px] font-mono">LINK TO YOUR FILE (OneDrive / Drive / Dropbox)</span>
                          <input
                            type="text"
                            required
                            placeholder="https://images.unsplash.com/..."
                            value={submittedFileUrl}
                            onChange={(e) => setSubmittedFileUrl(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-800"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={isSubmitPending}
                          className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-xs cursor-pointer"
                        >
                          {isSubmitPending ? 'Sending...' : 'Send design'}
                        </button>
                      </form>
                    )}
                  </div>
                ) : null}

                {/* Feedback threads */}
                {taskDeliverables.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h4 className="text-[10px] font-mono text-slate-500 uppercase tracking-wider font-bold flex items-center gap-1">
                      <History className="h-3.5 w-3.5" />
                      Your designs & feedback
                    </h4>

                    <div className="space-y-2 max-h-[170px] overflow-y-auto pr-1">
                      {taskDeliverables.map(del => (
                        <div key={del.Deliverable_ID} className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 text-xs">
                          <div className="flex justify-between items-center text-[10px] font-mono text-slate-500">
                            <span className="truncate max-w-[140px]">{del.File_Name} (v{del.Version})</span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              del.Approval_Status === 'Approved' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' :
                              del.Approval_Status === 'Rejected' ? 'bg-rose-50 border border-rose-200 text-rose-700' :
                              'bg-amber-50 border border-amber-200 text-amber-700'
                            }`}>
                              {del.Approval_Status}
                            </span>
                          </div>

                          {/* AI Review trigger inside Vendor Portal */}
                          {del.Approval_Status === 'Pending' && (
                            <div className="space-y-2 pt-1">
                              <div className="text-[10px] text-slate-600 leading-relaxed bg-white border border-slate-200 p-2.5 rounded">
                                💡 Waiting for the client to review. Want a quick AI check first?
                              </div>
                              <div className="space-y-1 bg-white p-2.5 rounded-lg border border-slate-200">
                                <input
                                  type="text"
                                  placeholder="Anything specific to check? (optional)"
                                  value={aiSummaryInput}
                                  onChange={(e) => setAiSummaryInput(e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[11px] text-slate-800 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRequestAIArtDirectorReview(del.Deliverable_ID)}
                                  disabled={isAiLoading}
                                  className="w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] rounded flex items-center justify-center gap-1 transition-all cursor-pointer"
                                >
                                  <Sparkles className="h-3 w-3 text-amber-400" />
                                  {isAiLoading ? 'AI is checking...' : 'Check my design with AI'}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Comments list */}
                          {del.Feedback_History.length === 0 ? (
                            <div className="text-[10px] text-slate-400 font-mono text-center py-2">No comments yet.</div>
                          ) : (
                            <div className="space-y-2 divide-y divide-slate-100 pt-1">
                              {del.Feedback_History.map((fb: FeedbackItem) => (
                                <div key={fb.id} className="pt-2 text-[11px] leading-relaxed">
                                  <div className="flex justify-between items-center text-[10px] mb-0.5">
                                    <span className={`font-semibold flex items-center gap-1 ${fb.source === 'AI' ? 'text-amber-700 font-bold' : 'text-slate-800'}`}>
                                      {fb.source === 'AI' && '🤖'} {fb.reviewer}
                                    </span>
                                    <span className="text-slate-400 font-mono">{new Date(fb.date).toLocaleTimeString()}</span>
                                  </div>
                                  <div className="text-slate-600 whitespace-pre-wrap">{fb.comment}</div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Back-and-forth creative feedback reply */}
                          <div className="mt-3 pt-2.5 border-t border-slate-200">
                            <form
                              onSubmit={async (e) => {
                                e.preventDefault();
                                const text = replyInputs[del.Deliverable_ID] || '';
                                if (!text.trim()) return;
                                setIsReplySubmitting(prev => ({ ...prev, [del.Deliverable_ID]: true }));
                                try {
                                  await onPostFeedback(del.Deliverable_ID, text.trim());
                                  setReplyInputs(prev => ({ ...prev, [del.Deliverable_ID]: '' }));
                                } finally {
                                  setIsReplySubmitting(prev => ({ ...prev, [del.Deliverable_ID]: false }));
                                }
                              }}
                              className="flex gap-1.5"
                            >
                              <input
                                type="text"
                                placeholder="Write a reply..."
                                value={replyInputs[del.Deliverable_ID] || ''}
                                onChange={(e) => setReplyInputs(prev => ({ ...prev, [del.Deliverable_ID]: e.target.value }))}
                                disabled={isReplySubmitting[del.Deliverable_ID]}
                                className="flex-1 bg-white border border-slate-200 rounded px-2.5 py-1 text-[11px] text-slate-800 focus:outline-none focus:border-slate-400 placeholder:text-slate-400 disabled:opacity-50"
                              />
                              <button
                                type="submit"
                                disabled={isReplySubmitting[del.Deliverable_ID] || !(replyInputs[del.Deliverable_ID]?.trim())}
                                className="px-3 py-1 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-bold text-[11px] rounded transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
                              >
                                {isReplySubmitting[del.Deliverable_ID] ? 'Sending...' : 'Send Reply'}
                              </button>
                            </form>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Status footer button to manually mark as In Progress if assigned */}
              {selectedTask.Status === 'Assigned' && (
                <button
                  onClick={() => handleStartTask(selectedTask.Task_ID)}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg"
                >
                  Accept & start
                </button>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
              <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 mb-3 text-slate-400">
                <Inbox className="h-6 w-6 text-slate-400" />
              </div>
              <h4 className="font-sans font-bold text-xs text-slate-700">Nothing selected</h4>
              <p className="text-[11px] text-slate-400 max-w-xs mt-1 leading-normal">
                Click a request on the left to see its details and send your design.
              </p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
