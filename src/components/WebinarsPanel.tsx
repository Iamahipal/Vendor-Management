import { useState, FormEvent } from 'react';
import { Webinar } from '../types';
import { Plus, X, Trash2, Video, Clock } from 'lucide-react';

interface Props {
  webinars: Webinar[];
  onAdd: (fields: Record<string, unknown>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

export default function WebinarsPanel({ webinars, onAdd, onDelete }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ Start_Time: '15:00', End_Time: '16:00' });

  const rows = webinars.slice().sort((a, b) => a.Date.localeCompare(b.Date));
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await onAdd({ ...form });
    setBusy(false);
    if (ok) { setShowAdd(false); setForm({ Start_Time: '15:00', End_Time: '16:00' }); }
  };

  const dateLabel = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500 flex items-center gap-2"><Video className="h-4 w-4" />{rows.length} webinar{rows.length === 1 ? '' : 's'} scheduled.</p>
        <button onClick={() => setShowAdd(true)}
          className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-lg flex items-center gap-2 cursor-pointer shrink-0">
          <Plus className="h-4 w-4" />Add webinar
        </button>
      </div>

      {showAdd && (
        <form onSubmit={submit} className="bg-white border border-slate-300 rounded-xl p-5 space-y-3 shadow-xs">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-sm text-slate-900">Schedule a webinar</h3>
            <button type="button" onClick={() => setShowAdd(false)} className="p-1 hover:bg-slate-100 rounded text-slate-400 cursor-pointer"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1 md:col-span-2">
              <label className="text-slate-600 text-xs font-semibold">Topic *</label>
              <input type="text" required value={form.Topic || ''} onChange={e => set('Topic', e.target.value)}
                placeholder="e.g., NMIMS Executive MBA Webinar"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Date *</label>
              <input type="date" required value={form.Date || ''} onChange={e => set('Date', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-slate-600 text-xs font-semibold">Start</label>
                <input type="time" value={form.Start_Time || ''} onChange={e => set('Start_Time', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-slate-600 text-xs font-semibold">End</label>
                <input type="time" value={form.End_Time || ''} onChange={e => set('End_Time', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Host</label>
              <input type="text" value={form.Host || ''} onChange={e => set('Host', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Department</label>
              <input type="text" value={form.Department || ''} onChange={e => set('Department', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowAdd(false)} disabled={busy}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={busy}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-bold cursor-pointer disabled:opacity-50">{busy ? 'Saving...' : 'Schedule'}</button>
          </div>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 shadow-xs">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No webinars scheduled yet.</div>
        ) : rows.map(w => (
          <div key={w.Webinar_ID} className="flex items-center gap-3 px-4 py-3">
            <span className="text-xs font-mono text-slate-500 w-24 shrink-0">{dateLabel(w.Date)}</span>
            <span className="flex items-center gap-1 text-xs font-mono text-slate-500 w-24 shrink-0"><Clock className="h-3 w-3" />{w.Start_Time}–{w.End_Time}</span>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-sm text-slate-800 truncate">{w.Topic}</span>
              <span className="block text-xs text-slate-400 truncate">{w.Host || '—'}{w.Department ? ` · ${w.Department}` : ''}</span>
            </span>
            <button onClick={() => onDelete(w.Webinar_ID)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer shrink-0" title="Remove">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
