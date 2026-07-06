import { useState, FormEvent } from 'react';
import {
  Communication, CommsChannel, COMMS_CHANNELS, CHANNEL_RULES, CHANNEL_ASSET_TYPE,
  AUDIENCES, COMM_CATEGORIES, COMM_LANGUAGES, CommCategory, STANDARD_RELEASE_TIMES,
} from '../types';
import { ClipboardList, Rocket, Clock, CheckCircle2, History, Download } from 'lucide-react';

interface Props {
  communications: Communication[];
  onSubmit: (fields: Record<string, unknown>) => Promise<boolean>;
  onRelease: (id: string) => Promise<boolean>;
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

// Indian financial year runs Apr 1 – Mar 31. Bound the date picker to the
// current FY plus the next five, so bookings can't land on a wrong year.
function fyBounds() {
  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { min: `${startYear}-04-01`, max: `${startYear + 6}-03-31` };
}

function weekdayLabel(iso: string) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
}

// Download every captured release request as a CSV (opens in Excel) so the
// team always has its own copy of the data, independent of the backup sheet.
function exportCsv(rows: Communication[]) {
  const cols: (keyof Communication)[] = [
    'Comm_ID', 'Status', 'Channel', 'Release_Date', 'Release_Time', 'Campaign_Name', 'Subject_Line',
    'Department', 'Business_SPOC', 'Comms_SPOC', 'Audience', 'Languages', 'Category',
    'Creative_Link', 'Sender_ID', 'CTA_Text', 'CTA_Link', 'Released_By', 'Released_At', 'Created_At',
  ];
  const esc = (v: unknown) => {
    const s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `release-requests-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// The Release Request form: a single MS-Forms-style intake that captures every
// detail and hands the communication off for release. Submitted requests sit in
// a queue below, ready to be marked released.
export default function ReleaseRequestForm({ communications, onSubmit, onRelease }: Props) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [channel, setChannel] = useState<CommsChannel>('Mail');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('10:00');
  const [specialTime, setSpecialTime] = useState(false);
  const [campaign, setCampaign] = useState('');
  const [subject, setSubject] = useState('');
  const [department, setDepartment] = useState('');
  const [businessSpoc, setBusinessSpoc] = useState('');
  const [audience, setAudience] = useState<string>('All Employees');
  const [languages, setLanguages] = useState<string[]>(['English']);
  const [category, setCategory] = useState<CommCategory | ''>('');
  const { min: fyMin, max: fyMax } = fyBounds();
  const [creativeLink, setCreativeLink] = useState('');
  const [senderId, setSenderId] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [ctaLink, setCtaLink] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const rule = CHANNEL_RULES[channel];
  const toggleLang = (l: string) => setLanguages(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);

  const reset = () => {
    setCampaign(''); setSubject(''); setDepartment(''); setBusinessSpoc('');
    setAudience('All Employees'); setLanguages(['English']); setCategory('');
    setCreativeLink(''); setSenderId(''); setCtaText(''); setCtaLink('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await onSubmit({
      Channel: channel, Release_Date: date, Release_Time: time,
      Campaign_Name: campaign, Subject_Line: subject, Department: department, Business_SPOC: businessSpoc,
      Audience: audience, Languages: languages, Category: category || undefined,
      Creative_Link: creativeLink || undefined, Sender_ID: senderId || undefined,
      CTA_Text: ctaText || undefined, CTA_Link: ctaLink || undefined,
    });
    setBusy(false);
    if (ok) { reset(); setDone(true); setTimeout(() => setDone(false), 4000); }
  };

  const queue = communications.filter(c => c.Status === 'Handed Off')
    .sort((a, b) => (a.Release_Date + a.Release_Time).localeCompare(b.Release_Date + b.Release_Time));
  const released = communications.filter(c => c.Status === 'Released')
    .sort((a, b) => (b.Released_At ?? '').localeCompare(a.Released_At ?? ''));

  const doRelease = async (id: string) => { setBusyId(id); await onRelease(id); setBusyId(null); };

  const label = 'text-slate-600 text-xs font-semibold';
  const input = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <ClipboardList className="h-4 w-4" />
          Fill in the details of the communication you want released. Submitting hands it off for release.
        </div>
        <button type="button" onClick={() => exportCsv(communications)} disabled={communications.length === 0}
          className="py-2 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0">
          <Download className="h-4 w-4" />Download all ({communications.length})
        </button>
      </div>

      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-xs">
        {/* 1. What & where */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-bold uppercase tracking-wide text-slate-400">1 · What & where</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className={label}>Channel *</label>
              <select value={channel} onChange={e => setChannel(e.target.value as CommsChannel)}
                className={input + ' cursor-pointer'}>
                {COMMS_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <p className="text-[11px] text-slate-400">{rule.frequency}{CHANNEL_ASSET_TYPE[channel] ? ' · needs a creative' : ''}</p>
            </div>
            <div className="space-y-1">
              <label className={label}>Target date *</label>
              <input type="date" required value={date} min={fyMin} max={fyMax} onChange={e => setDate(e.target.value)} className={input} />
              <p className="text-[11px] text-slate-400">{weekdayLabel(date)}</p>
            </div>
            <div className="space-y-1">
              <label className={label}>Time *</label>
              {specialTime ? (
                <input type="text" required value={time} onChange={e => setTime(e.target.value)} placeholder="HH:MM" className={input} />
              ) : (
                <select value={time} onChange={e => { if (e.target.value === '__special') { setSpecialTime(true); } else setTime(e.target.value); }}
                  className={input + ' cursor-pointer'}>
                  {STANDARD_RELEASE_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="__special">Special time…</option>
                </select>
              )}
              {specialTime && <button type="button" onClick={() => { setSpecialTime(false); setTime('10:00'); }} className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer">← back to standard slots</button>}
            </div>
          </div>
          <div className="space-y-1">
            <label className={label}>Campaign name *</label>
            <input type="text" required value={campaign} onChange={e => setCampaign(e.target.value)}
              placeholder="e.g., Diwali Celebration Emailer" className={input} />
          </div>
          <div className="space-y-1">
            <label className={label}>Subject line *</label>
            <input type="text" required value={subject} onChange={e => setSubject(e.target.value)} className={input} />
          </div>
        </fieldset>

        {/* 2. Audience */}
        <fieldset className="space-y-3 border-t border-slate-100 pt-4">
          <legend className="text-xs font-bold uppercase tracking-wide text-slate-400">2 · Audience & priority</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={label}>Audience</label>
              <select value={audience} onChange={e => setAudience(e.target.value)} className={input + ' cursor-pointer'}>
                {AUDIENCES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className={label}>Priority</label>
              <select value={category} onChange={e => setCategory(e.target.value as CommCategory)} className={input + ' cursor-pointer'}>
                <option value="">—</option>
                {COMM_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className={label}>Languages</label>
            <div className="flex flex-wrap gap-1.5">
              {COMM_LANGUAGES.map(l => (
                <button type="button" key={l} onClick={() => toggleLang(l)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    languages.includes(l) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}>{l}</button>
              ))}
            </div>
          </div>
        </fieldset>

        {/* 3. Requesting team */}
        <fieldset className="space-y-3 border-t border-slate-100 pt-4">
          <legend className="text-xs font-bold uppercase tracking-wide text-slate-400">3 · Requesting team</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={label}>Requesting team</label>
              <input type="text" value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g., HR, L&D" className={input} />
            </div>
            <div className="space-y-1">
              <label className={label}>Business SPOC</label>
              <input type="text" value={businessSpoc} onChange={e => setBusinessSpoc(e.target.value)} className={input} />
            </div>
          </div>
        </fieldset>

        {/* 4. Creative & release */}
        <fieldset className="space-y-3 border-t border-slate-100 pt-4">
          <legend className="text-xs font-bold uppercase tracking-wide text-slate-400">4 · Creative & release details</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={label}>Final creative link (OneDrive / Drive)</label>
              <input type="text" value={creativeLink} onChange={e => setCreativeLink(e.target.value)} placeholder="https://onedrive.com/..." className={input} />
            </div>
            <div className="space-y-1">
              <label className={label}>Sender ID</label>
              <input type="text" value={senderId} onChange={e => setSenderId(e.target.value)} className={input} />
            </div>
            <div className="space-y-1">
              <label className={label}>CTA text</label>
              <input type="text" value={ctaText} onChange={e => setCtaText(e.target.value)} className={input} />
            </div>
            <div className="space-y-1">
              <label className={label}>CTA link</label>
              <input type="text" value={ctaLink} onChange={e => setCtaLink(e.target.value)} className={input} />
            </div>
          </div>
        </fieldset>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
          {done && <span className="text-sm font-semibold text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" />Submitted & handed off for release.</span>}
          <button type="submit" disabled={busy}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50">
            <Rocket className="h-4 w-4" />{busy ? 'Submitting...' : 'Submit release request'}
          </button>
        </div>
      </form>

      {/* Ready to release */}
      <div>
        <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 mb-3">
          <Rocket className="h-4 w-4 text-violet-600" />Ready to release ({queue.length})
        </h3>
        {queue.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">Nothing waiting — submit a request above.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {queue.map(c => (
              <div key={c.Comm_ID} className="bg-white border border-violet-200 rounded-xl p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">{c.Channel}</span>
                  <span className="flex items-center gap-1 text-xs font-bold text-violet-700"><Clock className="h-3.5 w-3.5" />{c.Release_Date} · {c.Release_Time}</span>
                </div>
                <h4 className="font-bold text-sm text-slate-900 break-words">{c.Campaign_Name}</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-600">
                  <div className="col-span-2"><span className="text-xs text-slate-400 block">Subject</span>{c.Subject_Line || '—'}</div>
                  <div><span className="text-xs text-slate-400 block">Audience</span>{c.Audience}</div>
                  <div><span className="text-xs text-slate-400 block">Languages</span>{c.Languages?.join(', ') || '—'}</div>
                  {c.Sender_ID && <div><span className="text-xs text-slate-400 block">Sender ID</span>{c.Sender_ID}</div>}
                  {c.Department && <div><span className="text-xs text-slate-400 block">Team</span>{c.Department}</div>}
                </div>
                <button onClick={() => doRelease(c.Comm_ID)} disabled={busyId === c.Comm_ID}
                  className="w-full py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm rounded-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                  <Rocket className="h-4 w-4" />{busyId === c.Comm_ID ? 'Marking released...' : 'Mark as released'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Released history */}
      {released.length > 0 && (
        <div>
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 mb-3">
            <History className="h-4 w-4 text-slate-400" />Released ({released.length})
          </h3>
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 shadow-xs">
            {released.map(c => (
              <div key={c.Comm_ID} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-slate-800 truncate">{c.Campaign_Name}</span>
                  <span className="block text-xs text-slate-400 truncate">{c.Channel} · {c.Release_Date} {c.Release_Time}</span>
                </span>
                <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">{c.Released_At ? new Date(c.Released_At).toLocaleDateString() : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
