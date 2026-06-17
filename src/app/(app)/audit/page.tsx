import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DEV_USER, isDevBypassEnabled } from '@/lib/dev-auth';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Audit Log' };

export default async function AuditPage() {
  const supabase = await createClient();
  const devBypass = isDevBypassEnabled();

  let org_id: string;
  let userRole: string;

  if (devBypass) {
    org_id = DEV_USER.org_id;
    userRole = DEV_USER.role;
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const { data: userData } = await supabase
      .from('users')
      .select('org_id, role, full_name')
      .eq('id', user.id)
      .single();
    if (!userData) redirect('/login');
    org_id = userData.org_id;
    userRole = userData.role;
  }

  if (!['admin', 'auditor'].includes(userRole)) redirect('/dashboard');

  const { data: logs } = await supabase
    .from('audit_logs')
    .select('*, user:users(full_name, role)')
    .eq('org_id', org_id)
    .order('created_at', { ascending: false })
    .limit(200);

  function formatDate(d: string) {
    return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="page-container">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold" style={{ color: 'hsl(var(--ink-primary))' }}>Audit log</h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(var(--ink-secondary))' }}>
          Immutable record of all actions taken in your workspace.
        </p>
      </div>
      <div className="card p-0 overflow-hidden">
        {!logs || logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm" style={{ color: 'hsl(var(--ink-secondary))' }}>No audit log entries yet</p>
          </div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Time</th><th>Action</th><th>Resource</th><th>User</th><th>Actor</th></tr></thead>
            <tbody>
              {(logs as Array<{ id: string; created_at: string; action: string; resource_type: string; resource_label: string | null; actor_type: string; user?: { full_name: string | null; role: string } | null }>).map(log => (
                <tr key={log.id}>
                  <td><span className="font-mono text-xs" style={{ color: 'hsl(var(--ink-tertiary))' }}>{formatDate(log.created_at)}</span></td>
                  <td><span className="badge badge-neutral capitalize">{log.action}</span></td>
                  <td>
                    <div className="text-sm capitalize" style={{ color: 'hsl(var(--ink-primary))' }}>{log.resource_type.replace(/_/g, ' ')}</div>
                    {log.resource_label && <div className="text-xs" style={{ color: 'hsl(var(--ink-tertiary))' }}>{log.resource_label}</div>}
                  </td>
                  <td style={{ color: 'hsl(var(--ink-secondary))' }}>{log.user?.full_name ?? '—'}</td>
                  <td><span className="badge badge-neutral capitalize">{log.actor_type}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
