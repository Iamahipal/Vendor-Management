import { useState, FormEvent } from 'react';
import {
  Communication, CommsChannel, Vendor, Task, WeeklyPlacement,
  COMMS_CHANNELS, CHANNEL_ASSET_TYPE, CommStatus, CHANNEL_RULES,
  AUDIENCES, COMM_CATEGORIES, COMM_LANGUAGES, CommCategory,
  STANDARD_RELEASE_TIMES, IC_SPOCS, spocColor, BookingDraft,
} from '../types';
import WeeklyPlacementsPanel from './WeeklyPlacementsPanel';
import {
  CalendarDays, Plus, X, Clock, Building2, Palette, Send, CheckCircle2, Trash2,
  ChevronLeft, ChevronRight, Ban, ImageIcon, AlertTriangle, Grid3x3, CalendarRange,
  Sparkles, User as UserIcon,
} from 'lucide-react';

interface CalendarPanelProps {
  communications: Communication[];
  placements: WeeklyPlacement[];
  vendors: Vendor[];
  tasks: Task[];
  onBook: (fields: Record<string, unknown>) => Promise<boolean>;
  onEdit: (id: string, fields: Record<string, unknown>) => Promise<boolean>;
  onCancel: (id: string) => Promise<boolean>;
  onCreateTask: (id: string, vendorId: string) => Promise<boolean>;
  onMarkReady: (id: string, creativeLink?: string) => Promise<boolean>;
  onHandoff: (id: string, fields: Record<string, unknown>) => Promise<boolean>;
  onOpenTask: (taskId: string) => void;
  onParseBooking: (rawText: string) => Promise<BookingDraft | null>;
  onAddPlacement: (fields: Record<string, unknown>) => Promise<boolean>;
  onEditPlacement: (id: string, fields: Record<string, unknown>) => Promise<boolean>;
  onDeletePlacement: (id: string) => Promise<boolean>;
}

const STATUS_STYLE: Record<CommStatus, string> = {
  'Booked': 'bg-slate-100 text-slate-700 border-slate-200',
  'In Design': 'bg-amber-50 text-amber-800 border-amber-200',
  'Ready': 'bg-blue-50 text-blue-800 border-blue-200',
  'Handed Off': 'bg-violet-50 text-violet-800 border-violet-200',
  'Released': 'bg-emerald-50 text-emerald-800 border-emerald-200',
  'Cancelled': 'bg-slate-50 text-slate-400 border-slate-200',
};

const SLOT4 = STANDARD_RELEASE_TIMES;            // ['10:00','12:00','15:00','17:00']
const MONTH_COLS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDays(iso: string, n: number) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function addMonths(iso: string, n: number) { const d = new Date(iso + 'T00:00:00'); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); }
function mondayOf(iso: string) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); }
function dayNum(iso: string) { return Number(iso.slice(8, 10)); }
function isSunday(iso: string) { return new Date(iso + 'T00:00:00').getDay() === 0; }
function monthLabel(iso: string) { return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); }
function weekdayShort(iso: string) { return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' }); }
function weekRangeLabel(iso: string) {
  const s = mondayOf(iso); const e = addDays(s, 5);
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(s)} – ${fmt(e)}`;
}
const firstName = (n?: string) => (n ? n.split(' ')[0] : '');

interface BookingPreset { channel?: CommsChannel; time?: string; date?: string; block?: boolean }

export default function CalendarPanel(props: CalendarPanelProps) {
  const { communications, placements, vendors, tasks } = props;
  const [tab, setTab] = useState<'calendar' | 'weekly'>('calendar');
  const [view, setView] = useState<'month' | 'week'>('month');
  const [gridDate, setGridDate] = useState(todayISO());
  const [showBook, setShowBook] = useState<BookingPreset | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const active = communications.filter(c => c.Status !== 'Cancelled');
  const detail = detailId ? communications.find(c => c.Comm_ID === detailId) ?? null : null;

  const bookingsOn = (iso: string) => active.filter(c => c.Release_Date === iso).sort((a, b) => a.Release_Time.localeCompare(b.Release_Time));
  const slotAt = (iso: string, time: string) => active.find(c => c.Release_Date === iso && c.Release_Time === time);
  const specialsOn = (iso: string) => bookingsOn(iso).filter(c => !SLOT4.includes(c.Release_Time));

  // Dates in the visible range → the SPOCs to show in the legend
  const rangeDates = view === 'month'
    ? Array.from({ length: 42 }, (_, i) => addDays(mondayOf(gridDate.slice(0, 8) + '01'), i))
    : Array.from({ length: 6 }, (_, i) => addDays(mondayOf(gridDate), i));
  const spocsInRange = [...new Set(active.filter(c => rangeDates.includes(c.Release_Date) && !c.Blocked && c.Comms_SPOC).map(c => c.Comms_SPOC))].sort();

  const step = (dir: number) => {
    if (view === 'month') setGridDate(addMonths(gridDate.slice(0, 8) + '01', dir));
    else setGridDate(addDays(gridDate, dir * 7));
  };
  const pickDay = (iso: string) => { setGridDate(iso); setView('week'); };
  const book = (preset: BookingPreset) => setShowBook(preset);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Top tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
        {([['calendar', 'Calendar', CalendarDays], ['weekly', 'Wallpaper & Banners', ImageIcon]] as const).map(([id, l, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`py-1.5 px-3 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${tab === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            <Icon className="h-3.5 w-3.5" />{l}
          </button>
        ))}
      </div>

      {tab === 'weekly' ? (
        <WeeklyPlacementsPanel placements={placements} onAdd={props.onAddPlacement} onEdit={props.onEditPlacement} onDelete={props.onDeletePlacement} />
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <button onClick={() => step(-1)} className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-sm font-bold text-slate-800 min-w-[150px] text-center">{view === 'month' ? monthLabel(gridDate) : weekRangeLabel(gridDate)}</span>
              <button onClick={() => step(1)} className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"><ChevronRight className="h-4 w-4" /></button>
              <button onClick={() => setGridDate(todayISO())} className="px-3 py-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 cursor-pointer">Today</button>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-slate-100 border border-slate-200 rounded-lg p-0.5">
                {([['month', 'Month', CalendarDays], ['week', 'Week', Grid3x3]] as const).map(([id, l, Icon]) => (
                  <button key={id} onClick={() => setView(id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all ${view === id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}>
                    <Icon className="h-3.5 w-3.5" />{l}
                  </button>
                ))}
              </div>
              <button onClick={() => book({ date: gridDate })}
                className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-lg flex items-center gap-2 cursor-pointer shrink-0">
                <Plus className="h-4 w-4" />Book a slot
              </button>
            </div>
          </div>

          {/* SPOC legend */}
          {spocsInRange.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
              <span className="font-semibold text-slate-400">Comms SPOC:</span>
              {spocsInRange.map(s => {
                const c = spocColor(s);
                return <span key={s} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />{s}</span>;
              })}
            </div>
          )}

          {view === 'month'
            ? <MonthGrid anchor={gridDate} slotAt={slotAt} specialsOn={specialsOn} bookingsOn={bookingsOn} onOpen={setDetailId} onBook={book} onPickDay={pickDay} />
            : <WeekGrid anchor={gridDate} slotAt={slotAt} specialsOn={specialsOn} onOpen={setDetailId} onBook={book} />}

          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <CalendarRange className="h-3.5 w-3.5" />
            Four sends a day (10:00 · 12:00 · 15:00 · 17:00). No sends on Sundays. Hover a day for the full slot details.
          </p>
        </>
      )}

      {showBook && (
        <BookingForm preset={showBook} onClose={() => setShowBook(null)} onParse={props.onParseBooking}
          onBook={async (fields) => { const ok = await props.onBook(fields); if (ok) setShowBook(null); return ok; }} />
      )}
      {detail && (
        <CommDetail comm={detail} vendors={vendors} tasks={tasks} onClose={() => setDetailId(null)}
          onCancel={props.onCancel} onCreateTask={props.onCreateTask} onMarkReady={props.onMarkReady}
          onHandoff={props.onHandoff} onOpenTask={props.onOpenTask} />
      )}
    </div>
  );
}

// A single slot chip (booked = SPOC colour, empty = faint add)
function SlotChip({ b, time, onOpen, onBook }: { b?: Communication; time: string; onOpen: (id: string) => void; onBook: () => void }) {
  if (!b) {
    return (
      <button onClick={onBook} className="w-full text-left rounded px-1 py-0.5 text-[10px] text-slate-300 hover:text-slate-600 hover:bg-slate-50 border border-transparent cursor-pointer truncate">
        <span className="font-mono">{time}</span> <Plus className="h-2.5 w-2.5 inline" />
      </button>
    );
  }
  const c = b.Blocked ? { bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-200' } : spocColor(b.Comms_SPOC);
  return (
    <button onClick={() => onOpen(b.Comm_ID)} title={`${time} · ${b.Channel} · ${b.Blocked ? 'Blocked' : b.Campaign_Name} · ${b.Comms_SPOC ?? ''}`}
      className={`w-full text-left rounded px-1 py-0.5 text-[10px] border truncate cursor-pointer hover:brightness-95 ${c.bg} ${c.text} ${c.border}`}>
      <span className="font-mono opacity-70">{time}</span> {b.Blocked ? 'Blocked' : b.Campaign_Name}
    </button>
  );
}

// ---- Month grid: 4 slots per weekday, Sundays off, hover popover ----
function MonthGrid({ anchor, slotAt, specialsOn, bookingsOn, onOpen, onBook, onPickDay }: {
  anchor: string;
  slotAt: (iso: string, time: string) => Communication | undefined;
  specialsOn: (iso: string) => Communication[];
  bookingsOn: (iso: string) => Communication[];
  onOpen: (id: string) => void; onBook: (p: BookingPreset) => void; onPickDay: (iso: string) => void;
}) {
  const first = anchor.slice(0, 8) + '01';
  const start = mondayOf(first);
  const monthIdx = new Date(first + 'T00:00:00').getMonth();
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const today = todayISO();

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-visible">
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 rounded-t-xl">
        {MONTH_COLS.map(d => <div key={d} className={`px-2 py-2 text-[11px] font-bold text-center ${d === 'Sun' ? 'text-slate-300' : 'text-slate-500'}`}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((iso, i) => {
          const inMonth = new Date(iso + 'T00:00:00').getMonth() === monthIdx;
          const sunday = isSunday(iso);
          const specials = specialsOn(iso);
          const isToday = iso === today;
          const lastCols = i % 7 >= 4; // anchor popover to the right for last columns
          return (
            <div key={iso} className={`group relative min-h-[116px] border-b border-r border-slate-100 p-1 flex flex-col gap-0.5 ${(i + 1) % 7 === 0 ? 'border-r-0' : ''} ${i >= 35 ? 'border-b-0' : ''} ${sunday ? 'bg-slate-50/60' : inMonth ? '' : 'bg-slate-50/30'}`}>
              <div className="flex items-center justify-between px-0.5">
                <span className={`text-[11px] font-bold ${isToday ? 'bg-slate-900 text-white rounded-full h-5 w-5 flex items-center justify-center' : inMonth ? 'text-slate-700' : 'text-slate-300'}`}>{dayNum(iso)}</span>
              </div>
              {sunday ? (
                <span className="text-[10px] text-slate-300 px-0.5 mt-1">No sends</span>
              ) : (
                <>
                  {SLOT4.map(t => <SlotChip key={t} b={slotAt(iso, t)} time={t} onOpen={onOpen} onBook={() => onBook({ date: iso, time: t })} />)}
                  {specials.length > 0 && <span className="text-[9px] text-slate-400 px-0.5">+{specials.length} other time{specials.length > 1 ? 's' : ''}</span>}
                </>
              )}

              {/* Hover preview */}
              {!sunday && (
                <div className={`pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute z-50 top-full mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-left ${lastCols ? 'right-0' : 'left-0'}`}>
                  <div className="text-xs font-bold text-slate-800 mb-2">{new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</div>
                  <div className="space-y-1.5">
                    {SLOT4.map(t => {
                      const b = slotAt(iso, t);
                      const c = b && !b.Blocked ? spocColor(b.Comms_SPOC) : null;
                      return (
                        <div key={t} className="flex items-start gap-2 text-[11px]">
                          <span className="font-mono text-slate-400 w-10 shrink-0">{t}</span>
                          {b ? (
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5">
                                {c && <span className={`h-2 w-2 rounded-full ${c.dot} shrink-0`} />}
                                <span className="font-semibold text-slate-800 truncate">{b.Blocked ? 'Blocked' : b.Campaign_Name}</span>
                              </span>
                              {!b.Blocked && <span className="block text-slate-400">{b.Channel} · {b.Comms_SPOC || '—'} · {b.Status}</span>}
                            </span>
                          ) : <span className="text-slate-300">open</span>}
                        </div>
                      );
                    })}
                    {bookingsOn(iso).filter(b => !SLOT4.includes(b.Release_Time)).map(b => {
                      const c = b.Blocked ? null : spocColor(b.Comms_SPOC);
                      return (
                        <div key={b.Comm_ID} className="flex items-start gap-2 text-[11px]">
                          <span className="font-mono text-slate-400 w-10 shrink-0">{b.Release_Time}</span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">{c && <span className={`h-2 w-2 rounded-full ${c.dot} shrink-0`} />}<span className="font-semibold text-slate-800 truncate">{b.Campaign_Name}</span></span>
                            <span className="block text-slate-400">{b.Channel} · {b.Comms_SPOC || '—'}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={() => onPickDay(iso)} className="mt-2 w-full text-[11px] font-semibold text-slate-500 hover:text-slate-800 pointer-events-auto cursor-pointer">Open week →</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Week grid: Mon–Sat columns, 4 slot rows + a "special" row ----
function WeekGrid({ anchor, slotAt, specialsOn, onOpen, onBook }: {
  anchor: string;
  slotAt: (iso: string, time: string) => Communication | undefined;
  specialsOn: (iso: string) => Communication[];
  onOpen: (id: string) => void; onBook: (p: BookingPreset) => void;
}) {
  const start = mondayOf(anchor);
  const days = Array.from({ length: 6 }, (_, i) => addDays(start, i)); // Mon–Sat
  const today = todayISO();

  const cell = (b: Communication | undefined, iso: string, time: string) => {
    if (!b) return (
      <button onClick={() => onBook({ date: iso, time })} className="min-h-[52px] w-full rounded-lg border border-dashed border-slate-200 text-slate-300 hover:text-slate-600 hover:bg-slate-50 text-xs flex items-center justify-center gap-1 cursor-pointer">
        <Plus className="h-3.5 w-3.5" />
      </button>
    );
    const c = b.Blocked ? { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', dot: 'bg-slate-300' } : spocColor(b.Comms_SPOC);
    return (
      <button onClick={() => onOpen(b.Comm_ID)} className={`min-h-[52px] w-full text-left rounded-lg border px-2 py-1 cursor-pointer hover:brightness-95 ${c.bg} ${c.text} ${c.border}`}>
        <div className="text-[11px] font-bold truncate leading-tight">{b.Blocked ? 'Blocked' : b.Campaign_Name}</div>
        {!b.Blocked && <div className="text-[9px] opacity-80 truncate">{b.Channel} · {firstName(b.Comms_SPOC)}</div>}
      </button>
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-2 overflow-x-auto">
      <div className="grid gap-1.5 min-w-[640px]" style={{ gridTemplateColumns: '3rem repeat(6, minmax(0, 1fr))' }}>
        <div />
        {days.map(iso => (
          <div key={iso} className={`text-center py-1 rounded-lg ${iso === today ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
            <div className="text-[10px] font-semibold uppercase">{weekdayShort(iso)}</div>
            <div className="text-sm font-bold">{dayNum(iso)}</div>
          </div>
        ))}

        {SLOT4.map(t => (
          <div key={t} className="contents">
            <div className="flex items-center justify-end pr-1 text-[11px] font-mono text-slate-400">{t}</div>
            {days.map(iso => <div key={iso + t}>{cell(slotAt(iso, t), iso, t)}</div>)}
          </div>
        ))}

        {/* Special / other times */}
        <div className="flex items-start justify-end pr-1 text-[10px] font-semibold text-slate-400 pt-2">Other</div>
        {days.map(iso => {
          const specials = specialsOn(iso);
          return (
            <div key={iso + 'sp'} className="space-y-1 pt-2">
              {specials.length === 0 ? <div className="text-[10px] text-slate-200 text-center">—</div> :
                specials.map(b => {
                  const c = b.Blocked ? { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' } : spocColor(b.Comms_SPOC);
                  return (
                    <button key={b.Comm_ID} onClick={() => onOpen(b.Comm_ID)} className={`w-full text-left rounded-lg border px-2 py-1 text-[10px] cursor-pointer ${c.bg} ${c.text} ${c.border}`}>
                      <span className="font-mono opacity-70">{b.Release_Time}</span> <span className="font-semibold">{b.Campaign_Name}</span>
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Booking create form (AI paste + SPOC + 4 slots + soft rule warnings) ----
function BookingForm({ preset, onClose, onBook, onParse }: {
  preset: BookingPreset; onClose: () => void;
  onBook: (fields: Record<string, unknown>) => Promise<boolean>;
  onParse: (rawText: string) => Promise<BookingDraft | null>;
}) {
  const isBlock = preset.block === true;
  const [busy, setBusy] = useState(false);
  const [channel, setChannel] = useState<CommsChannel>(preset.channel ?? 'Mail');
  const [date, setDate] = useState(preset.date ?? todayISO());
  const presetTime = preset.time ?? '10:00';
  const [time, setTime] = useState(presetTime);
  const [specialTime, setSpecialTime] = useState(!!preset.time && !SLOT4.includes(presetTime));
  const [campaign, setCampaign] = useState('');
  const [subject, setSubject] = useState('');
  const [department, setDepartment] = useState('');
  const [businessSpoc, setBusinessSpoc] = useState('');
  const [commsSpoc, setCommsSpoc] = useState<string>(IC_SPOCS[0]);
  const [audience, setAudience] = useState<string>('All Employees');
  const [languages, setLanguages] = useState<string[]>(['English']);
  const [category, setCategory] = useState<CommCategory | ''>('');

  // AI paste-to-fill
  const [showAi, setShowAi] = useState(false);
  const [rawText, setRawText] = useState('');
  const [parsing, setParsing] = useState(false);

  const rule = CHANNEL_RULES[channel];
  const weekday = new Date(date + 'T00:00:00').getDay();
  const sundayWarning = weekday === 0 ? "IC doesn't send on Sundays — double-check this date." : null;
  const dayWarning = rule.days && !rule.days.includes(weekday as any)
    ? `${channel} usually runs ${rule.frequency}. You're booking a different day — allowed, just double-check.` : null;

  const toggleLang = (l: string) => setLanguages(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);

  const runAi = async () => {
    if (rawText.trim().length < 10) return;
    setParsing(true);
    const d = await onParse(rawText.trim());
    setParsing(false);
    if (!d) return;
    if (d.channel && (COMMS_CHANNELS as string[]).includes(d.channel)) setChannel(d.channel as CommsChannel);
    if (d.campaign_name) setCampaign(d.campaign_name);
    if (d.subject_line) setSubject(d.subject_line);
    if (d.department) setDepartment(d.department);
    if (d.business_spoc) setBusinessSpoc(d.business_spoc);
    if (d.audience && (AUDIENCES as string[]).includes(d.audience)) setAudience(d.audience);
    if (d.languages?.length) setLanguages(d.languages.filter(l => (COMM_LANGUAGES as string[]).includes(l)));
    if (d.release_date) setDate(d.release_date);
    if (d.release_time) { setTime(d.release_time); setSpecialTime(!SLOT4.includes(d.release_time)); }
    if (d.priority && (COMM_CATEGORIES as string[]).includes(d.priority)) setCategory(d.priority as CommCategory);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await onBook({
      Channel: channel, Release_Date: date, Release_Time: time,
      Campaign_Name: campaign, Subject_Line: subject, Department: department,
      Comms_SPOC: commsSpoc, Business_SPOC: businessSpoc,
      Audience: audience, Languages: languages, Category: category || undefined,
      Blocked: isBlock || undefined,
    });
    setBusy(false);
  };

  const inp = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-slide-in flex flex-col max-h-[92vh]">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-slate-900 text-sm">{isBlock ? 'Block a slot' : 'Book a slot'}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-3 overflow-y-auto">
          {!isBlock && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 space-y-2">
              <button type="button" onClick={() => setShowAi(s => !s)} className="flex items-center gap-2 text-violet-900 text-xs font-bold cursor-pointer">
                <Sparkles className="h-4 w-4 text-violet-600" />Paste an email → let AI fill this card {showAi ? '▲' : '▼'}
              </button>
              {showAi && (
                <>
                  <textarea rows={3} value={rawText} onChange={e => setRawText(e.target.value)}
                    placeholder={'Paste the request email/Teams message here…'}
                    className="w-full bg-white border border-violet-200 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-violet-400" />
                  <button type="button" onClick={runAi} disabled={parsing || rawText.trim().length < 10}
                    className="py-1.5 px-3 bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                    <Sparkles className="h-3.5 w-3.5" />{parsing ? 'Reading…' : 'Fill with AI'}
                  </button>
                  <p className="text-[10px] text-violet-700/80">AI only fills what's in the text — always check the fields before booking. (Needs the server build with an API key.)</p>
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Channel *</label>
              <select value={channel} onChange={e => setChannel(e.target.value as CommsChannel)} className={inp + ' cursor-pointer'}>
                {COMMS_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <p className="text-[11px] text-slate-400">{rule.frequency}{CHANNEL_ASSET_TYPE[channel] ? ' · needs a creative' : ''}</p>
            </div>
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Date *</label>
              <input type="date" required value={date} onChange={e => setDate(e.target.value)} className={inp} />
            </div>
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Time *</label>
              {specialTime ? (
                <input type="text" required value={time} onChange={e => setTime(e.target.value)} placeholder="HH:MM" className={inp} />
              ) : (
                <select value={time} onChange={e => { if (e.target.value === '__special') setSpecialTime(true); else setTime(e.target.value); }} className={inp + ' cursor-pointer'}>
                  {SLOT4.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="__special">Special time…</option>
                </select>
              )}
              {specialTime && <button type="button" onClick={() => { setSpecialTime(false); setTime('10:00'); }} className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer">← standard slots</button>}
            </div>
          </div>

          {(sundayWarning || dayWarning || rule.note) && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{sundayWarning || dayWarning || `Note: ${rule.note}.`}</span>
            </div>
          )}

          {!isBlock && (
            <>
              <div className="space-y-1">
                <label className="text-slate-600 text-xs font-semibold">Campaign name *</label>
                <input type="text" required value={campaign} onChange={e => setCampaign(e.target.value)} placeholder="e.g., Diwali Celebration Emailer" className={inp} />
              </div>
              <div className="space-y-1">
                <label className="text-slate-600 text-xs font-semibold">Subject line *</label>
                <input type="text" required value={subject} onChange={e => setSubject(e.target.value)} className={inp} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-600 text-xs font-semibold flex items-center gap-1"><UserIcon className="h-3 w-3" />Comms SPOC (slot owner)</label>
                  <input list="ic-spocs" value={commsSpoc} onChange={e => setCommsSpoc(e.target.value)} className={inp} />
                  <datalist id="ic-spocs">{IC_SPOCS.map(s => <option key={s} value={s} />)}</datalist>
                </div>
                <div className="space-y-1">
                  <label className="text-slate-600 text-xs font-semibold">Business SPOC</label>
                  <input type="text" value={businessSpoc} onChange={e => setBusinessSpoc(e.target.value)} className={inp} />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-600 text-xs font-semibold">Requesting team</label>
                  <input type="text" value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g., HR, L&D" className={inp} />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-600 text-xs font-semibold">Priority</label>
                  <select value={category} onChange={e => setCategory(e.target.value as CommCategory)} className={inp + ' cursor-pointer'}>
                    <option value="">—</option>
                    {COMM_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-slate-600 text-xs font-semibold">Audience</label>
                  <select value={audience} onChange={e => setAudience(e.target.value)} className={inp + ' cursor-pointer'}>
                    {AUDIENCES.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-slate-600 text-xs font-semibold">Languages</label>
                <div className="flex flex-wrap gap-1.5">
                  {COMM_LANGUAGES.map(l => (
                    <button type="button" key={l} onClick={() => toggleLang(l)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${languages.includes(l) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>{l}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={busy} className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-bold cursor-pointer disabled:opacity-50">{busy ? 'Saving...' : isBlock ? 'Block slot' : 'Book slot'}</button>
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
  const spoc = comm.Blocked ? null : spocColor(comm.Comms_SPOC);

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
              {!comm.Blocked && <span className="flex items-center gap-1">{spoc && <span className={`h-2 w-2 rounded-full ${spoc.dot}`} />}{comm.Comms_SPOC}</span>}
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
                  <div className="text-xs font-bold text-violet-900 flex items-center gap-1.5"><Send className="h-4 w-4" />Hand off for release</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={senderId} onChange={e => setSenderId(e.target.value)} placeholder="Sender ID" className="bg-white border border-violet-200 rounded px-2 py-1.5 text-sm outline-none" />
                    <input type="text" value={creativeLink} onChange={e => setCreativeLink(e.target.value)} placeholder="Creative link" className="bg-white border border-violet-200 rounded px-2 py-1.5 text-sm outline-none" />
                    <input type="text" value={ctaText} onChange={e => setCtaText(e.target.value)} placeholder="CTA text" className="bg-white border border-violet-200 rounded px-2 py-1.5 text-sm outline-none" />
                    <input type="text" value={ctaLink} onChange={e => setCtaLink(e.target.value)} placeholder="CTA link" className="bg-white border border-violet-200 rounded px-2 py-1.5 text-sm outline-none" />
                  </div>
                  <button disabled={busy} onClick={() => run(() => onHandoff(comm.Comm_ID, { Sender_ID: senderId, Creative_Link: creativeLink, CTA_Text: ctaText, CTA_Link: ctaLink }).then(ok => { if (ok) onClose(); return ok; }))}
                    className="w-full py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50">
                    <Send className="h-4 w-4" />Send for release
                  </button>
                </div>
              )}
            </div>
          )}

          {comm.Status === 'Handed Off' && <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-sm text-violet-800">📤 Handed off — mark it released from the Release Request screen.</div>}
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
