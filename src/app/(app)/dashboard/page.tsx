import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ComplianceScoreCard } from '@/components/dashboard/ComplianceScoreCard';
import {
  DeadlineCountdown,
  OpenIssuesList,
  SupplierStatusSummary,
  RegAlertsBanner,
  QuickActions,
} from '@/components/dashboard/DashboardComponents';
import {
  EmissionsSummaryChart,
  RecentActivityFeed,
} from '@/components/dashboard/ChartComponents';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase
    .from('users')
    .select('org_id, role, full_name')
    .eq('id', user.id)
    .single();

  if (!userData) redirect('/login');
  const { org_id } = userData;

  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  const period = `${now.getFullYear()}-Q${q}`;

  const [orgResult, scoreResult, issuesResult, regAlertsResult, recentActivityResult, submissionResult, emissionsResult, suppliersResult, questionnairesResult] = await Promise.all([
    supabase.from('organizations').select('id, name, plan, country').eq('id', org_id).single(),
    supabase.from('compliance_scores').select('*').eq('org_id', org_id).eq('period', period).order('version', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('compliance_issues').select('*').eq('org_id', org_id).eq('period', period).is('resolved_at', null).eq('dismissed', false).order('severity', { ascending: true }).limit(10),
    supabase.from('org_regulation_alerts').select('*, update:regulation_updates(*)').eq('org_id', org_id).eq('acknowledged', false).order('created_at', { ascending: false }).limit(5),
    supabase.from('audit_logs').select('*, user:users(full_name, role)').eq('org_id', org_id).order('created_at', { ascending: false }).limit(8),
    supabase.from('submissions').select('id, status, period_quarter, submitted_at').eq('org_id', org_id).eq('period_quarter', period).maybeSingle(),
    supabase.from('emission_calculations').select('product_id, total_co2e, method, products(name, cbam_sector)').eq('org_id', org_id).eq('period', period).order('total_co2e', { ascending: false }).limit(10),
    supabase.from('suppliers').select('id, status').eq('org_id', org_id),
    supabase.from('supplier_questionnaires').select('id, status, due_date').eq('org_id', org_id).eq('period', period),
  ]);

  if (orgResult.error || !orgResult.data) redirect('/login');

  const score = scoreResult.data;
  const issues = issuesResult.data ?? [];
  const regAlerts = regAlertsResult.data ?? [];
  const recentActivity = recentActivityResult.data ?? [];
  const submission = submissionResult.data;
  const emissions = emissionsResult.data ?? [];

  // 0-based month indices for Q1–Q4 end months (Mar, Jun, Sep, Dec)
  const quarterEndMonth = [2, 5, 8, 11][q - 1] ?? 11;
  const deadlineDate = new Date(now.getFullYear(), quarterEndMonth + 1, 0);
  const daysToDeadline = Math.max(0, Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  const allSuppliers = suppliersResult.data ?? [];
  const allQuestionnaires = questionnairesResult.data ?? [];
  const supplierStats = {
    total: allSuppliers.length,
    active: allSuppliers.filter(s => s.status === 'active').length,
    pending: allSuppliers.filter(s => ['invited', 'onboarding'].includes(s.status)).length,
    overdue: allQuestionnaires.filter(q => q.due_date && new Date(q.due_date) < new Date() && q.status !== 'accepted').length,
  };

  const h = now.getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="page-container">
      {regAlerts.length > 0 && (
        <div className="mb-6">
          <RegAlertsBanner alerts={regAlerts as Parameters<typeof RegAlertsBanner>[0]['alerts']} />
        </div>
      )}

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'hsl(var(--ink-primary))' }}>
            {greeting}, {userData.full_name?.split(' ')[0] ?? 'there'}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'hsl(var(--ink-secondary))' }}>
            {orgResult.data?.name} · {period} · EU CBAM
          </p>
        </div>
        <QuickActions period={period} />
      </div>

      <div className="grid grid-cols-12 gap-5 mb-5">
        <div className="col-span-12 lg:col-span-4">
          <ComplianceScoreCard score={score as Parameters<typeof ComplianceScoreCard>[0]['score']} period={period} orgId={org_id} />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <DeadlineCountdown daysRemaining={daysToDeadline} deadline={deadlineDate.toISOString()} period={period} submission={submission as Parameters<typeof DeadlineCountdown>[0]['submission']} />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <SupplierStatusSummary stats={supplierStats} />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5 mb-5">
        <div className="col-span-12 lg:col-span-5">
          <OpenIssuesList issues={issues as Parameters<typeof OpenIssuesList>[0]['issues']} period={period} />
        </div>
        <div className="col-span-12 lg:col-span-7">
          <EmissionsSummaryChart data={emissions as Parameters<typeof EmissionsSummaryChart>[0]['data']} period={period} />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12">
          <RecentActivityFeed activity={recentActivity as Parameters<typeof RecentActivityFeed>[0]['activity']} />
        </div>
      </div>
    </div>
  );
}
