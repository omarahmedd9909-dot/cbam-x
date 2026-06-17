import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DEV_USER, isDevBypassEnabled } from '@/lib/dev-auth';
import { SettingsClient } from './SettingsClient';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const supabase = await createClient();
  const devBypass = isDevBypassEnabled();

  let org_id: string;
  let userRole: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let userData: any = null;

  if (devBypass) {
    org_id = DEV_USER.org_id;
    userRole = DEV_USER.role;
    userData = {
      ...DEV_USER,
      avatar_url: null,
      job_title: 'Developer',
      org_id: DEV_USER.org_id,
      org: {
        id: DEV_USER.org_id,
        name: 'Demo Organisation',
        slug: 'demo-org',
        country: 'EG',
        plan: 'professional',
        logo_url: null,
        onboarding_completed: true,
        industry_sectors: ['iron_steel'],
        subscription: null,
      },
    };
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const { data: fetchedUserData } = await supabase
      .from('users')
      .select('*, org:organizations(*, subscription:org_subscriptions(*, plan:subscription_plans(*)))')
      .eq('id', user.id)
      .single();

    if (!fetchedUserData) redirect('/login');
    userData = fetchedUserData;
    org_id = fetchedUserData.org_id;
    userRole = fetchedUserData.role;
  }

  const { data: teamMembers } = await supabase
    .from('users')
    .select('id, full_name, role, job_title, created_at')
    .eq('org_id', org_id)
    .order('created_at');

  const { data: invitations } = await supabase
    .from('team_invitations')
    .select('id, email, role, created_at, expires_at')
    .eq('org_id', org_id)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString());

  return (
    <div className="page-container max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold" style={{ color: 'hsl(var(--ink-primary))' }}>Settings</h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(var(--ink-secondary))' }}>Manage your organisation, team, and billing.</p>
      </div>
      <SettingsClient
        user={userData as Parameters<typeof SettingsClient>[0]['user']}
        teamMembers={(teamMembers ?? []) as Parameters<typeof SettingsClient>[0]['teamMembers']}
        invitations={(invitations ?? []) as Parameters<typeof SettingsClient>[0]['invitations']}
      />
    </div>
  );
}
