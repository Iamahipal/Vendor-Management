import { NotificationLog } from '../types';
import { Activity } from 'lucide-react';

interface ActivityFeedProps {
  logs: NotificationLog[];
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const ICONS: Record<NotificationLog['type'], string> = {
  delivered: '📦',
  cron_reminder: '⏰',
  cron_overdue: '🚨',
  system_template: '📋',
};

// Plain-language feed of what has happened recently — for the internal team.
export default function ActivityFeed({ logs }: ActivityFeedProps) {
  const recent = logs.slice(0, 8);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
      <h3 className="font-sans font-bold text-sm text-slate-900 flex items-center gap-2 mb-4">
        <Activity className="h-4 w-4 text-slate-500" />
        Recent activity
      </h3>

      {recent.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">Nothing yet — activity will show up here.</p>
      ) : (
        <div className="space-y-3">
          {recent.map(log => (
            <div key={log.id} className="flex items-start gap-3 text-sm">
              <span className="shrink-0 mt-0.5">{ICONS[log.type] ?? '📋'}</span>
              <div className="min-w-0">
                <p className="text-slate-700 leading-snug">{log.message}</p>
                <span className="text-xs text-slate-400">{timeAgo(log.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
