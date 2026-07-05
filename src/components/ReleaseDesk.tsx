import { useState } from 'react';
import { DatabaseState, Communication, isDirectImage } from '../types';
import { Rocket, Clock, Building2, CheckCircle2, ExternalLink, History } from 'lucide-react';

interface ReleaseDeskProps {
  dbState: DatabaseState;
  onRelease: (id: string) => Promise<boolean>;
}

// The Release SPOC's whole workspace: a queue of ready-to-release
// communications with all the details needed to execute in Factorial,
// plus a log of what's already gone live.
export default function ReleaseDesk({ dbState, onRelease }: ReleaseDeskProps) {
  const { communications = [], user } = dbState;
  const [busyId, setBusyId] = useState<string | null>(null);

  const queue = communications
    .filter(c => c.Status === 'Handed Off')
    .sort((a, b) => (a.Release_Date + a.Release_Time).localeCompare(b.Release_Date + b.Release_Time));
  const released = communications
    .filter(c => c.Status === 'Released')
    .sort((a, b) => (b.Released_At ?? '').localeCompare(a.Released_At ?? ''));

  const doRelease = async (id: string) => {
    setBusyId(id);
    await onRelease(id);
    setBusyId(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <p className="text-sm text-slate-500">
        Hi {user?.Name?.split(' ')[0] ?? 'there'} — here's everything handed to you for release. Each card has the full details to push it live in Factorial, then mark it Released.
      </p>

      {/* Ready-to-release queue */}
      <div>
        <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 mb-3">
          <Rocket className="h-4 w-4 text-violet-600" />
          Ready to release ({queue.length})
        </h3>
        {queue.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400 text-sm">
            Nothing waiting — you're all caught up.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {queue.map(c => (
              <ReleaseCard key={c.Comm_ID} comm={c} busy={busyId === c.Comm_ID} onRelease={() => doRelease(c.Comm_ID)} />
            ))}
          </div>
        )}
      </div>

      {/* Released history */}
      {released.length > 0 && (
        <div>
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 mb-3">
            <History className="h-4 w-4 text-slate-400" />
            Released ({released.length})
          </h3>
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 shadow-xs">
            {released.map(c => (
              <div key={c.Comm_ID} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-slate-800 truncate">{c.Campaign_Name}</span>
                  <span className="block text-xs text-slate-400 truncate">{c.Channel} · {c.Release_Date} {c.Release_Time}</span>
                </span>
                <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                  {c.Released_At ? new Date(c.Released_At).toLocaleDateString() : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReleaseCard({ comm, busy, onRelease }: { comm: Communication; busy: boolean; onRelease: () => void }) {
  return (
    <div className="bg-white border border-violet-200 rounded-xl p-5 shadow-xs space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">{comm.Channel}</span>
            <span className="flex items-center gap-1 text-xs font-bold text-violet-700"><Clock className="h-3.5 w-3.5" />{comm.Release_Date} · {comm.Release_Time}</span>
          </div>
          <h4 className="font-bold text-sm text-slate-900 break-words">{comm.Campaign_Name}</h4>
        </div>
      </div>

      {/* Release details — the auto-filled form */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-600">
        <div className="col-span-2"><span className="text-xs text-slate-400 block">Subject line</span>{comm.Subject_Line}</div>
        <div><span className="text-xs text-slate-400 block">Audience</span>{comm.Audience}</div>
        <div><span className="text-xs text-slate-400 block">Language</span>{comm.Languages?.join(', ') || '—'}</div>
        {comm.Sender_ID && <div><span className="text-xs text-slate-400 block">Sender ID</span>{comm.Sender_ID}</div>}
        {comm.Department && <div className="flex items-start gap-1"><span><span className="text-xs text-slate-400 block">Team</span>{comm.Department}</span></div>}
        {comm.CTA_Text && <div><span className="text-xs text-slate-400 block">CTA text</span>{comm.CTA_Text}</div>}
        {comm.CTA_Link && <div className="min-w-0"><span className="text-xs text-slate-400 block">CTA link</span><span className="truncate block">{comm.CTA_Link}</span></div>}
      </div>

      {/* Creative */}
      {comm.Creative_Link && (
        isDirectImage(comm.Creative_Link) ? (
          <a href={comm.Creative_Link} target="_blank" rel="noopener noreferrer" className="block">
            <img src={comm.Creative_Link} alt={comm.Campaign_Name} referrerPolicy="no-referrer"
              className="w-full max-h-48 object-cover rounded-lg border border-slate-200" />
          </a>
        ) : (
          <a href={comm.Creative_Link} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 p-2.5 bg-white border border-slate-200 hover:border-slate-400 rounded-lg text-sm text-slate-700 transition-all">
            <ExternalLink className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="truncate">Open final creative</span>
          </a>
        )
      )}

      <button onClick={onRelease} disabled={busy}
        className="w-full py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50">
        <Rocket className="h-4 w-4" />
        {busy ? 'Marking released...' : 'Mark as released'}
      </button>
    </div>
  );
}
