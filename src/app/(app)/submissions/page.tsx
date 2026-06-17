import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DEV_USER, isDevBypassEnabled } from '@/lib/dev-auth';
import { SubmissionsClient } from './SubmissionsClient';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Submissions' };

export default async function SubmissionsPage() {
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

  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;

  const [submissionsRes, calculationsRes, frameworkRes, scoreRes] = await Promise.all([
    supabase.from('submissions').select('*').eq('org_id', org_id).order('created_at', { ascending: false }),
    supabase.from('emission_calculations').select('id, product_id, period, total_co2e, total_embedded, method, is_approved, products(name, cbam_sector, cn_code)').eq('org_id', org_id).eq('period', currentPeriod),
    supabase.from('compliance_frameworks').select('id, name').eq('slug', 'cbam').single(),
    supabase.from('compliance_scores').select('overall_score, risk_level').eq('org_id', org_id).eq('period', currentPeriod).order('version', { ascending: false }).limit(1).maybeSingle(),
  ]);

  return (
    <div className="page-container">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold" style={{ color: 'hsl(var(--ink-primary))' }}>Submissions</h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(var(--ink-secondary))' }}>
          Build and submit your quarterly CBAM declaration to the EU registry.
        </p>
      </div>
      <SubmissionsClient
        submissions={(submissionsRes.data ?? []) as Parameters<typeof SubmissionsClient>[0]['submissions']}
        calculations={(calculationsRes.data ?? []) as Parameters<typeof SubmissionsClient>[0]['calculations']}
        framework={frameworkRes.data as Parameters<typeof SubmissionsClient>[0]['framework']}
        currentScore={scoreRes.data as Parameters<typeof SubmissionsClient>[0]['currentScore']}
        orgId={org_id}
        currentPeriod={currentPeriod}
        userRole={userRole}
      />
    </div>
  );
}
