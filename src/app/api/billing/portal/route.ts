import { NextRequest, NextResponse } from 'next/server';
import { withRole } from '@/lib/auth';
import { createPortalSession } from '@/lib/billing/stripe';

export const POST = withRole(['admin'], async (request: NextRequest, ctx) => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  try {
    const url = await createPortalSession(ctx.orgId, `${appUrl}/settings/billing`, ctx.supabase);
    return NextResponse.json({ data: { url } });
  } catch {
    return NextResponse.json({ data: { url: `${appUrl}/settings` } });
  }
});
