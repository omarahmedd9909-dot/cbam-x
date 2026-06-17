import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DEV_USER, isDevBypassEnabled } from '@/lib/dev-auth';
import { FacilitiesClient } from './FacilitiesClient';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Facilities' };

export default async function FacilitiesPage() {
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

  const { data: facilities } = await supabase
    .from('facilities')
    .select('*')
    .eq('org_id', org_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  return (
    <div className="page-container">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold" style={{ color: 'hsl(var(--ink-primary))' }}>Facilities</h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(var(--ink-secondary))' }}>
          Define the production facilities where your CBAM-covered goods are manufactured.
        </p>
      </div>
      <FacilitiesClient
        facilities={(facilities ?? []) as Parameters<typeof FacilitiesClient>[0]['facilities']}
        orgId={org_id}
        userRole={userRole}
      />
    </div>
  );
}
