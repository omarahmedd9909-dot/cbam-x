'use client';

import Link from 'next/link';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import type { ComplianceScore } from '@/types/domain';

interface ComplianceScoreCardProps {
  score: ComplianceScore | null;
  period: string;
  orgId: string;
}

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // 326.73

type RiskConfig = {
  color: string;
  label: string;
  ringColor: string;
  badgeClass: string;
};

function getRiskConfig(score: number): RiskConfig {
  if (score >= 85) return {
    color: 'hsl(var(--success))',
    label: 'Low risk',
    ringColor: '#22C55E',
    badgeClass: 'badge-success',
  };
  if (score >= 65) return {
    color: 'hsl(var(--warning))',
    label: 'Medium risk',
    ringColor: '#F59E0B',
    badgeClass: 'badge-warning',
  };
  if (score >= 40) return {
    color: 'hsl(var(--danger))',
    label: 'High risk',
    ringColor: '#EF4444',
    badgeClass: 'badge-danger',
  };
  return {
    color: 'hsl(var(--danger))',
    label: 'Critical',
    ringColor: '#DC2626',
    badgeClass: 'badge-danger',
  };
}

const DIMENSION_LABELS: Record<string, string> = {
  data_completeness: 'Data completeness',
  supplier_coverage: 'Supplier coverage',
  calculation_quality: 'Calc. quality',
  evidence_quality: 'Evidence',
  submission_readiness: 'Submission ready',
};

export function ComplianceScoreCard({ score, period, orgId }: ComplianceScoreCardProps) {
  const overallScore = score?.overall_score ?? 0;
  const dimensions = score?.dimension_scores ?? {};
  const config = getRiskConfig(overallScore);

  const dashOffset = RING_CIRCUMFERENCE * (1 - overallScore / 100);

  if (!score) {
    return (
      <div className="card h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--ink-tertiary))]">
              Compliance score
            </div>
            <div className="text-sm text-[hsl(var(--ink-secondary))] mt-0.5">{period}</div>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center py-6">
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-[hsl(var(--border))] flex items-center justify-center mb-3">
            <RefreshCw className="w-6 h-6 text-[hsl(var(--ink-tertiary))]" />
          </div>
          <p className="text-sm text-[hsl(var(--ink-secondary))] text-center">
            No score yet for this period.
          </p>
          <p className="text-xs text-[hsl(var(--ink-tertiary))] text-center mt-1">
            Add products and suppliers to compute.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--ink-tertiary))]">
            Compliance score
          </div>
          <div className="text-sm text-[hsl(var(--ink-secondary))] mt-0.5">{period}</div>
        </div>
        <span className={clsx('badge', config.badgeClass)}>
          {config.label}
        </span>
      </div>

      {/* Score ring */}
      <div className="flex items-center gap-6 mb-5">
        <div className="relative flex-shrink-0">
          <svg width="120" height="120" viewBox="0 0 120 120" className="transform -rotate-90">
            {/* Track */}
            <circle
              cx="60"
              cy="60"
              r={RING_RADIUS}
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth="8"
            />
            {/* Progress */}
            <circle
              cx="60"
              cy="60"
              r={RING_RADIUS}
              fill="none"
              stroke={config.ringColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              style={{
                transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-3xl font-semibold data-value"
              style={{ color: config.ringColor }}
            >
              {Math.round(overallScore)}
            </span>
            <span className="text-xs text-[hsl(var(--ink-tertiary))]">/ 100</span>
          </div>
        </div>

        {/* Dimension breakdown */}
        <div className="flex-1 space-y-2">
          {Object.entries(DIMENSION_LABELS).map(([key, label]) => {
            const val = (dimensions as Record<string, number>)[key] ?? 0;
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs text-[hsl(var(--ink-secondary))]">{label}</span>
                  <span className="text-xs font-medium data-value text-[hsl(var(--ink-primary))]">
                    {Math.round(val)}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-[hsl(var(--border))] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${val}%`,
                      backgroundColor: val >= 85 ? '#22C55E' : val >= 65 ? '#F59E0B' : '#EF4444',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Issue counts */}
      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[hsl(var(--border-subtle))]">
        <div className="metric-card">
          <div className="metric-label">Open issues</div>
          <div
            className={clsx(
              'metric-value',
              score.open_issue_count > 0 && 'text-[hsl(var(--warning))]'
            )}
          >
            {score.open_issue_count}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Critical</div>
          <div
            className={clsx(
              'metric-value',
              score.critical_issue_count > 0 && 'text-[hsl(var(--danger))]'
            )}
          >
            {score.critical_issue_count}
          </div>
        </div>
      </div>
    </div>
  );
}
