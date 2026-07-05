import { useState } from 'react';
import { Task, Vendor, Deliverable } from '../types';
import { Search, X, Archive } from 'lucide-react';

interface HistoryPanelProps {
  tasks: Task[];
  vendors: Vendor[];
  deliverables: Deliverable[];
  initialVendorId?: string | null;
  onOpenTask: (taskId: string) => void;
}

const STATUS_STYLES: Record<string, string> = {
  'Approved': 'bg-emerald-50 text-emerald-800 border-emerald-200',
  'Cancelled': 'bg-slate-100 text-slate-500 border-slate-200',
  'Delivered': 'bg-blue-50 text-blue-800 border-blue-200',
  'Needs Revision': 'bg-rose-50 text-rose-800 border-rose-200',
  'In Progress': 'bg-amber-50 text-amber-800 border-amber-200',
  'Assigned': 'bg-slate-50 text-slate-700 border-slate-200',
};

// Permanent archive of every request ever made — searchable, filterable.
// Nothing is deleted, so this is the "find it 5 years later" view.
export default function HistoryPanel({ tasks, vendors, deliverables, initialVendorId, onOpenTask }: HistoryPanelProps) {
  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState<string>(initialVendorId || 'ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const vendorNameOf = (id: string) => vendors.find(v => v.Vendor_ID === id)?.Company_Name || 'Unknown';

  const query = search.trim().toLowerCase();
  const rows = tasks
    .filter(t => vendorFilter === 'ALL' || t.Assigned_Vendor_ID === vendorFilter)
    .filter(t => statusFilter === 'ALL' || t.Status === statusFilter)
    .filter(t => !query
      || t.Title.toLowerCase().includes(query)
      || t.Task_ID.toLowerCase().includes(query)
      || t.Asset_Type.toLowerCase().includes(query)
      || vendorNameOf(t.Assigned_Vendor_ID).toLowerCase().includes(query)
      || (t.Comments ?? []).some(c => c.comment.toLowerCase().includes(query)))
    .sort((a, b) => b.Created_At.localeCompare(a.Created_At));

  const takesFor = (taskId: string) => deliverables.filter(d => d.Task_ID === taskId);

  return (
    <div className="space-y-4 animate-fade-in">
      <p className="text-sm text-slate-500 flex items-center gap-2">
        <Archive className="h-4 w-4" />
        Every request ever made lives here — including approved and cancelled ones. Search also looks inside conversations.
      </p>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3 shadow-xs">
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg flex-1 min-w-[220px]">
          <Search className="h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search titles, vendors, IDs, even chat messages..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-sm text-slate-700 outline-none w-full placeholder:text-slate-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600 cursor-pointer">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
          className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-700 outline-none cursor-pointer">
          <option value="ALL">All vendors</option>
          {vendors.map(v => <option key={v.Vendor_ID} value={v.Vendor_ID}>{v.Company_Name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-700 outline-none cursor-pointer">
          <option value="ALL">All statuses</option>
          {['Approved', 'Cancelled', 'Delivered', 'Needs Revision', 'In Progress', 'Assigned'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-xs text-slate-400 ml-auto">{rows.length} request{rows.length === 1 ? '' : 's'}</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-xs">
        <table className="w-full text-left text-sm min-w-[820px]">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 bg-slate-50 text-xs uppercase">
              <th className="p-3 font-semibold">Request</th>
              <th className="p-3 font-semibold">Type</th>
              <th className="p-3 font-semibold">Vendor</th>
              <th className="p-3 font-semibold">Status</th>
              <th className="p-3 font-semibold">Created</th>
              <th className="p-3 font-semibold">Due</th>
              <th className="p-3 font-semibold">Approved</th>
              <th className="p-3 font-semibold text-center">Takes</th>
              <th className="p-3 font-semibold text-center">Rejected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="p-6 text-center text-slate-400">No requests match.</td></tr>
            ) : (
              rows.map(t => {
                const takes = takesFor(t.Task_ID);
                const rejected = takes.filter(d => d.Approval_Status === 'Rejected').length;
                return (
                  <tr
                    key={t.Task_ID}
                    onClick={() => onOpenTask(t.Task_ID)}
                    className="hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="p-3 font-medium text-slate-900 max-w-[240px] truncate">{t.Title}</td>
                    <td className="p-3 whitespace-nowrap text-xs">{t.Asset_Type}</td>
                    <td className="p-3 whitespace-nowrap">{vendorNameOf(t.Assigned_Vendor_ID)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold border whitespace-nowrap ${STATUS_STYLES[t.Status] || ''}`}>
                        {t.Status}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap text-slate-500">{t.Created_At.slice(0, 10)}</td>
                    <td className="p-3 whitespace-nowrap text-slate-500">{t.Due_Date}</td>
                    <td className="p-3 whitespace-nowrap text-slate-500">{t.Approved_At ? t.Approved_At.slice(0, 10) : '—'}</td>
                    <td className="p-3 text-center">{takes.length || '—'}</td>
                    <td className={`p-3 text-center font-bold ${rejected > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{rejected || '—'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
