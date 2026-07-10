import { useState, FormEvent } from 'react';
import { Task, Deliverable, Vendor, getDueUrgency } from '../types';
import { Portal } from './Modal';
import { Select, DatePicker } from './Field';
import { X, Pencil, Trash2, Clock, User, MessageSquare, FileCode, Eye } from 'lucide-react';

interface TaskDetailModalProps {
  task: Task;
  vendors: Vendor[];
  deliverables: Deliverable[]; // this task's designs, oldest first
  onClose: () => void;
  onEdit: (taskId: string, fields: Record<string, string>) => Promise<boolean>;
  onDelete: (taskId: string) => Promise<boolean>;
  onPostComment: (taskId: string, comment: string) => Promise<boolean>;
  onOpenDeliverable: (del: Deliverable) => void;
}

// Full view of a request: details, edit/cancel, question thread, versions.
export default function TaskDetailModal({
  task,
  vendors,
  deliverables,
  onClose,
  onEdit,
  onDelete,
  onPostComment,
  onOpenDeliverable,
}: TaskDetailModalProps) {
  const [editMode, setEditMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  // Edit form state
  const [title, setTitle] = useState(task.Title);
  const [dueDate, setDueDate] = useState(task.Due_Date);
  const [vendorId, setVendorId] = useState(task.Assigned_Vendor_ID);
  const [dimensions, setDimensions] = useState(task.Dimensions);
  const [guidelines, setGuidelines] = useState(task.BrandGuidelines);
  const [requirements, setRequirements] = useState(task.Requirements);

  // Question thread state
  const [commentInput, setCommentInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const vendorName = vendors.find(v => v.Vendor_ID === task.Assigned_Vendor_ID)?.Company_Name || 'Unknown vendor';
  const urgency = getDueUrgency(task);
  const comments = task.Comments ?? [];
  const latestDel = deliverables[deliverables.length - 1];

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await onEdit(task.Task_ID, {
      Title: title,
      Due_Date: dueDate,
      Assigned_Vendor_ID: vendorId,
      Dimensions: dimensions,
      BrandGuidelines: guidelines,
      Requirements: requirements,
    });
    setBusy(false);
    if (ok) setEditMode(false);
  };

  const handleDelete = async () => {
    setBusy(true);
    const ok = await onDelete(task.Task_ID);
    setBusy(false);
    if (ok) onClose();
  };

  const handleSendComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim()) return;
    setIsSending(true);
    const ok = await onPostComment(task.Task_ID, commentInput.trim());
    setIsSending(false);
    if (ok) setCommentInput('');
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl ring-1 ring-slate-900/5 overflow-hidden animate-slide-in flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-start gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-slate-600 bg-slate-200/70 px-1.5 py-0.5 rounded">{task.Asset_Type}</span>
              {urgency && (
                <span className={`flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded border ${
                  urgency.tone === 'overdue' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-amber-50 border-amber-200 text-amber-700'
                }`}>
                  <Clock className="h-3 w-3" />
                  {urgency.label}
                </span>
              )}
            </div>
            <h3 className="font-sans font-bold text-slate-900 text-base leading-snug break-words">{task.Title}</h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
              <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{vendorName}</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Due {task.Due_Date}</span>
              <span className="font-semibold text-slate-600">{task.Status}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!editMode && (
              <button
                onClick={() => setEditMode(true)}
                className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
                title="Edit request"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close request details"
              className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {editMode ? (
            /* ---- Edit form ---- */
            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-slate-600 text-xs font-semibold">Title</label>
                <input type="text" required value={title} onChange={e => setTitle(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-slate-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-600 text-xs font-semibold">Due date</label>
                  <DatePicker value={dueDate} onChange={setDueDate} />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-600 text-xs font-semibold">Vendor</label>
                  <Select value={vendorId} onChange={setVendorId}
                    options={vendors.map(v => ({ value: v.Vendor_ID, label: v.Company_Name }))} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-slate-600 text-xs font-semibold">Size</label>
                <input type="text" value={dimensions} onChange={e => setDimensions(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-slate-600 text-xs font-semibold">Brand guidelines</label>
                <textarea rows={2} value={guidelines} onChange={e => setGuidelines(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-slate-600 text-xs font-semibold">What it must include</label>
                <textarea rows={2} value={requirements} onChange={e => setRequirements(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none" />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" disabled={busy} onClick={() => setEditMode(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={busy}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-bold cursor-pointer disabled:opacity-50">
                  {busy ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          ) : (
            /* ---- Read-only details ---- */
            <>
              <div className="space-y-2.5 bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm text-slate-600">
                <div>
                  <span className="text-xs text-slate-400 uppercase block font-bold">Size</span>
                  <span className="text-slate-800">{task.Dimensions}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 uppercase block font-bold mt-1">Brand guidelines</span>
                  <span className="text-slate-800">{task.BrandGuidelines}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 uppercase block font-bold mt-1">What it must include</span>
                  <span className="text-slate-800">{task.Requirements}</span>
                </div>
              </div>

              {/* Designs sent so far */}
              {deliverables.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs text-slate-500 uppercase tracking-wider font-bold flex items-center gap-1.5">
                    <FileCode className="h-3.5 w-3.5" />
                    Designs sent ({deliverables.length})
                  </h4>
                  {task.Status === 'Delivered' && latestDel && (
                    <button
                      onClick={() => onOpenDeliverable(latestDel)}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <Eye className="h-4 w-4" />
                      Review the latest design now
                    </button>
                  )}
                  <div className="space-y-1.5">
                    {deliverables.map(del => (
                      <button
                        key={del.Deliverable_ID}
                        onClick={() => onOpenDeliverable(del)}
                        className="w-full flex items-center justify-between gap-2 p-2.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-lg text-sm transition-all cursor-pointer"
                      >
                        <span className="truncate text-slate-700">v{del.Version} — {del.File_Name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-bold shrink-0 ${
                          del.Approval_Status === 'Approved' ? 'bg-emerald-50 text-emerald-700' :
                          del.Approval_Status === 'Rejected' ? 'bg-rose-50 text-rose-700' :
                          'bg-amber-50 text-amber-700'
                        }`}>
                          {del.Approval_Status === 'Pending' ? 'Waiting' : del.Approval_Status}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Questions & notes thread */}
              <div className="space-y-2">
                <h4 className="text-xs text-slate-500 uppercase tracking-wider font-bold flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Questions & notes ({comments.length})
                </h4>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5 max-h-[180px] overflow-y-auto">
                  {comments.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-2">No notes yet — anything you write here goes straight to the vendor.</p>
                  ) : (
                    comments.map(c => (
                      <div key={c.id} className="text-sm">
                        <div className="flex justify-between items-center text-xs mb-0.5">
                          <span className="font-semibold text-slate-700">{c.reviewer}</span>
                          <span className="text-slate-400">{new Date(c.date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-slate-600 whitespace-pre-wrap">{c.comment}</p>
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={handleSendComment} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Write a question or note for the vendor..."
                    value={commentInput}
                    onChange={e => setCommentInput(e.target.value)}
                    disabled={isSending}
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-slate-400 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isSending || !commentInput.trim()}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    {isSending ? '...' : 'Send'}
                  </button>
                </form>
              </div>

              {/* Cancel request */}
              <div className="pt-2 border-t border-slate-100">
                {confirmDelete ? (
                  <div className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 rounded-lg p-3">
                    <span className="text-sm text-rose-800 font-medium">Cancel this request for good? The vendor will be notified.</span>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => setConfirmDelete(false)} disabled={busy}
                        className="px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-white rounded-lg cursor-pointer">
                        Keep it
                      </button>
                      <button onClick={handleDelete} disabled={busy}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-lg cursor-pointer disabled:opacity-50">
                        {busy ? 'Cancelling...' : 'Yes, cancel it'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-sm text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                    Cancel this request
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    </Portal>
  );
}
