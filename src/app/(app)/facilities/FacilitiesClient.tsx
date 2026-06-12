'use client';

import { useState } from 'react';
import { Plus, Factory } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Facility {
  id: string; name: string; country: string; city: string | null;
  industry_sector: string; permit_number: string | null;
  capacity_mt_year: number | null; is_active: boolean; created_at: string;
}

const SECTORS = [
  { value: 'iron_steel', label: 'Iron & Steel' }, { value: 'aluminum', label: 'Aluminium' },
  { value: 'cement', label: 'Cement' }, { value: 'fertilizers', label: 'Fertilizers' },
  { value: 'hydrogen', label: 'Hydrogen' }, { value: 'electricity', label: 'Electricity' },
  { value: 'other', label: 'Other' },
];

const COUNTRIES = [
  'EG', 'TR', 'IN', 'SA', 'AE', 'MA', 'ZA', 'CN', 'BR', 'UA', 'OTHER',
];

export function FacilitiesClient({ facilities: init, orgId, userRole }: { facilities: Facility[]; orgId: string; userRole: string; }) {
  const [facilities, setFacilities] = useState(init);
  const [showAdd, setShowAdd]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [form, setForm]             = useState({ name: '', country: '', city: '', industry_sector: '', permit_number: '', capacity_mt_year: '' });

  const supabase   = createClient();
  const canEdit    = ['admin', 'analyst'].includes(userRole);

  async function handleAdd() {
    if (!form.name || !form.country || !form.industry_sector) return;
    setSaving(true);
    const { data, error } = await supabase.from('facilities').insert({
      org_id: orgId, name: form.name.trim(), country: form.country,
      city: form.city || null, industry_sector: form.industry_sector,
      permit_number: form.permit_number || null,
      capacity_mt_year: form.capacity_mt_year ? Number(form.capacity_mt_year) : null,
    }).select('*').single();
    if (!error && data) { setFacilities(p => [data as Facility, ...p]); setShowAdd(false); setForm({ name: '', country: '', city: '', industry_sector: '', permit_number: '', capacity_mt_year: '' }); }
    setSaving(false);
  }

  return (
    <>
      <div className="flex justify-end mb-5">
        {canEdit && <button onClick={() => setShowAdd(true)} className="btn btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />Add facility</button>}
      </div>

      <div className="card p-0 overflow-hidden">
        {facilities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Factory className="w-10 h-10 mb-3" style={{ color: 'hsl(var(--ink-tertiary))' }} />
            <p className="text-sm" style={{ color: 'hsl(var(--ink-secondary))' }}>No facilities yet</p>
            {canEdit && <button onClick={() => setShowAdd(true)} className="btn btn-primary btn-sm mt-3">Add facility</button>}
          </div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Country</th><th>City</th><th>Sector</th><th>Permit</th><th>Capacity (t/yr)</th></tr></thead>
            <tbody>
              {facilities.map(f => (
                <tr key={f.id}>
                  <td><div className="font-medium" style={{ color: 'hsl(var(--ink-primary))' }}>{f.name}</div></td>
                  <td style={{ color: 'hsl(var(--ink-secondary))' }}>{f.country}</td>
                  <td style={{ color: 'hsl(var(--ink-secondary))' }}>{f.city ?? '—'}</td>
                  <td><span className="badge badge-neutral capitalize">{f.industry_sector.replace('_', ' ')}</span></td>
                  <td style={{ color: 'hsl(var(--ink-tertiary))' }}>{f.permit_number ?? '—'}</td>
                  <td><span className="data-value">{f.capacity_mt_year?.toLocaleString() ?? '—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'hsl(0 0% 0% / 0.5)' }}
          onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="w-full max-w-md card">
            <h2 className="text-base font-semibold mb-4" style={{ color: 'hsl(var(--ink-primary))' }}>Add facility</h2>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Facility name *</label><input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input" autoFocus /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Country *</label>
                  <select value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} className="input">
                    <option value="">Select</option>{COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select></div>
                <div><label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>City</label><input type="text" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="input" /></div>
              </div>
              <div><label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Industry sector *</label>
                <select value={form.industry_sector} onChange={e => setForm({ ...form, industry_sector: e.target.value })} className="input">
                  <option value="">Select</option>{SECTORS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Permit number</label><input type="text" value={form.permit_number} onChange={e => setForm({ ...form, permit_number: e.target.value })} className="input" /></div>
                <div><label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Capacity (t/yr)</label><input type="number" value={form.capacity_mt_year} onChange={e => setForm({ ...form, capacity_mt_year: e.target.value })} className="input" /></div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowAdd(false)} className="btn btn-secondary btn-sm">Cancel</button>
              <button onClick={handleAdd} disabled={saving || !form.name || !form.country || !form.industry_sector} className="btn btn-primary btn-sm">{saving ? 'Adding…' : 'Add facility'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
