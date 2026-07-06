import { ClipboardList, CalendarDays, Palette, ArrowRight } from 'lucide-react';

export type HomeView = 'release' | 'calendar' | 'vendor';

interface HomeScreenProps {
  userName?: string;
  counts: { openRequests: number; bookedThisWeek: number; activeTasks: number };
  onOpen: (view: HomeView) => void;
}

const TILES: {
  view: HomeView; title: string; blurb: string; icon: typeof ClipboardList;
  accent: string; iconBg: string;
}[] = [
  {
    view: 'release', title: 'Release Request',
    blurb: 'Fill the form with all the details and hand it off for release.',
    icon: ClipboardList, accent: 'hover:border-violet-300', iconBg: 'bg-violet-100 text-violet-700',
  },
  {
    view: 'calendar', title: 'Booking Calendar',
    blurb: 'See open and booked slots on a real calendar, and book what you need.',
    icon: CalendarDays, accent: 'hover:border-blue-300', iconBg: 'bg-blue-100 text-blue-700',
  },
  {
    view: 'vendor', title: 'Vendor Dashboard',
    blurb: 'Brief your vendors, review the designs they send, and track every request.',
    icon: Palette, accent: 'hover:border-amber-300', iconBg: 'bg-amber-100 text-amber-700',
  },
];

export default function HomeScreen({ userName, counts, onOpen }: HomeScreenProps) {
  const metricFor = (view: HomeView) =>
    view === 'release' ? `${counts.openRequests} to hand off`
    : view === 'calendar' ? `${counts.bookedThisWeek} booked this week`
    : `${counts.activeTasks} in progress`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Hi{userName ? ` ${userName}` : ''} — what do you want to do?</h2>
        <p className="text-sm text-slate-500 mt-1">Pick one of the three below. That's the whole app.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TILES.map(t => (
          <button key={t.view} onClick={() => onOpen(t.view)}
            className={`group text-left bg-white border border-slate-200 rounded-2xl p-6 shadow-xs transition-all cursor-pointer hover:shadow-md ${t.accent}`}>
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${t.iconBg}`}>
              <t.icon className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-lg mt-4">{t.title}</h3>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">{t.blurb}</p>
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
              <span className="text-xs font-semibold text-slate-400">{metricFor(t.view)}</span>
              <span className="flex items-center gap-1 text-sm font-bold text-slate-700 group-hover:gap-2 transition-all">
                Open <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
