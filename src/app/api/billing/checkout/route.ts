import { NextRequest, NextResponse } from 'next/server';
import { withRole, ok } from '@/lib/auth';
import { createCheckoutSession, createPortalSession } from '@/lib/billing/stripe';

// POST /api/billing/checkout
export const POST = withRole(['admin'], async (request: NextRequest, ctx) => {
  const body = await request.json();
  const { plan_slug, billing_cycle = 'monthly' } = body;

  if (!plan_slug) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'plan_slug is required' } },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const checkoutUrl = await createCheckoutSession(
    ctx.orgId,
    plan_slug,
    billing_cycle,
    `${appUrl}/settings/billing?success=1`,
    `${appUrl}/settings/billing?canceled=1`,
    ctx.supabase
  );

  return ok({ checkout_url: checkoutUrl });
});
