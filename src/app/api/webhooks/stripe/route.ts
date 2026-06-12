import { NextRequest, NextResponse } from 'next/server';
import { handleStripeWebhook } from '@/lib/billing/stripe';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const result = await handleStripeWebhook(payload, signature, supabase);

    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook processing failed' },
      { status: 400 }
    );
  }
}

// Stripe needs raw body — disable default body parsing
export const config = {
  api: { bodyParser: false },
};
