import { useState, FormEvent } from 'react';
import { Vendor, User, Task, Deliverable, getDueUrgency, INHOUSE_VENDOR_ID } from '../types';
import { computeVendorMetrics } from '../metrics';
import { Plus, Pencil, Mail, UserRound, X, History, Building2 } from 'lucide-react';

interface VendorsPanelProps {
  vendors: Vendor[];
  users: User[];
  tasks: Task[];
  deliverables: Deliverable[];
  onAddVendor: (fields: Record<string, string>) => Promise<boolean>;
  onEditVendor: (vendorId: string, fields: Record<string, string>) => Promise<boolean>;
  onViewHistory: (vendorId: string) => void;
}

interface VendorFormState {
  Company_Name: string;
  Specialty: string;
  Contact_Name: string;
  Contact_Email: string;
}

const EMPTY_FORM: VendorFormState = { Company_Name: '', Specialty: '', Contact_Name: '', Contact_Email: '' };

// Manage the vendor list: add new vendors, edit details, see workload.
export default function VendorsPanel({ vendors, users, tasks, deliverables, onAddVendor, onEditVendor, onViewHistory }: VendorsPanelProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VendorFormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const contactFor = (vendorId: string) => users.find(u => u.Role === 'Vendor' && u.Vendor_ID === vendorId);

  const startAdd = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowAdd(true);
  };

  const startEdit = (vendor: Vendor) => {
    const contact = contactFor(vendor.Vendor_ID);
    setForm({
      Company_Name: vendor.Company_Name,
      Specialty: vendor.Specialty,
      Contact_Name: contact?.Name ?? '',
      Contact_Email: contact?.Email ?? '',
    });
    setEditingId(vendor.Vendor_ID);
    setShowAdd(false);
  };

  const closeForm = () => {
    setShowAdd(false);
    setEditingId(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = editingId
      ? await onEditVendor(editingId, { ...form })
      : await onAddVendor({ ...form });
    setBusy(false);
    if (ok) closeForm();
  };

  const formOpen = showAdd || editingId !== null;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Your vendors and their contact people. New vendors appear in the request form right away.
        </p>
        <button
          onClick={startAdd}
          className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-lg flex items-center gap-2 transition-all cursor-pointer shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add vendor
        </button>
      </div>

      {/* Add / edit form */}
      {formOpen && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-300 rounded-xl p-5 space-y-3 shadow-xs">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-sm text-slate-900">{editingId ? 'Edit vendor' : 'Add a new vendor'}</h3>
            <button type="button" onClick={closeForm} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Company name *</label>
              <input type="text" required value={form.Company_Name}
                onChange={e => setForm(f => ({ ...f, Company_Name: e.target.value }))}
                placeholder="e.g., PixelCraft Digital"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-slate-400" />
            </div>
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">What do they make?</label>
              <input type="text" value={form.Specialty}
                onChange={e => setForm(f => ({ ...f, Specialty: e.target.value }))}
                placeholder="e.g., Social media creatives"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-slate-400" />
            </div>
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Contact person *</label>
              <input type="text" required value={form.Contact_Name}
                onChange={e => setForm(f => ({ ...f, Contact_Name: e.target.value }))}
                placeholder="e.g., Alex Rivero"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-slate-400" />
            </div>
            <div className="space-y-1">
              <label className="text-slate-600 text-xs font-semibold">Contact email *</label>
              <input type="email" required value={form.Contact_Email}
                onChange={e => setForm(f => ({ ...f, Contact_Email: e.target.value }))}
                placeholder="e.g., alex@pixelcraft.co"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-slate-400" />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={closeForm} disabled={busy}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-bold cursor-pointer disabled:opacity-50">
              {busy ? 'Saving...' : editingId ? 'Save changes' : 'Add vendor'}
            </button>
          </div>
        </form>
      )}

      {/* Vendor cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {vendors.map(vendor => {
          const isInhouse = vendor.Vendor_ID === INHOUSE_VENDOR_ID;
          const contact = contactFor(vendor.Vendor_ID);
          const vendorTasks = tasks.filter(t => t.Assigned_Vendor_ID === vendor.Vendor_ID);
          const overdue = vendorTasks.filter(t => getDueUrgency(t)?.tone === 'overdue').length;
          const m = computeVendorMetrics(vendor.Vendor_ID, tasks, deliverables);
          const scoreColor = m.score === null ? '' : m.score >= 80 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : m.score >= 60 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-rose-700 bg-rose-50 border-rose-200';

          return (
            <div key={vendor.Vendor_ID} className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-slate-900 truncate flex items-center gap-1.5">
                    {isInhouse && <Building2 className="h-4 w-4 text-slate-400 shrink-0" />}
                    {vendor.Company_Name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{vendor.Specialty}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Auto quality score (vendors only — not meaningful for in-house) */}
                  {!isInhouse && m.score !== null && (
                    <span className={`px-2 py-1 rounded-lg border text-sm font-extrabold ${scoreColor}`} title="Auto quality score: rejections and delays each cost up to 50 points">
                      {m.score}
                    </span>
                  )}
                  {!isInhouse && (
                    <button
                      onClick={() => startEdit(vendor)}
                      className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all cursor-pointer"
                      title="Edit vendor"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {contact && (
                <div className="text-sm text-slate-600 space-y-1">
                  <div className="flex items-center gap-1.5 min-w-0"><UserRound className="h-3.5 w-3.5 text-slate-400 shrink-0" /><span className="truncate">{contact.Name}</span></div>
                  <div className="flex items-center gap-1.5 min-w-0"><Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" /><span className="truncate">{contact.Email || '—'}</span></div>
                </div>
              )}

              {/* Auto metrics — computed from every take and approval ever recorded */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500 pt-2 border-t border-slate-100">
                <span>Completed: <b className="text-slate-800">{m.completed}</b></span>
                <span>Active: <b className="text-slate-800">{m.active}</b></span>
                <span>Wrong takes: <b className={m.wrongTakes > 0 ? 'text-rose-600' : 'text-slate-800'}>{m.wrongTakes}</b></span>
                <span>On-time: <b className="text-slate-800">{m.onTimeRate === null ? '—' : Math.round(m.onTimeRate * 100) + '%'}</b></span>
                {m.avgTakesPerApproval !== null && (
                  <span className="col-span-2">Avg. takes per approval: <b className="text-slate-800">{m.avgTakesPerApproval.toFixed(1)}</b></span>
                )}
              </div>

              <div className="flex gap-2 items-center pt-2 border-t border-slate-100 text-xs">
                {overdue > 0 && (
                  <span className="bg-rose-50 border border-rose-200 text-rose-700 px-2 py-1 rounded-lg font-bold">{overdue} overdue</span>
                )}
                <button
                  onClick={() => onViewHistory(vendor.Vendor_ID)}
                  className="ml-auto flex items-center gap-1 text-slate-500 hover:text-slate-900 font-semibold cursor-pointer"
                >
                  <History className="h-3.5 w-3.5" />
                  Full history
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
