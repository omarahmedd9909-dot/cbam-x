'use client';

import React, { useState } from 'react';
import { Plus, Zap, CheckCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { clsx } from 'clsx';

interface Product { id: string; name: string; cn_code: string; cbam_sector: string | null; facility?: { id: string; name: string; country: string } | null; }
interface Facility { id: string; name: string; country: string; industry_sector: string; }
interface Calculation {
  id: string; period: string; method: string; total_embedded: number | null; total_co2e: number | null;
  production_volume: number | null; is_approved: boolean; created_at: string;
  product?: { id: string; name: string; cbam_sector: string | null } | null;
}
interface EmissionFactor { id: string; sector: string; factor_value: number; unit: string; }

interface EmissionsClientProps {
  products: Product[];
  facilities: Facility[];
  calculations: Calculation[];
  defaultFactors: EmissionFactor[];
  frameworkId: string;
  orgId: string;
  userId: string;
  userRole: string;
  currentPeriod: string;
}

const FUEL_TYPES = [
  { value: 'natural_gas',       label: 'Natural gas' },
  { value: 'coal_bituminous',   label: 'Bituminous coal' },
  { value: 'coal_coking',       label: 'Coking coal' },
  { value: 'heavy_fuel_oil',    label: 'Heavy fuel oil' },
  { value: 'diesel',            label: 'Diesel' },
  { value: 'lpg',               label: 'LPG' },
  { value: 'biomass',           label: 'Biomass' },
];

export function EmissionsClient({ products, facilities, calculations: initialCalcs, defaultFactors, frameworkId, orgId, userId, userRole, currentPeriod }: EmissionsClientProps) {
  const [calculations, setCalculations] = useState(initialCalcs);
  const [showForm, setShowForm]         = useState(false);
  const [saving, setSaving]             = useState(false);
  const [expandedId, setExpandedId]     = useState<string | null>(null);

  const [form, setForm] = useState({
    product_id: '',
    facility_id: '',
    period: currentPeriod,
    method: 'actual' as 'actual' | 'default',
    production_volume: '',
    fuel_type: '',
    fuel_consumption: '',
    fuel_unit: 'GJ',
    process_emissions: '',
    electricity_mwh: '',
    electricity_factor: '',
    notes: '',
  });

  const canEdit = ['admin', 'analyst'].includes(userRole);

  const selectedProduct = products.find(p => p.id === form.product_id);

  // Get default factor for selected product's sector
  const defaultFactor = defaultFactors.find(f => f.sector === selectedProduct?.cbam_sector);

  async function handleCalculate() {
    if (!form.product_id || !form.production_volume) return;
    setSaving(true);

    const body = {
      product_id: form.product_id,
      facility_id: form.facility_id || undefined,
      period: form.period,
      method: form.method,
      production_volume: Number(form.production_volume),
      direct_inputs: {
        fuel_type: form.fuel_type || undefined,
        fuel_consumption: form.fuel_consumption ? Number(form.fuel_consumption) : undefined,
        fuel_unit: form.fuel_unit,
        process_emissions: form.process_emissions ? Number(form.process_emissions) : undefined,
      },
      indirect_inputs: {
        electricity_consumption_mwh: form.electricity_mwh ? Number(form.electricity_mwh) : undefined,
        electricity_emission_factor: form.electricity_factor ? Number(form.electricity_factor) : undefined,
      },
      notes: form.notes || undefined,
    };

    try {
      const res = await fetch('/api/emissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? `Calculation failed (${res.status})`);
      }

      const result = await res.json();
      if (result.data) {
        setCalculations(prev => [{ ...result.data, product: selectedProduct } as Calculation, ...prev]);
        setShowForm(false);
        setForm({ product_id: '', facility_id: '', period: currentPeriod, method: 'actual', production_volume: '', fuel_type: '', fuel_consumption: '', fuel_unit: 'GJ', process_emissions: '', electricity_mwh: '', electricity_factor: '', notes: '' });
      }
    } catch (err) {
      console.error('Calculation error:', err);
      alert(`Failed to run calculation: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  const totalCO2e = calculations.filter(c => c.period === currentPeriod).reduce((sum, c) => sum + (c.total_co2e ?? 0), 0);

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <div className="metric-card"><div className="metric-label">Total tCO₂e ({currentPeriod})</div><div className="metric-value">{totalCO2e.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div></div>
        <div className="metric-card"><div className="metric-label">Calculations</div><div className="metric-value">{calculations.filter(c => c.period === currentPeriod).length}</div></div>
        <div className="metric-card"><div className="metric-label">Approved</div><div className="metric-value" style={{ color: 'hsl(var(--success))' }}>{calculations.filter(c => c.is_approved).length}</div></div>
        <div className="metric-card"><div className="metric-label">Pending approval</div><div className="metric-value" style={{ color: 'hsl(var(--warning))' }}>{calculations.filter(c => !c.is_approved).length}</div></div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between mb-5">
        <div className="text-sm" style={{ color: 'hsl(var(--ink-secondary))' }}>
          {products.length === 0 ? (
            <span style={{ color: 'hsl(var(--warning))' }}>⚠ No CBAM-covered products found. Add products first.</span>
          ) : (
            `${products.length} CBAM-covered product${products.length !== 1 ? 's' : ''} available`
          )}
        </div>
        {canEdit && products.length > 0 && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New calculation
          </button>
        )}
      </div>

      {/* Calculations table */}
      <div className="card p-0 overflow-hidden">
        {calculations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Zap className="w-10 h-10 mb-3" style={{ color: 'hsl(var(--ink-tertiary))' }} />
            <p className="text-sm font-medium" style={{ color: 'hsl(var(--ink-secondary))' }}>No calculations yet</p>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--ink-tertiary))' }}>Run your first emission calculation to get started</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Period</th>
                <th>Method</th>
                <th>Embedded (tCO₂e/unit)</th>
                <th>Volume</th>
                <th>Total tCO₂e</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {calculations.map(calc => (
                <React.Fragment key={calc.id}>
                  <tr key={calc.id}>
                    <td>
                      <div className="font-medium" style={{ color: 'hsl(var(--ink-primary))' }}>{calc.product?.name ?? '—'}</div>
                      <div className="text-xs capitalize" style={{ color: 'hsl(var(--ink-tertiary))' }}>{calc.product?.cbam_sector?.replace('_', ' ')}</div>
                    </td>
                    <td><span className="font-mono text-xs" style={{ color: 'hsl(var(--ink-secondary))' }}>{calc.period}</span></td>
                    <td><span className={clsx('badge', calc.method === 'actual' ? 'badge-success' : 'badge-warning')}>{calc.method}</span></td>
                    <td><span className="data-value font-medium" style={{ color: 'hsl(var(--ink-primary))' }}>{calc.total_embedded?.toFixed(4) ?? '—'}</span></td>
                    <td style={{ color: 'hsl(var(--ink-secondary))' }}>{calc.production_volume?.toLocaleString() ?? '—'}</td>
                    <td><span className="data-value font-semibold" style={{ color: 'hsl(var(--ink-primary))' }}>{calc.total_co2e?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? '—'}</span></td>
                    <td>
                      {calc.is_approved
                        ? <span className="badge badge-success flex items-center gap-1 w-fit"><CheckCircle className="w-3 h-3" />Approved</span>
                        : <span className="badge badge-warning flex items-center gap-1 w-fit"><Clock className="w-3 h-3" />Pending</span>
                      }
                    </td>
                    <td>
                      <button onClick={() => setExpandedId(expandedId === calc.id ? null : calc.id)} className="btn btn-ghost btn-sm">
                        {expandedId === calc.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                  {expandedId === calc.id && (
                    <tr key={`${calc.id}-expanded`}>
                      <td colSpan={8} style={{ background: 'hsl(var(--surface-sunken))', padding: '16px 20px' }}>
                        <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'hsl(var(--ink-tertiary))' }}>Calculation breakdown</div>
                        <div className="grid grid-cols-3 gap-4">
                          <div><div className="text-xs" style={{ color: 'hsl(var(--ink-tertiary))' }}>Direct emissions</div><div className="data-value font-medium">{(calc as unknown as Record<string, number>).direct_emissions?.toFixed(6) ?? '—'} tCO₂e/unit</div></div>
                          <div><div className="text-xs" style={{ color: 'hsl(var(--ink-tertiary))' }}>Indirect emissions</div><div className="data-value font-medium">{(calc as unknown as Record<string, number>).indirect_emissions?.toFixed(6) ?? '—'} tCO₂e/unit</div></div>
                          <div><div className="text-xs" style={{ color: 'hsl(var(--ink-tertiary))' }}>Total embedded</div><div className="data-value font-semibold">{calc.total_embedded?.toFixed(6) ?? '—'} tCO₂e/unit</div></div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New calculation modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'hsl(0 0% 0% / 0.5)' }}
          onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="w-full max-w-xl card max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-semibold mb-5" style={{ color: 'hsl(var(--ink-primary))' }}>New emission calculation</h2>

            <div className="space-y-4">
              {/* Product & period */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Product *</label>
                  <select value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })} className="input">
                    <option value="">Select product</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Period *</label>
                  <input type="text" value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} className="input font-mono" placeholder="2025-Q1" />
                </div>
              </div>

              {/* Method */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Calculation method</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['actual', 'default'] as const).map(m => (
                    <button key={m} type="button" onClick={() => setForm({ ...form, method: m })}
                      className="p-3 rounded-lg border text-left transition-all"
                      style={{
                        borderColor: form.method === m ? 'hsl(var(--accent))' : 'hsl(var(--border))',
                        background: form.method === m ? 'hsl(var(--accent-subtle))' : 'transparent',
                      }}>
                      <div className="text-sm font-medium capitalize" style={{ color: 'hsl(var(--ink-primary))' }}>{m}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'hsl(var(--ink-tertiary))' }}>
                        {m === 'actual' ? 'Use monitored production data' : 'Use EU default sector values'}
                      </div>
                    </button>
                  ))}
                </div>
                {form.method === 'default' && defaultFactor && (
                  <div className="mt-2 p-2 rounded text-xs" style={{ background: 'hsl(var(--warning-muted))', color: 'hsl(var(--warning))' }}>
                    EU default: {defaultFactor.factor_value} {defaultFactor.unit} for {selectedProduct?.cbam_sector?.replace('_', ' ')}
                  </div>
                )}
              </div>

              {/* Production volume */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Production volume (tonnes) *</label>
                <input type="number" value={form.production_volume} onChange={e => setForm({ ...form, production_volume: e.target.value })} className="input" placeholder="e.g. 1200" />
              </div>

              {/* Direct inputs — show only for actual method */}
              {form.method === 'actual' && (
                <>
                  <div className="pt-2" style={{ borderTop: '1px solid hsl(var(--border-subtle))' }}>
                    <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'hsl(var(--ink-tertiary))' }}>Direct emissions</div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Fuel type</label>
                        <select value={form.fuel_type} onChange={e => setForm({ ...form, fuel_type: e.target.value })} className="input">
                          <option value="">None</option>
                          {FUEL_TYPES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Consumption</label>
                        <input type="number" value={form.fuel_consumption} onChange={e => setForm({ ...form, fuel_consumption: e.target.value })} className="input" placeholder="GJ" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Process tCO₂e</label>
                        <input type="number" value={form.process_emissions} onChange={e => setForm({ ...form, process_emissions: e.target.value })} className="input" placeholder="0" />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2" style={{ borderTop: '1px solid hsl(var(--border-subtle))' }}>
                    <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'hsl(var(--ink-tertiary))' }}>Indirect emissions</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Electricity (MWh)</label>
                        <input type="number" value={form.electricity_mwh} onChange={e => setForm({ ...form, electricity_mwh: e.target.value })} className="input" placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Grid factor (tCO₂e/MWh)</label>
                        <input type="number" value={form.electricity_factor} onChange={e => setForm({ ...form, electricity_factor: e.target.value })} className="input" placeholder="0.487" step="0.001" />
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="input h-auto py-2" style={{ resize: 'none' }} />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="btn btn-secondary btn-sm">Cancel</button>
              <button onClick={handleCalculate} disabled={saving || !form.product_id || !form.production_volume} className="btn btn-primary btn-sm">
                {saving ? 'Calculating…' : 'Run calculation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
