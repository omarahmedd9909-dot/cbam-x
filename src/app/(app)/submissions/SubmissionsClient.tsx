'use client';

import { useState } from 'react';
import { Send, CheckCircle, Clock, XCircle, FileText, AlertTriangle, Download } from 'lucide-react';
import { clsx } from 'clsx';
import { createClient } from '@/lib/supabase/client';

interface Submission {
  id: string; status: string; period_quarter: string;
  compliance_score: number | null; submitted_at: string | null;
  eu_reference: string | null; created_at: string; notes: string | null;
}
interface Calculation {
  id: string; period: string; total_co2e: number | null; total_embedded: number | null;
  method: string; is_approved: boolean;
  products?: { name: string; cbam_sector: string | null; cn_code: string } | null;
}

interface SubmissionsClientProps {
  submissions: Submission[];
  calculations: Calculation[];
  framework: { id: string; name: string } | null;
  currentScore: { overall_score: number; risk_level: string } | null;
  orgId: string;
  currentPeriod: string;
  userRole: string;
}

const STATUS_CONFIG = {
  draft:      { label: 'Draft',       icon: Clock,         badge: 'badge-neutral',  color: 'hsl(var(--ink-tertiary))' },
  in_review:  { label: 'In review',   icon: Clock,         badge: 'badge-warning',  color: 'hsl(var(--warning))' },
  approved:   { label: 'Approved',    icon: CheckCircle,   badge: 'badge-success',  color: 'hsl(var(--success))' },
  submitted:  { label: 'Submitted',   icon: Send,          badge: 'badge-accent',   color: 'hsl(var(--accent))' },
  accepted:   { label: 'Accepted',    icon: CheckCircle,   badge: 'badge-success',  color: 'hsl(var(--success))' },
  rejected:   { label: 'Rejected',    icon: XCircle,       badge: 'badge-danger',   color: 'hsl(var(--danger))' },
} as const;

export function SubmissionsClient({ submissions: initialSubs, calculations, framework, currentScore, orgId, currentPeriod, userRole }: SubmissionsClientProps) {
  const [submissions, setSubmissions] = useState(initialSubs);
  const [creating, setCreating]       = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [notes, setNotes]             = useState('');

  const supabase = createClient();
  const canEdit = ['admin', 'analyst'].includes(userRole);

  const currentSubmission = submissions.find(s => s.period_quarter === currentPeriod);
  const approvedCalcs = calculations.filter(c => c.is_approved);
  const totalCO2e = calculations.reduce((sum, c) => sum + (c.total_co2e ?? 0), 0);
  const readyToSubmit = approvedCalcs.length > 0 && approvedCalcs.length === calculations.length;

  async function handleCreateDraft() {
    if (!framework) return;
    setCreating(true);

    const { data, error } = await supabase
      .from('submissions')
      .insert({
        org_id: orgId,
        framework_id: framework.id,
        period_quarter: currentPeriod,
        status: 'draft',
        calculation_ids: calculations.map(c => c.id),
        compliance_score: currentScore?.overall_score ?? null,
        notes: notes || null,
      })
      .select('*')
      .single();

    if (!error && data) {
      setSubmissions(prev => [data as Submission, ...prev]);
      setShowBuilder(false);
    }
    setCreating(false);
  }

  async function handleMarkSubmitted(submissionId: string) {
    const ref = `CBAM-${orgId.slice(0, 8).toUpperCase()}-${currentPeriod}`;
    await supabase
      .from('submissions')
      .update({ status: 'submitted', submitted_at: new Date().toISOString(), eu_reference: ref })
      .eq('id', submissionId);

    setSubmissions(prev => prev.map(s => s.id === submissionId
      ? { ...s, status: 'submitted', submitted_at: new Date().toISOString(), eu_reference: ref }
      : s
    ));
  }

  return (
    <>
      {/* Current period summary */}
      <div className="card mb-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'hsl(var(--ink-tertiary))' }}>
              Current period — {currentPeriod}
            </div>
            <div className="flex items-center gap-4 mt-3">
              <div className="metric-card flex-1">
                <div className="metric-label">Calculations</div>
                <div className="metric-value">{calculations.length}</div>
              </div>
              <div className="metric-card flex-1">
                <div className="metric-label">Approved</div>
                <div className="metric-value" style={{ color: approvedCalcs.length === calculations.length && calculations.length > 0 ? 'hsl(var(--success))' : 'hsl(var(--warning))' }}>
                  {approvedCalcs.length}/{calculations.length}
                </div>
              </div>
              <div className="metric-card flex-1">
                <div className="metric-label">Total tCO₂e</div>
                <div className="metric-value">{totalCO2e.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
              </div>
              <div className="metric-card flex-1">
                <div className="metric-label">Compliance score</div>
                <div className="metric-value">{currentScore?.overall_score ?? '—'}</div>
              </div>
            </div>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2 ml-6">
              {!currentSubmission ? (
                <button onClick={() => setShowBuilder(true)} className="btn btn-primary flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Build submission
                </button>
              ) : currentSubmission.status === 'draft' ? (
                <button onClick={() => handleMarkSubmitted(currentSubmission.id)} className="btn btn-primary flex items-center gap-2">
                  <Send className="w-4 h-4" />
                  Mark as submitted
                </button>
              ) : (
                <span className={clsx('badge', STATUS_CONFIG[currentSubmission.status as keyof typeof STATUS_CONFIG]?.badge ?? 'badge-neutral')}>
                  {STATUS_CONFIG[currentSubmission.status as keyof typeof STATUS_CONFIG]?.label ?? currentSubmission.status}
                </span>
              )}
            </div>
          )}
        </div>

        {!readyToSubmit && calculations.length > 0 && (
          <div className="mt-4 flex items-center gap-2 p-3 rounded-lg" style={{ background: 'hsl(var(--warning-muted))' }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'hsl(var(--warning))' }} />
            <p className="text-sm" style={{ color: 'hsl(var(--warning))' }}>
              {calculations.length - approvedCalcs.length} calculation{calculations.length - approvedCalcs.length !== 1 ? 's' : ''} still pending approval before submission.
            </p>
          </div>
        )}
      </div>

      {/* Calculations for this period */}
      {calculations.length > 0 && (
        <div className="card mb-5">
          <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'hsl(var(--ink-tertiary))' }}>
            Calculations included — {currentPeriod}
          </div>
          <table className="data-table">
            <thead>
              <tr><th>Product</th><th>CN Code</th><th>Method</th><th>Embedded (tCO₂e/unit)</th><th>Total tCO₂e</th><th>Status</th></tr>
            </thead>
            <tbody>
              {calculations.map(calc => (
                <tr key={calc.id}>
                  <td><div className="font-medium" style={{ color: 'hsl(var(--ink-primary))' }}>{calc.products?.name ?? '—'}</div></td>
                  <td><code className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: 'hsl(var(--surface-sunken))' }}>{calc.products?.cn_code ?? '—'}</code></td>
                  <td><span className={clsx('badge', calc.method === 'actual' ? 'badge-success' : 'badge-warning')}>{calc.method}</span></td>
                  <td><span className="data-value">{calc.total_embedded?.toFixed(4) ?? '—'}</span></td>
                  <td><span className="data-value font-semibold">{calc.total_co2e?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? '—'}</span></td>
                  <td>{calc.is_approved ? <span className="badge badge-success">Approved</span> : <span className="badge badge-warning">Pending</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Submission history */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
          <div className="text-sm font-medium" style={{ color: 'hsl(var(--ink-primary))' }}>Submission history</div>
        </div>
        {submissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Send className="w-8 h-8 mb-3" style={{ color: 'hsl(var(--ink-tertiary))' }} />
            <p className="text-sm" style={{ color: 'hsl(var(--ink-secondary))' }}>No submissions yet</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Period</th><th>Status</th><th>Score</th><th>EU Reference</th><th>Submitted</th></tr>
            </thead>
            <tbody>
              {submissions.map(sub => {
                const statusKey = sub.status as keyof typeof STATUS_CONFIG;
                const cfg = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.draft;
                const Icon = cfg.icon;
                return (
                  <tr key={sub.id}>
                    <td><span className="font-mono text-sm" style={{ color: 'hsl(var(--ink-primary))' }}>{sub.period_quarter}</span></td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                        <span className={clsx('badge', cfg.badge)}>{cfg.label}</span>
                      </div>
                    </td>
                    <td><span className="data-value">{sub.compliance_score ?? '—'}</span></td>
                    <td><span className="font-mono text-xs" style={{ color: 'hsl(var(--ink-secondary))' }}>{sub.eu_reference ?? '—'}</span></td>
                    <td style={{ color: 'hsl(var(--ink-tertiary))' }}>
                      {sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Build submission modal */}
      {showBuilder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'hsl(0 0% 0% / 0.5)' }}
          onClick={e => e.target === e.currentTarget && setShowBuilder(false)}>
          <div className="w-full max-w-md card">
            <h2 className="text-base font-semibold mb-2" style={{ color: 'hsl(var(--ink-primary))' }}>Build submission — {currentPeriod}</h2>
            <p className="text-sm mb-4" style={{ color: 'hsl(var(--ink-secondary))' }}>
              This will create a draft submission package with {calculations.length} calculation{calculations.length !== 1 ? 's' : ''} totalling {totalCO2e.toFixed(1)} tCO₂e.
            </p>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="input h-auto py-2" style={{ resize: 'none' }} placeholder="Any notes for this submission…" />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowBuilder(false)} className="btn btn-secondary btn-sm">Cancel</button>
              <button onClick={handleCreateDraft} disabled={creating || calculations.length === 0} className="btn btn-primary btn-sm">
                {creating ? 'Creating…' : 'Create draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
