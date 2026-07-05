import { useState, FormEvent } from 'react';
import {
  Communication, CommsChannel, Vendor, Task, WeeklyPlacement, Webinar,
  COMMS_CHANNELS, CHANNEL_ASSET_TYPE, CommStatus, CHANNEL_RULES, slotsForDate,
  AUDIENCES, COMM_SUBTYPES, COMM_CATEGORIES, COMM_LANGUAGES, CommCategory, CommSubType
} from '../types';
import WeeklyPlacementsPanel from './WeeklyPlacementsPanel';
import WebinarsPanel from './WebinarsPanel';
import {
  CalendarDays, Plus, X, Clock, Building2, Palette, Send, CheckCircle2, Trash2,
  ChevronLeft, ChevronRight, Ban, LayoutList, Grid3x3, ImageIcon, Video, BarChart3, AlertTriangle
} from 'lucide-react';

interface CalendarPanelProps {
  communications: Communication[];
  placements: WeeklyPlacement[];
  webinars: Webinar[];
  vendors: Vendor[];
  tasks: Task[];
  onBook: (fields: Record<string, unknown>) => Promise<boolean>;
  onEdit: (id: string, fields: Record<string, unknown>) => Promise<boolean>;
  onCancel: (id: string) => Promise<boolean>;
  onCreateTask: (id: string, vendorId: string) => Promise<boolean>;
  onMarkReady: (id: string, creativeLink?: string) => Promise<boolean>;
  onHandoff: (id: string, fields: Record<string, unknown>) => Promise<boolean>;
  onOpenTask: (taskId: string) => void;
  onAddPlacement: (fields: Record<string, unknown>) => Promise<boolean>;
  onEditPlacement: (id: string, fields: Record<string, unknown>) => Promise<boolean>;
  onDeletePlacement: (id: string) => Promise<boolean>;
  onAddWebinar: (fields: Record<string, unknown>) => Promise<boolean>;
  onDeleteWebinar: (id: string) => Promise<boolean>;
}

const STATUS_STYLE: Record<CommStatus, string> = {
  'Booked': 'bg-slate-100 text-slate-700 border-slate-200',
  'In Design': 'bg-amber-50 text-amber-800 border-amber-200',
  'Ready': 'bg-blue-50 text-blue-800 border-blue-200',
  'Handed Off': 'bg-violet-50 text-violet-800 border-violet-200',
  'Released': 'bg-emerald-50 text-emerald-800 border-emerald-200',
  'Cancelled': 'bg-slate-50 text-slate-400 border-slate-200',
};

function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
}

interface BookingPreset { channel?: CommsChannel; time?: string; date?: string; block?: boolean }

export default function CalendarPanel(props: CalendarPanelProps) {
  const { communications, placements, webinars, vendors, tasks } = props;
  const [tab, setTab] = useState<'day' | 'agenda' | 'weekly' | 'webinars' | 'report'>('day');
  const [gridDate, setGridDate] = useState(todayISO());
  const [showBook, setShowBook] = useState<BookingPreset | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');

  const active = communications.filter(c => c.Status !== 'Cancelled');
  const detail = detailId ? communications.find(c => c.Comm_ID === detailId) ?? null : null;

  const dateLabel = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const shortDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  // Bookings for the selected day, keyed by "time|channel"
  const dayBookings = active.filter(c => c.Release_Date === gridDate);
  const bookingAt = (time: string, channel: CommsChannel) => dayBookings.find(c => c.Release_Time === time && c.Channel === channel);
  const slots = slotsForDate(gridDate);
  // Any extra bookings that day not matching a fixed slot (e.g. extra Mail)
  const extraBookings = dayBookings.filter(c => !slots.some(s => s.time === c.Release_Time && s.channel === c.Channel));

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
        {([
          ['day', 'Day view', Grid3x3],
          ['agenda', 'Agenda', LayoutList],
          ['weekly', 'Wallpaper & Banners', ImageIcon],
          ['webinars', 'Webinars', Video],
          ['report', 'Report', BarChart3],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`py-1.5 px-3 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              tab === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ---- DAY GRID ---- */}
      {tab === 'day' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setGridDate(addDays(gridDate, -1))} className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"><ChevronLeft className="h-4 w-4" /></button>
              <input type="date" value={gridDate} onChange={e => setGridDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-800 outline-none" />
              <button onClick={() => setGridDate(addDays(gridDate, 1))} className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"><ChevronRight className="h-4 w-4" /></button>
              <button onClick={() => setGridDate(todayISO())} className="px-3 py-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 cursor-pointer">Today</button>
            </div>
            <span className="text-sm font-bold text-slate-700">{dateLabel(gridDate)}</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 shadow-xs overflow-hidden">
            {slots.map((s, i) => {
              const b = bookingAt(s.time, s.channel);
              return (
                <div key={`${s.time}-${s.channel}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex items-center gap-1 text-xs font-mono text-slate-500 w-14 shrink-0"><Clock className="h-3 w-3" />{s.time}</span>
                  <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded shrink-0 w-32 truncate">{s.channel}</span>
                  {b ? (
                    <button onClick={() => setDetailId(b.Comm_ID)} className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer group">
                      {b.Blocked ? (
                        <span className="text-sm text-slate-400 italic flex items-center gap-1"><Ban className="h-3.5 w-3.5" />Blocked</span>
                      ) : (
                        <>
                          <span className="block font-semibold text-sm text-slate-800 truncate group-hover:text-slate-950">{b.Campaign_Name}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border whitespace-nowrap shrink-0 ${STATUS_STYLE[b.Status]}`}>{b.Status}</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="flex-1 flex items-center gap-2">
                      <button onClick={() => setShowBook({ channel: s.channel, time: s.time, date: gridDate })}
                        className="text-sm font-semibold text-slate-400 hover:text-slate-900 flex items-center gap-1 cursor-pointer">
                        <Plus className="h-3.5 w-3.5" />Book
                      </button>
                      <button onClick={() => setShowBook({ channel: s.channel, time: s.time, date: gridDate, block: true })}
                        className="text-xs text-slate-300 hover:text-amber-600 flex items-center gap-1 cursor-pointer">
                        <Ban className="h-3 w-3" />Block
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {extraBookings.map(b => (
              <div key={b.Comm_ID} className="flex items-center gap-3 px-4 py-2.5 bg-slate-50/50">
                <span className="flex items-center gap-1 text-xs font-mono text-slate-500 w-14 shrink-0"><Clock className="h-3 w-3" />{b.Release_Time}</span>
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded shrink-0 w-32 truncate">{b.Channel}</span>
                <button onClick={() => setDetailId(b.Comm_ID)} className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer">
                  <span className="block font-semibold text-sm text-slate-800 truncate">{b.Campaign_Name}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold border whitespace-nowrap shrink-0 ${STATUS_STYLE[b.Status]}`}>{b.Status}</span>
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => setShowBook({ date: gridDate })}
            className="text-sm font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer">
            <Plus className="h-4 w-4" />Add another booking (any channel/time)
          </button>
        </div>
      )}

      {/* ---- AGENDA ---- */}
      {tab === 'agenda' && (
        <AgendaView communications={communications} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
          onOpen={setDetailId} onBook={() => setShowBook({ date: todayISO() })} shortDate={shortDate} />
      )}

      {/* ---- WEEKLY PLACEMENTS ---- */}
      {tab === 'weekly' && (
        <WeeklyPlacementsPanel placements={placements} onAdd={props.onAddPlacement} onEdit={props.onEditPlacement} onDelete={props.onDeletePlacement} />
      )}

      {/* ---- WEBINARS ---- */}
      {tab === 'webinars' && (
        <WebinarsPanel webinars={webinars} onAdd={props.onAddWebinar} onDelete={props.onDeleteWebinar} />
      )}

      {/* ---- REPORT ---- */}
      {tab === 'report' && <ReportView communications={communications} />}

      {/* Booking modal */}
      {showBook && (
        <BookingForm preset={showBook} onClose={() => setShowBook(null)}
          onBook={async (fields) => { const ok = await props.onBook(fields); if (ok) setShowBook(null); return ok; }} />
      )}

      {/* Detail drawer */}
      {detail && (
        <CommDetail comm={detail} vendors={vendors} tasks={tasks} onClose={() => setDetailId(null)}
          onCancel={props.onCancel} onCreateTask={props.onCreateTask} onMarkReady={props.onMarkReady}
          onHandoff={props.onHandoff} onOpenTask={props.onOpenTask} />
      )}
    </div>
  );
}

// ---- Agenda view ----
function AgendaView({ communications, statusFilter, setStatusFilter, onOpen, onBook, shortDate }: {
  communications: Communication[]; statusFilter: string; setStatusFilter: (s: string) => void;
  onOpen: (id: string) => void; onBook: () => void; shortDate: (iso: string) => string;
}) {
  const filtered = communications.filter(c => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'ACTIVE') return c.Status !== 'Cancelled' && c.Status !== 'Released';
    return c.Status === statusFilter;
  });
  const byDate = new Map<string, Communication[]>();
  filtered.slice().sort((a, b) => (a.Release_Date + a.Release_Time).localeCompare(b.Release_Date + b.Release_Time))
    .forEach(c => { const arr = byDate.get(c.Release_Date) ?? []; arr.push(c); byDate.set(c.Release_Date, arr); });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 outline-none cursor-pointer">
          <option value="ACTIVE">Active</option><option value="ALL">All</option>
          <option value="Booked">Booked</option><option value="In Design">In design</option>
          <option value="Ready">Ready</option><option value="Handed Off">Handed off</option>
          <option value="Released">Released</option><option value="Cancelled">Cancelled</option>
        </select>
        <button onClick={onBook} className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-lg flex items-center gap-2 cursor-pointer">
          <Plus className="h-4 w-4" />Book a slot
        </button>
      </div>
      {byDate.size === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400 text-sm">Nothing here.</div>
      ) : [...byDate.entries()].map(([date, items]) => (
        <div key={date} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-sm font-bold text-slate-700">{shortDate(date)}</div>
          <div className="divide-y divide-slate-100">
            {items.map(c => (
              <button key={c.Comm_ID} onClick={() => onOpen(c.Comm_ID)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left cursor-pointer">
                <span className="flex items-center gap-1 text-xs font-mono text-slate-500 w-14 shrink-0"><Clock className="h-3 w-3" />{c.Release_Time}</span>
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
  );
}

// ---- Report: channel × category ----
function ReportView({ communications }: { communications: Communication[] }) {
  const cats: CommCategory[] = [...COMM_CATEGORIES];
  const rows = COMMS_CHANNELS.map(ch => {
    const items = communications.filter(c => c.Channel === ch && c.Status !== 'Cancelled');
    const counts = cats.map(cat => items.filter(c => c.Category === cat).length);
    const uncat = items.filter(c => !c.Category).length;
    return { ch, counts, uncat, total: items.length };
  }).filter(r => r.total > 0);
  const totalAll = rows.reduce((a, r) => a + r.total, 0);

  return (
    <div className="space-y-3 animate-fade-in">
      <p className="text-sm text-slate-500 flex items-center gap-2"><BarChart3 className="h-4 w-4" />Campaigns by channel and priority (excludes cancelled).</p>
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-xs">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 bg-slate-50 text-xs uppercase">
              <th className="p-3 text-left font-semibold">Channel</th>
              {cats.map(c => <th key={c} className="p-3 text-center font-semibold">{c}</th>)}
              <th className="p-3 text-center font-semibold">Uncategorised</th>
              <th className="p-3 text-center font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {rows.length === 0 ? (
              <tr><td colSpan={cats.length + 3} className="p-6 text-center text-slate-400">No communications yet.</td></tr>
            ) : rows.map(r => (
              <tr key={r.ch} className="hover:bg-slate-50">
                <td className="p-3 font-semibold text-slate-900">{r.ch}</td>
                {r.counts.map((n, i) => <td key={i} className="p-3 text-center">{n || '—'}</td>)}
                <td className="p-3 text-center text-slate-400">{r.uncat || '—'}</td>
                <td className="p-3 text-center font-bold">{r.total}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-bold text-slate-900">
                <td className="p-3">Grand total</td>
                {cats.map(cat => <td key={cat} className="p-3 text-center">{rows.reduce((a, r) => a + r.counts[cats.indexOf(cat)], 0)}</td>)}
                <td className="p-3 text-center">{rows.reduce((a, r) => a + r.uncat, 0)}</td>
                <td className="p-3 text-center">{totalAll}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ---- Booking create form (with richer fields + soft rule warnings) ----
function BookingForm({ preset, onClose, onBook }: {
  preset: BookingPreset; onClose: () => void; onBook: (fields: Record<string, unknown>) => Promise<boolean>;
}) {
  const isBlock = preset.block === true;
  const [busy, setBusy] = useState(false);
  const [channel, setChannel] = useState<CommsChannel>(preset.channel ?? 'Mail');
  const [date, setDate] = useState(preset.date ?? todayISO());
  const [time, setTime] = useState(preset.time ?? (CHANNEL_RULES[preset.channel ?? 'Mail'].times[0] ?? '10:00'));
  const [campaign, setCampaign] = useState('');
  const [subject, setSubject] = useState('');
  const [department, setDepartment] = useState('');
  const [businessSpoc, setBusinessSpoc] = useState('');
  const [audience, setAudience] = useState<string>('All Employees');
  const [languages, setLanguages] = useState<string[]>(['English']);
  const [subType, setSubType] = useState<CommSubType | ''>('');
  const [category, setCategory] = useState<CommCategory | ''>('');

  const rule = CHANNEL_RULES[channel];
  // Soft warning: does this channel usually run on this weekday?
  const weekday = new Date(date + 'T00:00:00').getDay();
  const dayWarning = rule.days && !rule.days.includes(weekday as any)
    ? `${channel} usually runs ${rule.frequency}. You're booking it on a different day — that's allowed, just double-check.`
    : null;

  const toggleLang = (l: string) => setLanguages(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await onBook({
      Channel: channel, Release_Date: date, Release_Time: time,
      Campaign_Name: campaign, Subject_Line: subject, Department: department, Business_SPOC: businessSpoc,
      Audience: audience, Languages: languages, Sub_Type: subType || undefined, Category: category || undefined,
      Blocked: isBlock || undefined,
    });
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-slide-in flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-slate-900 text-sm">{isBlock ? 'Block a slot' : 'Book a slot'}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-3 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Channel *</label>
              <select value={channel} onChange={e => { const ch = e.target.value as CommsChannel; setChannel(ch); if (CHANNEL_RULES[ch].times[0]) setTime(CHANNEL_RULES[ch].times[0]); }}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none cursor-pointer">
                {COMMS_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <p className="text-[11px] text-slate-400">{rule.frequency}{CHANNEL_ASSET_TYPE[channel] ? ' · needs a creative' : ''}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-slate-600 text-xs font-semibold">Date *</label>
                <input type="date" required value={date} onChange={e => setDate(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-slate-600 text-xs font-semibold">Time *</label>
                <input type="text" required value={time} onChange={e => setTime(e.target.value)} placeholder="HH:MM"
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none" />
              </div>
            </div>
          </div>

          {(dayWarning || rule.note) && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{dayWarning || `Note: ${rule.note}.`}</span>
            </div>
          )}

          {!isBlock && (
            <>
              <div className="space-y-1">
                <label className="text-slate-600 text-xs font-semibold">Campaign name *</label>
                <input type="text" required value={campaign} onChange={e => setCampaign(e.target.value)}
                  placeholder="e.g., Diwali Celebration Emailer"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400" />
              </div>
              <div className="space-y-1">
                <label className="text-slate-600 text-xs font-semibold">Subject line *</label>
                <input type="text" required value={subject} onChange={e => setSubject(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-600 text-xs font-semibold">Requesting team</label>
                  <input type="text" value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g., HR, L&D"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400" />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-600 text-xs font-semibold">Business SPOC</label>
                  <input type="text" value={businessSpoc} onChange={e => setBusinessSpoc(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400" />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-600 text-xs font-semibold">Sub-type</label>
                  <select value={subType} onChange={e => setSubType(e.target.value as CommSubType)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none cursor-pointer">
                    <option value="">—</option>
                    {COMM_SUBTYPES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-slate-600 text-xs font-semibold">Priority</label>
                  <select value={category} onChange={e => setCategory(e.target.value as CommCategory)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none cursor-pointer">
                    <option value="">—</option>
                    {COMM_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-slate-600 text-xs font-semibold">Audience</label>
                  <select value={audience} onChange={e => setAudience(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none cursor-pointer">
                    {AUDIENCES.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-slate-600 text-xs font-semibold">Languages</label>
                <div className="flex flex-wrap gap-1.5">
                  {COMM_LANGUAGES.map(l => (
                    <button type="button" key={l} onClick={() => toggleLang(l)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        languages.includes(l) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                      }`}>{l}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} disabled={busy}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={busy}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-bold cursor-pointer disabled:opacity-50">
              {busy ? 'Saving...' : isBlock ? 'Block slot' : 'Book slot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Communication detail drawer ----
function CommDetail({ comm, vendors, tasks, onClose, onCancel, onCreateTask, onMarkReady, onHandoff, onOpenTask }: {
  comm: Communication; vendors: Vendor[]; tasks: Task[]; onClose: () => void;
  onCancel: (id: string) => Promise<boolean>; onCreateTask: (id: string, vendorId: string) => Promise<boolean>;
  onMarkReady: (id: string, creativeLink?: string) => Promise<boolean>;
  onHandoff: (id: string, fields: Record<string, unknown>) => Promise<boolean>; onOpenTask: (taskId: string) => void;
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
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-slate-600 bg-slate-200/70 px-2 py-0.5 rounded">{comm.Channel}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold border ${STATUS_STYLE[comm.Status]}`}>{comm.Status}</span>
              {comm.Category && <span className="text-xs font-bold text-rose-600">{comm.Category}</span>}
            </div>
            <h3 className="font-bold text-slate-900 text-base leading-snug break-words">{comm.Blocked ? 'Blocked slot' : comm.Campaign_Name}</h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{comm.Release_Date} · {comm.Release_Time}</span>
              {comm.Department && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{comm.Department}</span>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close booking details" className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 cursor-pointer shrink-0"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto text-sm">
          {!comm.Blocked && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-600">
              <div className="col-span-2"><span className="text-xs text-slate-400 block">Subject</span>{comm.Subject_Line || '—'}</div>
              <div><span className="text-xs text-slate-400 block">Audience</span>{comm.Audience}</div>
              <div><span className="text-xs text-slate-400 block">Languages</span>{comm.Languages?.join(', ') || '—'}</div>
              {comm.Sub_Type && <div><span className="text-xs text-slate-400 block">Type</span>{comm.Sub_Type}</div>}
              <div><span className="text-xs text-slate-400 block">Business SPOC</span>{comm.Business_SPOC || '—'}</div>
              <div><span className="text-xs text-slate-400 block">Comms SPOC</span>{comm.Comms_SPOC}</div>
              {comm.Sender_ID && <div><span className="text-xs text-slate-400 block">Sender ID</span>{comm.Sender_ID}</div>}
            </div>
          )}

          {!comm.Blocked && comm.Status !== 'Released' && comm.Status !== 'Cancelled' && (
            <div className="space-y-3">
              {linkedTask ? (
                <button onClick={() => { onClose(); onOpenTask(linkedTask.Task_ID); }}
                  className="w-full flex items-center justify-between gap-2 p-3 bg-white border border-slate-200 hover:border-slate-300 rounded-lg cursor-pointer">
                  <span className="flex items-center gap-2 text-slate-700"><Palette className="h-4 w-4 text-slate-400" />Design task: {linkedTask.Title}</span>
                  <span className="text-xs font-bold text-slate-500">{linkedTask.Status}</span>
                </button>
              ) : needsCreative && comm.Status === 'Booked' ? (
                <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-bold text-violet-900 flex items-center gap-1.5"><Palette className="h-4 w-4" />This channel needs a creative — brief a vendor:</div>
                  <div className="flex gap-2">
                    <select value={vendorId} onChange={e => setVendorId(e.target.value)} className="flex-1 bg-white border border-violet-200 rounded-lg px-2 py-1.5 text-sm outline-none cursor-pointer">
                      {vendors.map(v => <option key={v.Vendor_ID} value={v.Vendor_ID}>{v.Company_Name}</option>)}
                    </select>
                    <button disabled={busy} onClick={() => run(() => onCreateTask(comm.Comm_ID, vendorId))}
                      className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-lg cursor-pointer disabled:opacity-50 whitespace-nowrap">Create design task</button>
                  </div>
                </div>
              ) : null}

              {(comm.Status === 'Booked' || comm.Status === 'In Design') && (
                <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
                  <label className="text-xs font-semibold text-slate-600">Final creative link (OneDrive / Drive)</label>
                  <input type="text" value={creativeLink} onChange={e => setCreativeLink(e.target.value)} placeholder="https://onedrive.com/..."
                    className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-sm outline-none focus:border-slate-400" />
                  <button disabled={busy} onClick={() => run(() => onMarkReady(comm.Comm_ID, creativeLink))}
                    className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50">
                    <CheckCircle2 className="h-4 w-4" />Mark ready to release
                  </button>
                </div>
              )}

              {comm.Status === 'Ready' && (
                <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-bold text-violet-900 flex items-center gap-1.5"><Send className="h-4 w-4" />Hand off to the release SPOC</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={senderId} onChange={e => setSenderId(e.target.value)} placeholder="Sender ID" className="bg-white border border-violet-200 rounded px-2 py-1.5 text-sm outline-none" />
                    <input type="text" value={creativeLink} onChange={e => setCreativeLink(e.target.value)} placeholder="Creative link" className="bg-white border border-violet-200 rounded px-2 py-1.5 text-sm outline-none" />
                    <input type="text" value={ctaText} onChange={e => setCtaText(e.target.value)} placeholder="CTA text" className="bg-white border border-violet-200 rounded px-2 py-1.5 text-sm outline-none" />
                    <input type="text" value={ctaLink} onChange={e => setCtaLink(e.target.value)} placeholder="CTA link" className="bg-white border border-violet-200 rounded px-2 py-1.5 text-sm outline-none" />
                  </div>
                  <button disabled={busy} onClick={() => run(() => onHandoff(comm.Comm_ID, { Sender_ID: senderId, Creative_Link: creativeLink, CTA_Text: ctaText, CTA_Link: ctaLink }).then(ok => { if (ok) onClose(); return ok; }))}
                    className="w-full py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50">
                    <Send className="h-4 w-4" />Send to release SPOC
                  </button>
                </div>
              )}
            </div>
          )}

          {comm.Status === 'Handed Off' && <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-sm text-violet-800">📤 Handed off — waiting for release.</div>}
          {comm.Status === 'Released' && <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">✅ Released{comm.Released_By ? ` by ${comm.Released_By}` : ''}.</div>}

          {comm.Status !== 'Released' && comm.Status !== 'Cancelled' && (
            <div className="pt-2 border-t border-slate-100">
              {confirmCancel ? (
                <div className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 rounded-lg p-3">
                  <span className="text-sm text-rose-800 font-medium">{comm.Blocked ? 'Unblock this slot?' : 'Cancel this booking? It stays in history.'}</span>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setConfirmCancel(false)} disabled={busy} className="px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-white rounded-lg cursor-pointer">Keep</button>
                    <button onClick={() => run(() => onCancel(comm.Comm_ID).then(ok => { if (ok) onClose(); return ok; }))} disabled={busy}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-lg cursor-pointer disabled:opacity-50">{comm.Blocked ? 'Unblock' : 'Cancel booking'}</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmCancel(true)} className="text-sm text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1.5 cursor-pointer">
                  <Trash2 className="h-4 w-4" />{comm.Blocked ? 'Unblock this slot' : 'Cancel this booking'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
