import { ReactNode, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

// Shared form-control styling so every input/select looks the same.
export const fieldBase =
  'w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-all ' +
  'focus:border-slate-400 focus:ring-4 focus:ring-slate-900/[0.06] placeholder:text-slate-400';

export const labelBase = 'text-slate-600 text-xs font-semibold';

export function Label({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return <label className={`${labelBase} flex items-center gap-1.5`}>{icon}{children}</label>;
}

// --- Date helpers (ISO YYYY-MM-DD, local) ---
function isoToday() { return new Date().toISOString().slice(0, 10); }
function addMonthsIso(iso: string, n: number) { const d = new Date(iso + 'T00:00:00'); d.setDate(1); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); }
function niceDate(iso: string) { return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }); }

// A fully custom date picker replacing the native <input type="date"> so the
// calendar popup is styled and consistent everywhere. Honours optional min/max.
export function DatePicker({ value, onChange, min, max, placeholder = 'Select date', className = '' }: {
  value: string;
  onChange: (iso: string) => void;
  min?: string; max?: string;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewIso, setViewIso] = useState(value || isoToday());
  const btnRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open) return;
    setViewIso(value || isoToday());
    const update = () => setRect(btnRef.current?.getBoundingClientRect() ?? null);
    update();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const first = viewIso.slice(0, 8) + '01';
  const firstDate = new Date(first + 'T00:00:00');
  const monthIdx = firstDate.getMonth();
  const start = new Date(firstDate); start.setDate(1 - ((firstDate.getDay() + 6) % 7)); // Monday before/at the 1st
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d.toISOString().slice(0, 10); });
  const today = isoToday();
  const disabled = (iso: string) => !!((min && iso < min) || (max && iso > max));
  const canPrev = !min || first > min;
  const canNext = !max || addMonthsIso(viewIso, 1) <= max;

  return (
    <>
      <button type="button" ref={btnRef} onClick={() => setOpen(o => !o)}
        className={`${fieldBase} flex items-center justify-between gap-2 text-left cursor-pointer ${open ? 'border-slate-400 ring-4 ring-slate-900/[0.06]' : 'hover:border-slate-300'} ${className}`}>
        <span className="flex items-center gap-2 min-w-0">
          <CalendarIcon className="h-4 w-4 text-slate-500 shrink-0" />
          <span className={`truncate ${value ? '' : 'text-slate-400'}`}>{value ? niceDate(value) : placeholder}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[110]" onClick={() => setOpen(false)} />
          <div className="fixed z-[120] bg-white border border-slate-200 rounded-xl shadow-xl ring-1 ring-slate-900/5 p-3 w-[17rem] animate-slide-in"
            style={{ left: Math.min(rect.left, window.innerWidth - 288), top: rect.bottom + 6 }}>
            <div className="flex items-center justify-between mb-2">
              <button type="button" disabled={!canPrev} onClick={() => setViewIso(addMonthsIso(viewIso, -1))}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-sm font-bold text-slate-800">{firstDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
              <button type="button" disabled={!canNext} onClick={() => setViewIso(addMonthsIso(viewIso, 1))}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-7 mb-1">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i} className="text-[10px] font-bold text-slate-400 text-center py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map(iso => {
                const inMonth = new Date(iso + 'T00:00:00').getMonth() === monthIdx;
                const isSel = iso === value;
                const isToday = iso === today;
                const off = disabled(iso);
                return (
                  <button key={iso} type="button" disabled={off}
                    onClick={() => { onChange(iso); setOpen(false); }}
                    className={`h-8 w-8 mx-auto text-xs rounded-lg flex items-center justify-center transition-colors cursor-pointer
                      ${isSel ? 'bg-slate-900 text-white font-bold' : off ? 'text-slate-300 cursor-default' : inMonth ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-50'}
                      ${isToday && !isSel ? 'ring-1 ring-slate-300 font-bold' : ''}`}>
                    {Number(iso.slice(8, 10))}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => { const t = isoToday(); if (!disabled(t)) { onChange(t); setOpen(false); } else setViewIso(t); }}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer">Today</button>
              <span className="text-[11px] text-slate-400">{value ? niceDate(value) : '—'}</span>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

export interface SelectOption { value: string; label: string; icon?: ReactNode; group?: string; }

// A fully custom dropdown (not a native <select>): the open panel is our own
// styled, portalled element, so it looks modern and identical in every browser.
export function Select({ value, onChange, options, placeholder = 'Select…', className = '' }: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const update = () => setRect(btnRef.current?.getBoundingClientRect() ?? null);
    update();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Preserve order while collecting optional group headers
  const groups: { name?: string; items: SelectOption[] }[] = [];
  for (const o of options) {
    const g = groups.find(x => x.name === o.group);
    if (g) g.items.push(o); else groups.push({ name: o.group, items: [o] });
  }

  return (
    <>
      <button type="button" ref={btnRef} onClick={() => setOpen(o => !o)}
        className={`${fieldBase} flex items-center justify-between gap-2 text-left cursor-pointer ${open ? 'border-slate-400 ring-4 ring-slate-900/[0.06]' : 'hover:border-slate-300'} ${className}`}>
        <span className="flex items-center gap-2 min-w-0">
          {selected?.icon && <span className="text-slate-500 shrink-0">{selected.icon}</span>}
          <span className={`truncate ${selected ? '' : 'text-slate-400'}`}>{selected ? selected.label : placeholder}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[110]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[120] bg-white border border-slate-200 rounded-xl shadow-xl ring-1 ring-slate-900/5 py-1.5 max-h-64 overflow-y-auto animate-slide-in"
            style={{ left: rect.left, top: rect.bottom + 6, width: rect.width }}
          >
            {groups.map((g, gi) => (
              <div key={gi}>
                {g.name && <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{g.name}</div>}
                {g.items.map(o => {
                  const active = o.value === value;
                  return (
                    <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left cursor-pointer transition-colors ${active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
                      {o.icon && <span className={`shrink-0 ${active ? 'text-white' : 'text-slate-400'}`}>{o.icon}</span>}
                      <span className="flex-1 truncate">{o.label}</span>
                      {active && <Check className="h-4 w-4 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
