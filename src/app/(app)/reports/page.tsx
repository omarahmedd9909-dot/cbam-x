import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Reports' };

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('org_id').eq('id', user.id).single();
  if (!userData) redirect('/login');

  const { data: submissions } = await supabase
    .from('submissions')
    .select('id, period_quarter, status, compliance_score, submitted_at, eu_reference')
    .eq('org_id', userData.org_id)
    .order('created_at', { ascending: false });

  return (
    <div className="page-container">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold" style={{ color: 'hsl(var(--ink-primary))' }}>Reports</h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(var(--ink-secondary))' }}>
          Download compliance reports and submission packages for your records.
        </p>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
          <div className="text-sm font-medium" style={{ color: 'hsl(var(--ink-primary))' }}>Submission reports</div>
        </div>
        {!submissions || submissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm" style={{ color: 'hsl(var(--ink-secondary))' }}>No submissions yet — build your first submission to generate reports</p>
          </div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Period</th><th>Status</th><th>Score</th><th>EU Reference</th><th>Submitted</th><th /></tr></thead>
            <tbody>
              {(submissions as Array<{ id: string; period_quarter: string; status: string; compliance_score: number | null; submitted_at: string | null; eu_reference: string | null }>).map(sub => (
                <tr key={sub.id}>
                  <td><span className="font-mono font-medium" style={{ color: 'hsl(var(--ink-primary))' }}>{sub.period_quarter}</span></td>
                  <td><span className="badge badge-neutral capitalize">{sub.status}</span></td>
                  <td><span className="data-value">{sub.compliance_score ?? '—'}</span></td>
                  <td><span className="font-mono text-xs" style={{ color: 'hsl(var(--ink-secondary))' }}>{sub.eu_reference ?? '—'}</span></td>
                  <td style={{ color: 'hsl(var(--ink-tertiary))' }}>
                    {sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm text-xs">Download PDF</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
