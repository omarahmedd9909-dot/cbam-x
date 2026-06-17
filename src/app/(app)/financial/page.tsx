import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DEV_USER, isDevBypassEnabled } from '@/lib/dev-auth';
import { FinancialClient } from './FinancialClient';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Financial Impact' };

export default async function FinancialPage() {
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

  const { data: calculations } = await supabase
    .from('emission_calculations')
    .select('id, period, total_co2e, total_embedded, method, products(name, cbam_sector, cn_code)')
    .eq('org_id', org_id)
    .order('period', { ascending: false });

  return (
    <div className="page-container">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold" style={{ color: 'hsl(var(--ink-primary))' }}>Financial impact</h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(var(--ink-secondary))' }}>
          Estimate your CBAM certificate purchase obligations based on current EU ETS carbon prices.
        </p>
      </div>
      <FinancialClient
        calculations={(calculations ?? []) as Parameters<typeof FinancialClient>[0]['calculations']}
        currentPeriod={currentPeriod}
      />
    </div>
  );
}
