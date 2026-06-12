'use client';

import Link from 'next/link';
import { Clock, AlertTriangle, CheckCircle, Users, FileText, Zap, Plus, ArrowRight, AlertCircle, Info, TrendingUp } from 'lucide-react';
import { clsx } from 'clsx';
import type { ComplianceIssue, OrgRegulationAlert } from '@/types/domain';

// ============================================================
// DeadlineCountdown
// ============================================================

interface DeadlineCountdownProps {
  daysRemaining: number;
  deadline: string;
  period: string;
  submission: {
    id: string;
    status: string;
    submitted_at: string | null;
  } | null;
}

export function DeadlineCountdown({ daysRemaining, deadline, period, submission }: DeadlineCountdownProps) {
  const isSubmitted = submission?.status === 'submitted' || submission?.status === 'accepted';
  const urgencyColor = isSubmitted
    ? 'hsl(var(--success))'
    : daysRemaining <= 7
    ? 'hsl(var(--danger))'
    : daysRemaining <= 21
    ? 'hsl(var(--warning))'
    : 'hsl(var(--accent))';

  const deadlineDate = new Date(deadline).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="card h-full flex flex-col">
      <div className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--ink-tertiary))] mb-4">
        Submission deadline
      </div>

      {isSubmitted ? (
        <div className="flex-1 flex flex-col items-center justify-center py-4">
          <div className="w-14 h-14 rounded-full bg-[hsl(var(--success-muted))] flex items-center justify-center mb-3">
            <CheckCircle className="w-7 h-7" style={{ color: 'hsl(var(--success))' }} />
          </div>
          <div className="text-lg font-semibold text-[hsl(var(--success))] mb-1">Submitted</div>
          <div className="text-xs text-[hsl(var(--ink-tertiary))]">{period}</div>
          {submission?.submitted_at && (
            <div className="text-xs text-[hsl(var(--ink-secondary))] mt-1">
              {new Date(submission.submitted_at).toLocaleDateString()}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-4">
          <div
            className="text-6xl font-semibold data-value mb-1 leading-none"
            style={{ color: urgencyColor }}
          >
            {Math.max(0, daysRemaining)}
          </div>
          <div className="text-sm text-[hsl(var(--ink-secondary))] mb-3">
            days remaining
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--ink-tertiary))]">
            <Clock className="w-3 h-3" />
            Due {deadlineDate}
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-[hsl(var(--border-subtle))]">
        <Link
          href="/submissions"
          className="flex items-center justify-between text-sm text-[hsl(var(--accent))] hover:text-[hsl(var(--accent))] hover:underline"
        >
          {isSubmitted ? 'View submission' : 'Start submission'}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

// ============================================================
// SupplierStatusSummary
// ============================================================

interface SupplierStats {
  total: number;
  active: number;
  pending: number;
  overdue: number;
}

export function SupplierStatusSummary({ stats }: { stats: SupplierStats }) {
  const pctComplete = stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0;

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--ink-tertiary))]">
          Supplier coverage
        </div>
        <Link
          href="/suppliers"
          className="text-xs text-[hsl(var(--accent))] hover:underline"
        >
          Manage
        </Link>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-end justify-between mb-1.5">
          <span className="text-3xl font-semibold data-value text-[hsl(var(--ink-primary))]">
            {pctComplete}%
          </span>
          <span className="text-xs text-[hsl(var(--ink-tertiary))] mb-1">
            {stats.active}/{stats.total} suppliers
          </span>
        </div>
        <div className="h-2 rounded-full bg-[hsl(var(--border))] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pctComplete}%`,
              backgroundColor: pctComplete >= 80 ? '#22C55E' : pctComplete >= 50 ? '#F59E0B' : '#EF4444',
            }}
          />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 flex-1">
        <div className="metric-card">
          <div className="metric-label">Active</div>
          <div className="metric-value text-[hsl(var(--success))]">{stats.active}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Pending</div>
          <div className="metric-value text-[hsl(var(--warning))]">{stats.pending}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Overdue</div>
          <div className={clsx('metric-value', stats.overdue > 0 && 'text-[hsl(var(--danger))]')}>
            {stats.overdue}
          </div>
        </div>
      </div>

      {stats.overdue > 0 && (
        <div className="mt-3 pt-3 border-t border-[hsl(var(--border-subtle))]">
          <Link
            href="/suppliers?filter=overdue"
            className="flex items-center gap-2 text-xs text-[hsl(var(--danger))]"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            {stats.overdue} supplier{stats.overdue !== 1 ? 's' : ''} overdue — chase now
            <ArrowRight className="w-3 h-3 ml-auto" />
          </Link>
        </div>
      )}
    </div>
  );
}

// ============================================================
// OpenIssuesList
// ============================================================

const SEVERITY_CONFIG = {
  critical: { class: 'badge-danger', icon: AlertTriangle, dotColor: '#EF4444' },
  high: { class: 'badge-danger', icon: AlertCircle, dotColor: '#EF4444' },
  medium: { class: 'badge-warning', icon: AlertCircle, dotColor: '#F59E0B' },
  low: { class: 'badge-neutral', icon: Info, dotColor: '#9CA3AF' },
  info: { class: 'badge-neutral', icon: Info, dotColor: '#9CA3AF' },
} as const;

export function OpenIssuesList({
  issues,
  period,
}: {
  issues: ComplianceIssue[];
  period: string;
}) {
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--ink-tertiary))]">
            Open issues
          </div>
          <div className="text-sm text-[hsl(var(--ink-secondary))] mt-0.5">{period}</div>
        </div>
        <div className="flex items-center gap-2">
          {criticalCount > 0 && (
            <span className="badge badge-danger">{criticalCount} critical</span>
          )}
          {issues.length === 0 && (
            <span className="badge badge-success">All clear</span>
          )}
        </div>
      </div>

      {issues.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8">
          <div className="w-12 h-12 rounded-full bg-[hsl(var(--success-muted))] flex items-center justify-center mb-3">
            <CheckCircle className="w-6 h-6" style={{ color: 'hsl(var(--success))' }} />
          </div>
          <p className="text-sm text-[hsl(var(--ink-secondary))]">No open issues</p>
          <p className="text-xs text-[hsl(var(--ink-tertiary))] mt-0.5">Great compliance posture</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          <div className="space-y-1.5">
            {issues.map((issue) => {
              const cfg = SEVERITY_CONFIG[issue.severity] ?? SEVERITY_CONFIG.low;
              const IssueIcon = cfg.icon;
              return (
                <div
                  key={issue.id}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-[hsl(var(--surface-sunken))] transition-colors group"
                >
                  <div className="mt-0.5 flex-shrink-0">
                    <IssueIcon
                      className="w-4 h-4"
                      style={{ color: cfg.dotColor }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[hsl(var(--ink-primary))] truncate">
                      {issue.title}
                    </div>
                    {issue.entity_label && (
                      <div className="text-xs text-[hsl(var(--ink-tertiary))] truncate mt-0.5">
                        {issue.entity_label}
                      </div>
                    )}
                    {issue.resolution_steps.length > 0 && (
                      <div className="text-xs text-[hsl(var(--accent))] mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {issue.resolution_steps[0]?.action}
                      </div>
                    )}
                  </div>
                  <span className={clsx('badge flex-shrink-0', cfg.class)}>
                    {issue.severity}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <div className="pt-3 border-t border-[hsl(var(--border-subtle))] mt-2">
          <Link
            href={`/dashboard/issues`}
            className="text-xs text-[hsl(var(--accent))] hover:underline flex items-center gap-1"
          >
            View all issues <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

// ============================================================
// QuickActions
// ============================================================

export function QuickActions({ period }: { period: string }) {
  const actions = [
    { label: 'New calculation', href: '/emissions/new', icon: Zap },
    { label: 'Upload document', href: '/documents?upload=1', icon: FileText },
    { label: 'Invite supplier', href: '/suppliers?invite=1', icon: Users },
  ];

  return (
    <div className="flex items-center gap-2">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="btn btn-secondary btn-sm flex items-center gap-1.5"
        >
          <action.icon className="w-3.5 h-3.5" />
          {action.label}
        </Link>
      ))}
    </div>
  );
}

// ============================================================
// RegAlertsBanner
// ============================================================

export function RegAlertsBanner({
  alerts,
}: {
  alerts: (OrgRegulationAlert & { update?: { title: string; severity: string; action_required: boolean } })[];
}) {
  const critical = alerts.filter((a) => a.update?.severity === 'critical' || a.action_required);
  const hasCritical = critical.length > 0;

  return (
    <div
      className={clsx(
        'flex items-start gap-3 px-4 py-3 rounded-xl border',
        hasCritical
          ? 'bg-[hsl(var(--danger-muted))] border-[hsl(var(--danger)/0.3)]'
          : 'bg-[hsl(var(--warning-muted))] border-[hsl(var(--warning)/0.3)]'
      )}
    >
      <AlertTriangle
        className="w-4 h-4 mt-0.5 flex-shrink-0"
        style={{ color: hasCritical ? 'hsl(var(--danger))' : 'hsl(var(--warning))' }}
      />
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium"
          style={{ color: hasCritical ? 'hsl(var(--danger))' : 'hsl(var(--warning))' }}
        >
          {hasCritical ? 'Regulatory action required' : 'Regulatory updates available'}
        </div>
        <div className="text-xs text-[hsl(var(--ink-secondary))] mt-0.5 truncate">
          {alerts[0]?.update?.title}
          {alerts.length > 1 && ` and ${alerts.length - 1} more update${alerts.length > 2 ? 's' : ''}`}
        </div>
      </div>
      <Link
        href="/dashboard/reg-updates"
        className={clsx(
          'btn btn-sm flex-shrink-0',
          hasCritical ? 'btn-danger' : 'btn-secondary'
        )}
      >
        Review
      </Link>
    </div>
  );
}
