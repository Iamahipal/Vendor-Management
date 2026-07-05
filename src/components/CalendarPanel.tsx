import { useState, FormEvent } from 'react';
import {
  Communication, CommsChannel, Vendor, Task,
  COMMS_CHANNELS, SLOT_TIMES, CHANNEL_ASSET_TYPE, CommStatus
} from '../types';
import { CalendarDays, Plus, X, Clock, Building2, Palette, Send, CheckCircle2, Trash2 } from 'lucide-react';

interface CalendarPanelProps {
  communications: Communication[];
  vendors: Vendor[];
  tasks: Task[];
  onBook: (fields: Record<string, unknown>) => Promise<boolean>;
  onEdit: (id: string, fields: Record<string, unknown>) => Promise<boolean>;
  onCancel: (id: string) => Promise<boolean>;
  onCreateTask: (id: string, vendorId: string) => Promise<boolean>;
  onMarkReady: (id: string, creativeLink?: string) => Promise<boolean>;
  onHandoff: (id: string, fields: Record<string, unknown>) => Promise<boolean>;
  onOpenTask: (taskId: string) => void;
}

const STATUS_STYLE: Record<CommStatus, string> = {
  'Booked': 'bg-slate-100 text-slate-700 border-slate-200',
  'In Design': 'bg-amber-50 text-amber-800 border-amber-200',
  'Ready': 'bg-blue-50 text-blue-800 border-blue-200',
  'Handed Off': 'bg-violet-50 text-violet-800 border-violet-200',
  'Released': 'bg-emerald-50 text-emerald-800 border-emerald-200',
  'Cancelled': 'bg-slate-50 text-slate-400 border-slate-200',
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_BOOKING = {
  Channel: 'Email' as CommsChannel,
  Release_Date: '',
  Release_Time: SLOT_TIMES[0],
  Department: '',
  Campaign_Name: '',
  Subject_Line: '',
  Comms_SPOC: '',
  Business_SPOC: '',
  Audience: 'All Employees',
  Language: 'English',
};

export default function CalendarPanel({
  communications, vendors, tasks, onBook, onEdit, onCancel, onCreateTask, onMarkReady, onHandoff, onOpenTask,
}: CalendarPanelProps) {
  const [showBook, setShowBook] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ ...EMPTY_BOOKING });
  const [busy, setBusy] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');

  const active = communications.filter(c => c.Status !== 'Cancelled');
  const filtered = communications.filter(c => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'ACTIVE') return c.Status !== 'Cancelled' && c.Status !== 'Released';
    return c.Status === statusFilter;
  });

  // Group by date, upcoming first
  const byDate = new Map<string, Communication[]>();
  filtered
    .slice()
    .sort((a, b) => (a.Release_Date + a.Release_Time).localeCompare(b.Release_Date + b.Release_Time))
    .forEach(c => {
      const arr = byDate.get(c.Release_Date) ?? [];
      arr.push(c);
      byDate.set(c.Release_Date, arr);
    });

  const detail = detailId ? communications.find(c => c.Comm_ID === detailId) ?? null : null;

  const openBook = () => {
    setForm({ ...EMPTY_BOOKING, Release_Date: todayISO() });
    setShowBook(true);
  };

  const submitBook = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await onBook({ ...form });
    setBusy(false);
    if (ok) setShowBook(false);
  };

  const dateLabel = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          Book every internal communication into a slot before anything else. {active.length} active on the calendar.
        </p>
        <div className="flex items-center gap-2">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 outline-none cursor-pointer">
            <option value="ACTIVE">Active</option>
            <option value="ALL">All</option>
            <option value="Booked">Booked</option>
            <option value="In Design">In design</option>
            <option value="Ready">Ready</option>
            <option value="Handed Off">Handed off</option>
            <option value="Released">Released</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          <button onClick={openBook}
            className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-lg flex items-center gap-2 transition-all cursor-pointer shrink-0">
            <Plus className="h-4 w-4" />
            Book a slot
          </button>
        </div>
      </div>

      {/* Agenda grouped by date */}
      {byDate.size === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400 text-sm">
          No communications here. Click "Book a slot" to add one.
        </div>
      ) : (
        <div className="space-y-4">
          {[...byDate.entries()].map(([date, items]) => (
            <div key={date} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-sm font-bold text-slate-700">
                {dateLabel(date)}
              </div>
              <div className="divide-y divide-slate-100">
                {items.map(c => (
                  <button
                    key={c.Comm_ID}
                    onClick={() => setDetailId(c.Comm_ID)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-1 text-xs font-mono text-slate-500 w-14 shrink-0">
                      <Clock className="h-3 w-3" />{c.Release_Time}
                    </span>
                    <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded shrink-0 w-32 truncate">{c.Channel}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-sm text-slate-800 truncate">{c.Campaign_Name}</span>
                      <span className="block text-xs text-slate-400 truncate">{c.Department || '—'} · {c.Subject_Line}</span>
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold border whitespace-nowrap shrink-0 ${STATUS_STYLE[c.Status]}`}>{c.Status}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Book-a-slot modal */}
      {showBook && (
        <BookingForm
          title="Book a slot"
          form={form}
          setForm={setForm}
          vendors={vendors}
          busy={busy}
          onClose={() => setShowBook(false)}
          onSubmit={submitBook}
        />
      )}

      {/* Detail drawer */}
      {detail && (
        <CommDetail
          comm={detail}
          vendors={vendors}
          tasks={tasks}
          onClose={() => setDetailId(null)}
          onEdit={onEdit}
          onCancel={onCancel}
          onCreateTask={onCreateTask}
          onMarkReady={onMarkReady}
          onHandoff={onHandoff}
          onOpenTask={onOpenTask}
        />
      )}
    </div>
  );
}

// ---- Booking create/edit form ----
function BookingForm({ title, form, setForm, vendors: _v, busy, onClose, onSubmit }: {
  title: string;
  form: Record<string, string>;
  setForm: (f: Record<string, string>) => void;
  vendors: Vendor[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
}) {
  const set = (k: string, v: string) => setForm({ ...form, [k]: v });
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-slide-in flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-3 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Channel *</label>
              <select value={form.Channel} onChange={e => set('Channel', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none cursor-pointer">
                {COMMS_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {CHANNEL_ASSET_TYPE[form.Channel as CommsChannel] && (
                <p className="text-[11px] text-violet-600">Needs a creative — you can spin off a design task after booking.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-slate-600 text-xs font-semibold">Date *</label>
                <input type="date" required value={form.Release_Date} onChange={e => set('Release_Date', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-sm text-slate-800 outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-slate-600 text-xs font-semibold">Time *</label>
                <select value={form.Release_Time} onChange={e => set('Release_Time', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-sm text-slate-800 outline-none cursor-pointer">
                  {SLOT_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-slate-600 text-xs font-semibold">Campaign name *</label>
              <input type="text" required value={form.Campaign_Name} onChange={e => set('Campaign_Name', e.target.value)}
                placeholder="e.g., Diwali Celebration Emailer"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-slate-600 text-xs font-semibold">Subject line *</label>
              <input type="text" required value={form.Subject_Line} onChange={e => set('Subject_Line', e.target.value)}
                placeholder="What employees will see"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400" />
            </div>
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Requesting team</label>
              <input type="text" value={form.Department} onChange={e => set('Department', e.target.value)}
                placeholder="e.g., HR, L&D, Infosec"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400" />
            </div>
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Business SPOC</label>
              <input type="text" value={form.Business_SPOC} onChange={e => set('Business_SPOC', e.target.value)}
                placeholder="Requester-side owner"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400" />
            </div>
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Audience</label>
              <select value={form.Audience} onChange={e => set('Audience', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none cursor-pointer">
                <option>All Employees</option>
                <option>Targeted</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Language</label>
              <select value={form.Language} onChange={e => set('Language', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none cursor-pointer">
                <option>English</option>
                <option>Vernacular</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} disabled={busy}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={busy}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-bold cursor-pointer disabled:opacity-50">
              {busy ? 'Saving...' : 'Book slot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Communication detail drawer ----
function CommDetail({ comm, vendors, tasks, onClose, onEdit, onCancel, onCreateTask, onMarkReady, onHandoff, onOpenTask }: {
  comm: Communication;
  vendors: Vendor[];
  tasks: Task[];
  onClose: () => void;
  onEdit: (id: string, fields: Record<string, unknown>) => Promise<boolean>;
  onCancel: (id: string) => Promise<boolean>;
  onCreateTask: (id: string, vendorId: string) => Promise<boolean>;
  onMarkReady: (id: string, creativeLink?: string) => Promise<boolean>;
  onHandoff: (id: string, fields: Record<string, unknown>) => Promise<boolean>;
  onOpenTask: (taskId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [vendorId, setVendorId] = useState(vendors[0]?.Vendor_ID ?? '');
  const [creativeLink, setCreativeLink] = useState(comm.Creative_Link ?? '');
  const [senderId, setSenderId] = useState(comm.Sender_ID ?? '');
  const [ctaText, setCtaText] = useState(comm.CTA_Text ?? '');
  const [ctaLink, setCtaLink] = useState(comm.CTA_Link ?? '');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const linkedTask = comm.Linked_Task_ID ? tasks.find(t => t.Task_ID === comm.Linked_Task_ID) : null;
  const needsCreative = !!CHANNEL_ASSET_TYPE[comm.Channel];
  const run = async (fn: () => Promise<boolean>) => { setBusy(true); const ok = await fn(); setBusy(false); return ok; };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-slide-in flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-start gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-slate-600 bg-slate-200/70 px-2 py-0.5 rounded">{comm.Channel}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold border ${STATUS_STYLE[comm.Status]}`}>{comm.Status}</span>
            </div>
            <h3 className="font-bold text-slate-900 text-base leading-snug break-words">{comm.Campaign_Name}</h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{comm.Release_Date} · {comm.Release_Time}</span>
              {comm.Department && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{comm.Department}</span>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close booking details"
            className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-600">
            <div><span className="text-xs text-slate-400 block">Subject</span>{comm.Subject_Line}</div>
            <div><span className="text-xs text-slate-400 block">Audience</span>{comm.Audience}</div>
            <div><span className="text-xs text-slate-400 block">Language</span>{comm.Language}</div>
            <div><span className="text-xs text-slate-400 block">Business SPOC</span>{comm.Business_SPOC || '—'}</div>
            <div><span className="text-xs text-slate-400 block">Comms SPOC</span>{comm.Comms_SPOC}</div>
            {comm.Sender_ID && <div><span className="text-xs text-slate-400 block">Sender ID</span>{comm.Sender_ID}</div>}
          </div>

          {/* Stage-specific actions */}
          {comm.Status !== 'Released' && comm.Status !== 'Cancelled' && (
            <div className="space-y-3">
              {/* Linked creative */}
              {linkedTask ? (
                <button onClick={() => { onClose(); onOpenTask(linkedTask.Task_ID); }}
                  className="w-full flex items-center justify-between gap-2 p-3 bg-white border border-slate-200 hover:border-slate-300 rounded-lg transition-all cursor-pointer">
                  <span className="flex items-center gap-2 text-slate-700"><Palette className="h-4 w-4 text-slate-400" />Design task: {linkedTask.Title}</span>
                  <span className="text-xs font-bold text-slate-500">{linkedTask.Status}</span>
                </button>
              ) : needsCreative && comm.Status === 'Booked' ? (
                <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-bold text-violet-900 flex items-center gap-1.5"><Palette className="h-4 w-4" />This channel needs a creative — brief a vendor:</div>
                  <div className="flex gap-2">
                    <select value={vendorId} onChange={e => setVendorId(e.target.value)}
                      className="flex-1 bg-white border border-violet-200 rounded-lg px-2 py-1.5 text-sm text-slate-800 outline-none cursor-pointer">
                      {vendors.map(v => <option key={v.Vendor_ID} value={v.Vendor_ID}>{v.Company_Name}</option>)}
                    </select>
                    <button disabled={busy} onClick={() => run(() => onCreateTask(comm.Comm_ID, vendorId))}
                      className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-lg cursor-pointer disabled:opacity-50 whitespace-nowrap">
                      Create design task
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Mark ready (no creative needed, or skip) */}
              {(comm.Status === 'Booked' || comm.Status === 'In Design') && (
                <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
                  <label className="text-xs font-semibold text-slate-600">Final creative link (OneDrive / Drive)</label>
                  <input type="text" value={creativeLink} onChange={e => setCreativeLink(e.target.value)}
                    placeholder="https://onedrive.com/..."
                    className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-slate-400" />
                  <button disabled={busy} onClick={() => run(() => onMarkReady(comm.Comm_ID, creativeLink))}
                    className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50">
                    <CheckCircle2 className="h-4 w-4" />Mark ready to release
                  </button>
                </div>
              )}

              {/* Handoff to release SPOC */}
              {comm.Status === 'Ready' && (
                <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-bold text-violet-900 flex items-center gap-1.5"><Send className="h-4 w-4" />Hand off to the release SPOC</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={senderId} onChange={e => setSenderId(e.target.value)} placeholder="Sender ID"
                      className="bg-white border border-violet-200 rounded px-2 py-1.5 text-sm outline-none" />
                    <input type="text" value={creativeLink} onChange={e => setCreativeLink(e.target.value)} placeholder="Creative link"
                      className="bg-white border border-violet-200 rounded px-2 py-1.5 text-sm outline-none" />
                    <input type="text" value={ctaText} onChange={e => setCtaText(e.target.value)} placeholder="CTA text"
                      className="bg-white border border-violet-200 rounded px-2 py-1.5 text-sm outline-none" />
                    <input type="text" value={ctaLink} onChange={e => setCtaLink(e.target.value)} placeholder="CTA link"
                      className="bg-white border border-violet-200 rounded px-2 py-1.5 text-sm outline-none" />
                  </div>
                  <button disabled={busy} onClick={() => run(() => onHandoff(comm.Comm_ID, { Sender_ID: senderId, Creative_Link: creativeLink, CTA_Text: ctaText, CTA_Link: ctaLink }).then(ok => { if (ok) onClose(); return ok; }))}
                    className="w-full py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50">
                    <Send className="h-4 w-4" />Send to release SPOC
                  </button>
                </div>
              )}
            </div>
          )}

          {comm.Status === 'Handed Off' && (
            <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-sm text-violet-800">
              📤 Handed off to the release SPOC — waiting for release. You can still edit details if needed.
            </div>
          )}
          {comm.Status === 'Released' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
              ✅ Released{comm.Released_By ? ` by ${comm.Released_By}` : ''}{comm.Released_At ? ` on ${new Date(comm.Released_At).toLocaleString()}` : ''}.
            </div>
          )}

          {/* Cancel */}
          {comm.Status !== 'Released' && comm.Status !== 'Cancelled' && (
            <div className="pt-2 border-t border-slate-100">
              {confirmCancel ? (
                <div className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 rounded-lg p-3">
                  <span className="text-sm text-rose-800 font-medium">Cancel this booking? It stays in history.</span>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setConfirmCancel(false)} disabled={busy} className="px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-white rounded-lg cursor-pointer">Keep</button>
                    <button onClick={() => run(() => onCancel(comm.Comm_ID).then(ok => { if (ok) onClose(); return ok; }))} disabled={busy}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-lg cursor-pointer disabled:opacity-50">Cancel booking</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmCancel(true)} className="text-sm text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1.5 cursor-pointer">
                  <Trash2 className="h-4 w-4" />Cancel this booking
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
