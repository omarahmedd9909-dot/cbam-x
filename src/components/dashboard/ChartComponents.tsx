'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Shield, Zap, FileText, Users, Package, Send, Settings } from 'lucide-react';
import { clsx } from 'clsx';
import type { AuditLog } from '@/types/domain';

// ============================================================
// EmissionsSummaryChart
// ============================================================

interface EmissionsDataItem {
  product_id: string;
  total_co2e: number | null;
  method: string;
  products: { name: string; cbam_sector: string | null } | null;
}

interface EmissionsSummaryChartProps {
  data: EmissionsDataItem[];
  period: string;
}

const SECTOR_COLORS: Record<string, string> = {
  iron_steel:   '#3B7CFF',
  aluminum:     '#22C55E',
  cement:       '#F59E0B',
  fertilizers:  '#8B5CF6',
  hydrogen:     '#06B6D4',
  electricity:  '#EC4899',
  other:        '#9CA3AF',
};

export function EmissionsSummaryChart({ data, period }: EmissionsSummaryChartProps) {
  const chartData = data
    .filter((d) => d.total_co2e !== null && d.total_co2e > 0)
    .map((d) => ({
      name: d.products?.name ?? 'Unknown',
      value: Math.round((d.total_co2e ?? 0) * 10) / 10,
      sector: d.products?.cbam_sector ?? 'other',
      method: d.method,
    }))
    .slice(0, 8);

  const totalCO2e = chartData.reduce((sum, d) => sum + d.value, 0);

  const CustomTooltip = ({ active, payload }: {
    active?: boolean;
    payload?: Array<{ payload: { name: string; value: number; sector: string; method: string } }>;
  }) => {
    if (active && payload && payload.length > 0) {
      const d = payload[0]?.payload;
      if (!d) return null;
      return (
        <div
          className="px-3 py-2 rounded-lg border text-xs"
          style={{
            background: 'hsl(var(--surface-raised))',
            borderColor: 'hsl(var(--border))',
            color: 'hsl(var(--ink-primary))',
          }}
        >
          <div className="font-medium mb-1">{d.name}</div>
          <div className="font-mono">{d.value.toLocaleString()} tCO₂e</div>
          <div
            className="capitalize mt-0.5"
            style={{ color: 'hsl(var(--ink-tertiary))' }}
          >
            {d.method} values · {d.sector.replace('_', ' ')}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--ink-tertiary))]">
            Embedded emissions
          </div>
          <div className="text-sm text-[hsl(var(--ink-secondary))] mt-0.5">{period} · by product</div>
        </div>
        {totalCO2e > 0 && (
          <div className="text-right">
            <div className="text-xl font-semibold data-value text-[hsl(var(--ink-primary))]">
              {totalCO2e.toLocaleString()}
            </div>
            <div className="text-xs text-[hsl(var(--ink-tertiary))]">total tCO₂e</div>
          </div>
        )}
      </div>

      {chartData.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8">
          <Zap className="w-8 h-8 text-[hsl(var(--ink-tertiary))] mb-3" />
          <p className="text-sm text-[hsl(var(--ink-secondary))]">No emission calculations yet</p>
          <p className="text-xs text-[hsl(var(--ink-tertiary))] mt-0.5">
            Run your first calculation to see data
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
            >
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: 'hsl(var(--ink-tertiary))' }}
                tickFormatter={(v: number) => `${v.toLocaleString()}`}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tick={{ fontSize: 11, fill: 'hsl(var(--ink-secondary))' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--surface-sunken))' }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={SECTOR_COLORS[entry.sector] ?? SECTOR_COLORS.other}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ============================================================
// RecentActivityFeed
// ============================================================

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  create: FileText,
  update: Settings,
  delete: Shield,
  approve: Shield,
  submit: Send,
  upload: FileText,
  invite: Users,
  calculate: Zap,
};

const ACTION_COLORS: Record<string, string> = {
  create: 'hsl(var(--accent))',
  update: 'hsl(var(--ink-tertiary))',
  delete: 'hsl(var(--danger))',
  approve: 'hsl(var(--success))',
  submit: 'hsl(var(--accent))',
  upload: 'hsl(var(--accent))',
  invite: 'hsl(var(--warning))',
  calculate: 'hsl(var(--accent))',
};

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = (now.getTime() - date.getTime()) / 1000;

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function RecentActivityFeed({ activity }: { activity: (AuditLog & { user?: { full_name: string | null; role: string } | null })[] }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--ink-tertiary))]">
          Recent activity
        </div>
      </div>

      {activity.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm text-[hsl(var(--ink-secondary))]">No activity yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Resource</th>
                <th>User</th>
                <th className="text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((log) => {
                const Icon = ACTION_ICONS[log.action] ?? FileText;
                const color = ACTION_COLORS[log.action] ?? 'hsl(var(--ink-tertiary))';
                return (
                  <tr key={log.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                        <span className="capitalize">{log.action}</span>
                        <span className="text-[hsl(var(--ink-tertiary))] capitalize">
                          {log.resource_type.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="text-[hsl(var(--ink-secondary))] truncate max-w-[200px] block">
                        {log.resource_label ?? log.resource_id?.slice(0, 8) ?? '—'}
                      </span>
                    </td>
                    <td>
                      <span className="text-[hsl(var(--ink-secondary))]">
                        {log.user?.full_name ?? log.actor_type}
                      </span>
                    </td>
                    <td className="text-right">
                      <span className="text-[hsl(var(--ink-tertiary))] tabular-nums">
                        {formatTimeAgo(log.created_at)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
