'use client';

import { useState } from 'react';
import { TrendingUp, Euro, Info } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Calculation {
  id: string; period: string; total_co2e: number | null; method: string;
  products?: { name: string; cbam_sector: string | null; cn_code: string } | null;
}

interface FinancialClientProps {
  calculations: Calculation[];
  currentPeriod: string;
}

const SECTOR_COLORS: Record<string, string> = {
  iron_steel: '#3B7CFF', aluminum: '#22C55E', cement: '#F59E0B',
  fertilizers: '#8B5CF6', hydrogen: '#06B6D4', electricity: '#EC4899', other: '#9CA3AF',
};

export function FinancialClient({ calculations, currentPeriod }: FinancialClientProps) {
  // EU ETS price — user can adjust
  const [euEtsPrice, setEuEtsPrice] = useState(65); // EUR per tCO2e
  const [carbonPricePaid, setCarbonPricePaid] = useState(0); // already paid in origin country

  // Group by period
  const byPeriod = calculations.reduce((acc, c) => {
    if (!acc[c.period]) acc[c.period] = [];
    acc[c.period]!.push(c);
    return acc;
  }, {} as Record<string, Calculation[]>);

  const periods = Object.keys(byPeriod).sort().reverse().slice(0, 6);
  const currentCalcs = byPeriod[currentPeriod] ?? [];
  const totalCO2eCurrent = currentCalcs.reduce((sum, c) => sum + (c.total_co2e ?? 0), 0);

  const grossLiability = totalCO2eCurrent * euEtsPrice;
  const deduction = totalCO2eCurrent * carbonPricePaid;
  const netLiability = Math.max(0, grossLiability - deduction);
  const certificatesNeeded = Math.ceil(totalCO2eCurrent);

  const chartData = periods.map(p => ({
    period: p,
    co2e: byPeriod[p]!.reduce((sum, c) => sum + (c.total_co2e ?? 0), 0),
    liability: byPeriod[p]!.reduce((sum, c) => sum + (c.total_co2e ?? 0), 0) * euEtsPrice,
  }));

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
    if (active && payload && payload.length > 0) {
      return (
        <div className="px-3 py-2 rounded-lg border text-xs" style={{ background: 'hsl(var(--surface-raised))', borderColor: 'hsl(var(--border))' }}>
          <div className="font-medium mb-1">{label}</div>
          <div>tCO₂e: {payload[0]?.value?.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
        </div>
      );
    }
    return null;
  };

  return (
    <>
      {/* ETS price controls */}
      <div className="card mb-5">
        <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'hsl(var(--ink-tertiary))' }}>
          Carbon price inputs
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>
              EU ETS price (EUR/tCO₂e)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range" min={20} max={200} step={1} value={euEtsPrice}
                onChange={e => setEuEtsPrice(Number(e.target.value))}
                className="flex-1"
              />
              <div className="data-value text-lg font-semibold w-16 text-right" style={{ color: 'hsl(var(--ink-primary))' }}>
                €{euEtsPrice}
              </div>
            </div>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--ink-tertiary))' }}>
              Current EU ETS spot price — adjust to model scenarios
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>
              Carbon price already paid in origin country (EUR/tCO₂e)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range" min={0} max={euEtsPrice} step={1} value={carbonPricePaid}
                onChange={e => setCarbonPricePaid(Number(e.target.value))}
                className="flex-1"
              />
              <div className="data-value text-lg font-semibold w-16 text-right" style={{ color: 'hsl(var(--ink-primary))' }}>
                €{carbonPricePaid}
              </div>
            </div>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--ink-tertiary))' }}>
              Deducted from CBAM obligation if already paid
            </p>
          </div>
        </div>
      </div>

      {/* Liability summary */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <div className="metric-card">
          <div className="metric-label">Total tCO₂e ({currentPeriod})</div>
          <div className="metric-value">{totalCO2eCurrent.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">CBAM certificates needed</div>
          <div className="metric-value">{certificatesNeeded.toLocaleString()}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Gross liability</div>
          <div className="metric-value">€{grossLiability.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="metric-card" style={{ borderColor: netLiability > 50000 ? 'hsl(var(--danger) / 0.3)' : 'hsl(var(--border))' }}>
          <div className="metric-label">Net liability (after deductions)</div>
          <div className="metric-value" style={{ color: netLiability > 50000 ? 'hsl(var(--danger))' : 'hsl(var(--ink-primary))' }}>
            €{netLiability.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="card mb-5">
          <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'hsl(var(--ink-tertiary))' }}>
            tCO₂e by period
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'hsl(var(--ink-tertiary))' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--ink-tertiary))' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--surface-sunken))' }} />
              <Bar dataKey="co2e" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? 'hsl(var(--accent))' : 'hsl(var(--border-strong))'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Product breakdown */}
      {currentCalcs.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-4" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
            <div className="text-sm font-medium" style={{ color: 'hsl(var(--ink-primary))' }}>
              Product breakdown — {currentPeriod}
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr><th>Product</th><th>Sector</th><th>Method</th><th>tCO₂e</th><th>Certificates</th><th>Gross liability</th></tr>
            </thead>
            <tbody>
              {currentCalcs.map(calc => {
                const co2e = calc.total_co2e ?? 0;
                const certs = Math.ceil(co2e);
                const liability = co2e * euEtsPrice;
                return (
                  <tr key={calc.id}>
                    <td><div className="font-medium" style={{ color: 'hsl(var(--ink-primary))' }}>{calc.products?.name ?? '—'}</div></td>
                    <td><span className="badge badge-neutral capitalize">{calc.products?.cbam_sector?.replace('_', ' ') ?? '—'}</span></td>
                    <td><span className={`badge ${calc.method === 'actual' ? 'badge-success' : 'badge-warning'}`}>{calc.method}</span></td>
                    <td><span className="data-value">{co2e.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span></td>
                    <td><span className="data-value">{certs.toLocaleString()}</span></td>
                    <td><span className="data-value font-medium">€{liability.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {calculations.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <TrendingUp className="w-10 h-10 mb-3" style={{ color: 'hsl(var(--ink-tertiary))' }} />
          <p className="text-sm" style={{ color: 'hsl(var(--ink-secondary))' }}>No calculations yet</p>
          <p className="text-xs mt-1" style={{ color: 'hsl(var(--ink-tertiary))' }}>Add emission calculations to see your financial exposure</p>
        </div>
      )}
    </>
  );
}
