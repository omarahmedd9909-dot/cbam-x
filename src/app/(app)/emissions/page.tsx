import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { EmissionsClient } from './EmissionsClient';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Emissions' };

export default async function EmissionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('org_id, role').eq('id', user.id).single();
  if (!userData) redirect('/login');

  const now = new Date();
  const period = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;

  const [productsRes, facilitiesRes, calculationsRes, factorsRes, frameworkRes] = await Promise.all([
    supabase.from('products').select('*, facility:facilities(id, name, country)').eq('org_id', userData.org_id).eq('is_active', true).eq('is_cbam_covered', true),
    supabase.from('facilities').select('id, name, country, industry_sector').eq('org_id', userData.org_id).eq('is_active', true),
    supabase.from('emission_calculations').select('*, product:products(id, name, cbam_sector)').eq('org_id', userData.org_id).order('created_at', { ascending: false }).limit(50),
    supabase.from('emission_factors').select('*').eq('is_default', true),
    supabase.from('compliance_frameworks').select('id').eq('slug', 'cbam').single(),
  ]);

  return (
    <div className="page-container">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold" style={{ color: 'hsl(var(--ink-primary))' }}>Emissions</h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(var(--ink-secondary))' }}>
          Calculate embedded emissions for your CBAM-covered products using actual or EU default values.
        </p>
      </div>
      <EmissionsClient
        products={(productsRes.data ?? []) as Parameters<typeof EmissionsClient>[0]['products']}
        facilities={(facilitiesRes.data ?? []) as Parameters<typeof EmissionsClient>[0]['facilities']}
        calculations={(calculationsRes.data ?? []) as Parameters<typeof EmissionsClient>[0]['calculations']}
        defaultFactors={(factorsRes.data ?? []) as Parameters<typeof EmissionsClient>[0]['defaultFactors']}
        frameworkId={frameworkRes.data?.id ?? ''}
        orgId={userData.org_id}
        userId={user.id}
        userRole={userData.role}
        currentPeriod={period}
      />
    </div>
  );
}
