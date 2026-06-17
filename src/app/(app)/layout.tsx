import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { TopBar } from '@/components/layout/TopBar';
import { DEV_USER, DEV_ORG, isDevBypassEnabled } from '@/lib/dev-auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const devBypass = isDevBypassEnabled();

  let userData: Record<string, unknown>;

  if (devBypass) {
    // Dev bypass — use mock user and org, skip all auth/onboarding checks
    userData = {
      ...DEV_USER,
      avatar_url: null,
      job_title: 'Developer',
      org: {
        ...DEV_ORG,
        slug: 'demo-org',
        logo_url: null,
        industry_sectors: ['iron_steel'],
        onboarding_completed: true,
      },
    };
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const { data: dbUser } = await supabase
      .from('users')
      .select('*, org:organizations(id, name, slug, plan, logo_url, country, industry_sectors, onboarding_completed)')
      .eq('id', user.id)
      .single();

    if (!dbUser || !dbUser.org) redirect('/onboarding');

    const org = dbUser.org as { onboarding_completed: boolean };
    if (!org.onboarding_completed) redirect('/onboarding');

    userData = dbUser;
  }

  const unreadCount = devBypass ? 0 : await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', (userData as { id: string }).id)
    .eq('read', false)
    .then(r => r.count ?? 0);

  return (
    <div className="app-shell">
      <AppSidebar user={userData as Parameters<typeof AppSidebar>[0]['user']} unreadNotifications={unreadCount as number} />
      <div className="flex flex-col overflow-hidden bg-[hsl(var(--surface-sunken))]">
        <TopBar user={userData as Parameters<typeof TopBar>[0]['user']} unreadNotifications={unreadCount as number} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
