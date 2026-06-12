import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FacilitiesClient } from './FacilitiesClient';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Facilities' };

export default async function FacilitiesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('org_id, role').eq('id', user.id).single();
  if (!userData) redirect('/login');

  const { data: facilities } = await supabase
    .from('facilities')
    .select('*')
    .eq('org_id', userData.org_id)
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
        orgId={userData.org_id}
        userRole={userData.role}
      />
    </div>
  );
}
