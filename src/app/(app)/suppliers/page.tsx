import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DEV_USER, isDevBypassEnabled } from '@/lib/dev-auth';
import { SuppliersClient } from './SuppliersClient';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Suppliers' };

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; invite?: string }>;
}) {
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

  const params = await searchParams;

  const [suppliersRes, questionnaireRes, frameworkRes] = await Promise.all([
    supabase
      .from('suppliers')
      .select('*')
      .eq('org_id', org_id)
      .order('created_at', { ascending: false }),

    supabase
      .from('supplier_questionnaires')
      .select('supplier_id, status, period, due_date')
      .eq('org_id', org_id),

    supabase
      .from('compliance_frameworks')
      .select('id, name, slug')
      .eq('slug', 'cbam')
      .single(),
  ]);

  return (
    <div className="page-container">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold" style={{ color: 'hsl(var(--ink-primary))' }}>
          Suppliers
        </h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(var(--ink-secondary))' }}>
          Manage your supplier relationships and track CBAM declaration data collection.
        </p>
      </div>
      <SuppliersClient
        suppliers={(suppliersRes.data ?? []) as Parameters<typeof SuppliersClient>[0]['suppliers']}
        questionnaires={(questionnaireRes.data ?? []) as Parameters<typeof SuppliersClient>[0]['questionnaires']}
        frameworkId={frameworkRes.data?.id ?? ''}
        orgId={org_id}
        userRole={userRole}
        defaultOpenInvite={params.invite === '1'}
        defaultFilter={params.filter}
      />
    </div>
  );
}
