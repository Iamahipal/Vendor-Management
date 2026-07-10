import { ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

// Shared form-control styling so every input/select looks the same.
export const fieldBase =
  'w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 outline-none transition-all ' +
  'focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5 placeholder:text-slate-400';

export const labelBase = 'text-slate-600 text-xs font-semibold';

export function Label({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return <label className={`${labelBase} flex items-center gap-1.5`}>{icon}{children}</label>;
}

// A native <select> with the browser chevron removed and our own drawn on top,
// so dropdowns match the inputs and look consistent across browsers.
export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...props}
        className={`${fieldBase} appearance-none pr-9 cursor-pointer ${className}`}
      >
        {children}
      </select>
      <ChevronDown className="h-4 w-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}
