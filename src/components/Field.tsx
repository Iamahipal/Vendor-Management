import { ReactNode, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

// Shared form-control styling so every input/select looks the same.
export const fieldBase =
  'w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-all ' +
  'focus:border-slate-400 focus:ring-4 focus:ring-slate-900/[0.06] placeholder:text-slate-400';

export const labelBase = 'text-slate-600 text-xs font-semibold';

export function Label({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return <label className={`${labelBase} flex items-center gap-1.5`}>{icon}{children}</label>;
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
