import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { TopBar } from '@/components/layout/TopBar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase
    .from('users')
    .select('*, org:organizations(id, name, slug, plan, logo_url, country, industry_sectors, onboarding_completed)')
    .eq('id', user.id)
    .single();

  if (!userData || !userData.org) redirect('/onboarding');

  const org = userData.org as { onboarding_completed: boolean };
  if (!org.onboarding_completed) redirect('/onboarding');

  const { count: unreadCount } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('read', false);

  return (
    <div className="app-shell">
      <AppSidebar user={userData as Parameters<typeof AppSidebar>[0]['user']} unreadNotifications={unreadCount ?? 0} />
      <div className="flex flex-col overflow-hidden bg-[hsl(var(--surface-sunken))]">
        <TopBar user={userData as Parameters<typeof TopBar>[0]['user']} unreadNotifications={unreadCount ?? 0} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
