import { useState, FormEvent } from 'react';
import { WeeklyPlacement, PlacementSurface, PLACEMENT_SURFACES } from '../types';
import { Select } from './Field';
import { Plus, X, Trash2, ImageIcon, Pencil } from 'lucide-react';

interface Props {
  placements: WeeklyPlacement[];
  onAdd: (fields: Record<string, unknown>) => Promise<boolean>;
  onEdit: (id: string, fields: Record<string, unknown>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

const STATUS_STYLE: Record<string, string> = {
  Planned: 'bg-slate-100 text-slate-700 border-slate-200',
  Blocked: 'bg-amber-50 text-amber-800 border-amber-200',
  Live: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

function weekLabel(start: string, end: string) {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(s)} – ${fmt(e)}`;
}

// Wallpaper / Lockscreen / banner surfaces booked one campaign per week.
export default function WeeklyPlacementsPanel({ placements, onAdd, onEdit, onDelete }: Props) {
  const [surface, setSurface] = useState<PlacementSurface>('Wallpaper');
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const rows = placements
    .filter(p => p.Surface === surface)
    .sort((a, b) => a.Start_Date.localeCompare(b.Start_Date));

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const closeForm = () => { setShowAdd(false); setEditId(null); setForm({}); };

  const openEdit = (p: WeeklyPlacement) => {
    setEditId(p.Placement_ID);
    setForm({
      Start_Date: p.Start_Date,
      End_Date: p.End_Date,
      Campaign_Theme: p.Campaign_Theme ?? '',
      Business_Unit: p.Business_Unit ?? '',
      Business_SPOC: p.Business_SPOC ?? '',
      Status: p.Status,
    });
    setShowAdd(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = editId
      ? await onEdit(editId, { ...form })
      : await onAdd({ ...form, Surface: surface });
    setBusy(false);
    if (ok) closeForm();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {PLACEMENT_SURFACES.map(s => (
            <button key={s} onClick={() => setSurface(s)}
              className={`py-1.5 px-3 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                surface === s ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
              }`}>{s}</button>
          ))}
        </div>
        <button onClick={() => { setEditId(null); setForm({ Status: 'Planned' }); setShowAdd(true); }}
          className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-lg flex items-center gap-2 cursor-pointer shrink-0">
          <Plus className="h-4 w-4" />Book a week
        </button>
      </div>

      <p className="text-sm text-slate-500 flex items-center gap-2">
        <ImageIcon className="h-4 w-4" />
        {surface} runs one campaign per week. {rows.length} week{rows.length === 1 ? '' : 's'} booked.
      </p>

      {showAdd && (
        <form onSubmit={submit} className="bg-white border border-slate-300 rounded-xl p-5 space-y-3 shadow-xs">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-sm text-slate-900">{editId ? `Edit ${surface} week` : `Book a ${surface} week`}</h3>
            <button type="button" onClick={closeForm} className="p-1 hover:bg-slate-100 rounded text-slate-400 cursor-pointer"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Week start *</label>
              <input type="date" required value={form.Start_Date || ''} onChange={e => set('Start_Date', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Week end *</label>
              <input type="date" required value={form.End_Date || ''} onChange={e => set('End_Date', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Campaign theme</label>
              <input type="text" value={form.Campaign_Theme || ''} onChange={e => set('Campaign_Theme', e.target.value)}
                placeholder="Leave blank to just block the week"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Business unit</label>
              <input type="text" value={form.Business_Unit || ''} onChange={e => set('Business_Unit', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Business SPOC</label>
              <input type="text" value={form.Business_SPOC || ''} onChange={e => set('Business_SPOC', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Status</label>
              <Select value={form.Status || 'Planned'} onChange={v => set('Status', v)}
                options={['Planned', 'Blocked', 'Live'].map(s => ({ value: s, label: s }))} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={closeForm} disabled={busy}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={busy}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-bold cursor-pointer disabled:opacity-50">{busy ? 'Saving...' : editId ? 'Save changes' : 'Book week'}</button>
          </div>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 shadow-xs">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No {surface} weeks booked yet.</div>
        ) : rows.map(p => (
          <div key={p.Placement_ID} className="flex items-center gap-3 px-4 py-3">
            <span className="text-xs font-mono text-slate-500 w-28 shrink-0">{weekLabel(p.Start_Date, p.End_Date)}</span>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-sm text-slate-800 truncate">{p.Campaign_Theme || '(Blocked / reserved)'}</span>
              <span className="block text-xs text-slate-400 truncate">{p.Business_Unit || '—'}{p.Comms_SPOC ? ` · ${p.Comms_SPOC}` : ''}</span>
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-bold border whitespace-nowrap shrink-0 ${STATUS_STYLE[p.Status] || ''}`}>{p.Status}</span>
            <button onClick={() => openEdit(p)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer shrink-0" title="Edit">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={() => onDelete(p.Placement_ID)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer shrink-0" title="Remove">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
