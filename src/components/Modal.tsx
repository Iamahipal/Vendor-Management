import { useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Render children at <body> so they escape any ancestor stacking-context /
// transform / overflow trap (e.g. the sticky header or an animated wrapper).
export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  /** max-width tailwind class, e.g. 'max-w-xl' */
  size?: string;
  /** hide the default header (caller renders its own) */
  bare?: boolean;
}

// A single, reliable modal: portalled to <body> so it always sits above the
// sticky header (no stacking-context traps), with a blurred backdrop,
// Escape-to-close, and background scroll lock.
export default function Modal({ open, onClose, title, subtitle, icon, children, size = 'max-w-xl', bare }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className={`relative w-full ${size} bg-white rounded-2xl shadow-2xl ring-1 ring-slate-900/5 flex flex-col max-h-[90vh] animate-slide-in overflow-hidden`}>
        {!bare && (
          <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {icon && <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700 ring-1 ring-slate-900/5 flex items-center justify-center shrink-0">{icon}</div>}
              <div className="min-w-0">
                {title && <h3 className="font-bold text-slate-900 text-sm leading-tight truncate">{title}</h3>}
                {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" className="p-1.5 -mr-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
