import { NextRequest, NextResponse } from 'next/server';
import { withAuth, ok } from '@/lib/auth';
import { computeComplianceScore, persistScore } from '@/lib/scoring/engine';

// GET /api/scoring — fetch current score for period
export const GET = withAuth(async (request: NextRequest, ctx) => {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') ?? getCurrentPeriod();

  const { data: framework } = await ctx.supabase
    .from('compliance_frameworks')
    .select('id')
    .eq('slug', 'cbam')
    .single();

  if (!framework) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Framework not found' } }, { status: 404 });
  }

  const { data: score } = await ctx.supabase
    .from('compliance_scores')
    .select('*')
    .eq('org_id', ctx.orgId)
    .eq('framework_id', framework.id)
    .eq('period', period)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: issues } = await ctx.supabase
    .from('compliance_issues')
    .select('*')
    .eq('org_id', ctx.orgId)
    .eq('framework_id', framework.id)
    .eq('period', period)
    .is('resolved_at', null)
    .eq('dismissed', false)
    .order('severity', { ascending: true });

  return ok({ score, issues: issues ?? [] });
});

// POST /api/scoring/recompute — compute fresh score
export const POST = withAuth(async (request: NextRequest, ctx) => {
  const body = await request.json().catch(() => ({}));
  const period = body.period ?? getCurrentPeriod();

  const { data: framework } = await ctx.supabase
    .from('compliance_frameworks')
    .select('id')
    .eq('slug', 'cbam')
    .single();

  if (!framework) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Framework not found' } }, { status: 404 });
  }

  const result = await computeComplianceScore(ctx.supabase, {
    org_id: ctx.orgId,
    framework_id: framework.id,
    period,
  });

  const scoreId = await persistScore(ctx.supabase, {
    org_id: ctx.orgId,
    framework_id: framework.id,
    period,
  }, result);

  return ok({ score_id: scoreId, ...result });
});

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
}
