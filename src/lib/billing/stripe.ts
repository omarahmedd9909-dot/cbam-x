/**
 * Stripe Billing Integration
 *
 * Handles:
 *   - Stripe webhook processing (subscription lifecycle)
 *   - Feature gate checking
 *   - Usage event recording
 *   - Customer portal session creation
 */

import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-06-20',
  });
}

// ----------------------------------------------------------------
// Webhook handler — called by /api/webhooks/stripe route
// ----------------------------------------------------------------

export async function handleStripeWebhook(
  payload: string | Buffer,
  signature: string,
  supabase: SupabaseClient
): Promise<{ handled: boolean; event_type: string }> {
  const stripe = getStripe();

  const event = stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscription(sub, supabase);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await supabase
        .from('org_subscriptions')
        .update({
          status: 'canceled',
          canceled_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', sub.id);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.subscription) {
        await supabase
          .from('org_subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_subscription_id', invoice.subscription as string);
      }
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.subscription) {
        await supabase
          .from('org_subscriptions')
          .update({ status: 'active' })
          .eq('stripe_subscription_id', invoice.subscription as string);
      }
      break;
    }

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription && session.metadata?.org_id) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        await syncSubscription(sub, supabase, session.metadata.org_id);
      }
      break;
    }

    default:
      return { handled: false, event_type: event.type };
  }

  return { handled: true, event_type: event.type };
}

async function syncSubscription(
  stripeSub: Stripe.Subscription,
  supabase: SupabaseClient,
  orgIdOverride?: string
): Promise<void> {
  // Find org by stripe customer ID or override
  let orgId = orgIdOverride;
  if (!orgId) {
    const { data } = await supabase
      .from('org_subscriptions')
      .select('org_id')
      .eq('stripe_customer_id', stripeSub.customer as string)
      .single();
    orgId = data?.org_id;
  }

  if (!orgId) return;

  // Find matching plan by Stripe price ID
  const priceId = stripeSub.items.data[0]?.price.id;
  const { data: plan } = await supabase
    .from('subscription_plans')
    .select('id, slug')
    .or(`stripe_price_id_monthly.eq.${priceId},stripe_price_id_annual.eq.${priceId}`)
    .single();

  const status = stripeSub.status === 'active' ? 'active' :
                 stripeSub.status === 'trialing' ? 'trialing' :
                 stripeSub.status === 'past_due' ? 'past_due' :
                 stripeSub.status === 'canceled' ? 'canceled' : 'incomplete';

  await supabase
    .from('org_subscriptions')
    .upsert({
      org_id: orgId,
      plan_id: plan?.id,
      stripe_customer_id: stripeSub.customer as string,
      stripe_subscription_id: stripeSub.id,
      status,
      current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
      current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
      cancel_at_period_end: stripeSub.cancel_at_period_end,
      trial_ends_at: stripeSub.trial_end
        ? new Date(stripeSub.trial_end * 1000).toISOString()
        : null,
    })
    .eq('org_id', orgId);

  // Sync plan on organization
  if (plan) {
    await supabase
      .from('organizations')
      .update({ plan: plan.slug })
      .eq('id', orgId);
  }
}

// ----------------------------------------------------------------
// Feature gate
// ----------------------------------------------------------------

export interface FeatureCheckResult {
  allowed: boolean;
  reason?: string;
  current_usage?: number;
  limit?: number;
}

export async function checkFeatureAccess(
  supabase: SupabaseClient,
  orgId: string,
  feature: string,
  quantity = 1
): Promise<FeatureCheckResult> {
  const { data } = await supabase
    .from('org_subscriptions')
    .select('status, trial_ends_at, plan:subscription_plans(features, max_users, max_facilities, max_products, max_suppliers)')
    .eq('org_id', orgId)
    .single();

  if (!data) return { allowed: false, reason: 'No subscription found' };

  // Check subscription is active
  const isActive = ['active', 'trialing'].includes(data.status);
  if (!isActive) return { allowed: false, reason: 'Subscription is not active' };

  // Check trial hasn't expired
  if (data.status === 'trialing' && data.trial_ends_at) {
    if (new Date(data.trial_ends_at) < new Date()) {
      return { allowed: false, reason: 'Trial period has ended' };
    }
  }

  const plan = data.plan as Record<string, unknown> | null;
  if (!plan) return { allowed: false, reason: 'Plan not found' };

  const features = plan.features as Record<string, boolean | number> | null;
  if (!features) return { allowed: true };

  // Hard boolean feature check
  if (feature in features) {
    const val = features[feature];
    if (typeof val === 'boolean') {
      return val
        ? { allowed: true }
        : { allowed: false, reason: `Feature '${feature}' not available on current plan` };
    }
    // Numeric limit (e.g. ai_ocr_pages_monthly)
    if (typeof val === 'number' && val !== null) {
      return { allowed: quantity <= val, limit: val };
    }
  }

  return { allowed: true };
}

// ----------------------------------------------------------------
// Usage recording
// ----------------------------------------------------------------

export async function recordUsage(
  supabase: SupabaseClient,
  orgId: string,
  eventType: string,
  quantity = 1,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await supabase.from('usage_events').insert({
    org_id: orgId,
    event_type: eventType,
    quantity,
    metadata,
  });
}

// ----------------------------------------------------------------
// Create Stripe checkout session
// ----------------------------------------------------------------

export async function createCheckoutSession(
  orgId: string,
  planSlug: string,
  billingCycle: 'monthly' | 'annual',
  successUrl: string,
  cancelUrl: string,
  supabase: SupabaseClient
): Promise<string> {
  const stripe = getStripe();

  const { data: plan } = await supabase
    .from('subscription_plans')
    .select('stripe_price_id_monthly, stripe_price_id_annual, name')
    .eq('slug', planSlug)
    .single();

  if (!plan) throw new Error('Plan not found');

  const priceId = billingCycle === 'annual'
    ? plan.stripe_price_id_annual
    : plan.stripe_price_id_monthly;

  if (!priceId) throw new Error('Price not configured for this plan');

  // Get or create Stripe customer
  const { data: subscription } = await supabase
    .from('org_subscriptions')
    .select('stripe_customer_id')
    .eq('org_id', orgId)
    .single();

  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single();

  let customerId = subscription?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: org?.name,
      metadata: { org_id: orgId },
    });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { org_id: orgId },
    subscription_data: {
      metadata: { org_id: orgId },
    },
  });

  return session.url!;
}

// ----------------------------------------------------------------
// Customer portal session
// ----------------------------------------------------------------

export async function createPortalSession(
  orgId: string,
  returnUrl: string,
  supabase: SupabaseClient
): Promise<string> {
  const stripe = getStripe();

  const { data } = await supabase
    .from('org_subscriptions')
    .select('stripe_customer_id')
    .eq('org_id', orgId)
    .single();

  if (!data?.stripe_customer_id) {
    throw new Error('No Stripe customer found for this organization');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: returnUrl,
  });

  return session.url;
}
