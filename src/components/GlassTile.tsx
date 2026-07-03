import { ReactNode } from 'react';
import { motion } from 'motion/react';

interface GlassTileProps {
  id?: string;
  children: ReactNode;
  className?: string;
  colSpan?: 1 | 2 | 3 | 4;
  rowSpan?: 1 | 2;
  onClick?: () => void;
  hoverScale?: boolean;
}

export default function GlassTile({
  id,
  children,
  className = '',
  colSpan = 1,
  rowSpan = 1,
  onClick,
  hoverScale = true,
}: GlassTileProps) {
  // Metro grid span classes
  const colSpanClasses = {
    1: 'col-span-1',
    2: 'col-span-2',
    3: 'col-span-3',
    4: 'col-span-4',
  }[colSpan];

  const rowSpanClasses = {
    1: 'row-span-1',
    2: 'row-span-2',
  }[rowSpan];

  const baseClass = `
    relative overflow-hidden rounded-xl border border-slate-200
    bg-white text-slate-900 shadow-xs
    flex flex-col p-5 transition-all duration-200
    ${onClick ? 'cursor-pointer hover:bg-slate-50 hover:border-slate-300' : ''}
    ${className}
  `;

  return (
    <motion.div
      id={id}
      className={`${colSpanClasses} ${rowSpanClasses} ${baseClass}`}
      onClick={onClick}
      whileHover={onClick && hoverScale ? { y: -1 } : undefined}
      whileTap={onClick && hoverScale ? { scale: 0.99 } : undefined}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div className="relative z-10 flex flex-col h-full">{children}</div>
    </motion.div>
  );
}
