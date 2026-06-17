import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@/types/domain';
import { DEV_USER, isDevBypassEnabled } from '@/lib/dev-auth';

export interface AuthContext {
  userId: string;
  orgId: string;
  role: User['role'];
  supabase: Awaited<ReturnType<typeof createClient>>;
}

// Route handler wrapper that enforces authentication and provides org context
export function withAuth(
  handler: (request: NextRequest, ctx: AuthContext, params?: Record<string, string>) => Promise<NextResponse>
) {
  return async (request: NextRequest, { params }: { params?: Record<string, string> } = {}) => {
    try {
      const supabase = await createClient();

      // Dev bypass — skip Supabase auth entirely
      if (isDevBypassEnabled()) {
        const ctx: AuthContext = {
          userId: DEV_USER.id,
          orgId: DEV_USER.org_id,
          role: DEV_USER.role,
          supabase,
        };
        return handler(request, ctx, params);
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        return NextResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
          { status: 401 }
        );
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('org_id, role')
        .eq('id', user.id)
        .single();

      if (userError || !userData) {
        return NextResponse.json(
          { error: { code: 'USER_NOT_FOUND', message: 'User profile not found' } },
          { status: 404 }
        );
      }

      const ctx: AuthContext = {
        userId: user.id,
        orgId: userData.org_id,
        role: userData.role,
        supabase,
      };

      return handler(request, ctx, params);
    } catch (error) {
      console.error('Route handler error:', error);
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
        { status: 500 }
      );
    }
  };
}

// Require specific roles
export function withRole(
  roles: User['role'][],
  handler: (request: NextRequest, ctx: AuthContext, params?: Record<string, string>) => Promise<NextResponse>
) {
  return withAuth(async (request, ctx, params) => {
    if (!roles.includes(ctx.role)) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
        { status: 403 }
      );
    }
    return handler(request, ctx, params);
  });
}

// Check if org has a feature enabled (subscription gate)
export async function checkFeature(
  supabase: AuthContext['supabase'],
  orgId: string,
  feature: string
): Promise<boolean> {
  // Dev bypass — all features enabled
  if (isDevBypassEnabled()) return true;

  const { data } = await supabase
    .from('org_subscriptions')
    .select('status, plan:subscription_plans(features)')
    .eq('org_id', orgId)
    .single();

  if (!data) return false;

  // Check the subscription status (at root of org_subscriptions row)
  const subData = data as { status: string; plan: { features: Record<string, boolean> } | null };
  if (!['active', 'trialing'].includes(subData.status)) return false;

  const features = subData.plan?.features;
  if (!features) return true; // no feature restrictions on plan

  return features[feature] === true;
}

// Write to audit log
export async function writeAuditLog(
  supabase: AuthContext['supabase'],
  entry: {
    org_id: string;
    user_id?: string;
    actor_type?: string;
    action: string;
    resource_type: string;
    resource_id?: string;
    resource_label?: string;
    old_value?: Record<string, unknown>;
    new_value?: Record<string, unknown>;
    framework_id?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from('audit_logs').insert({
    ...entry,
    actor_type: entry.actor_type ?? 'user',
    metadata: entry.metadata ?? {},
  });
  if (error) console.error('Failed to write audit log:', error, entry);
}

// Standard success response
export function ok<T>(data: T, meta?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ data, ...(meta ? { meta } : {}) }, { status: 200 });
}

// Standard created response
export function created<T>(data: T): NextResponse {
  return NextResponse.json({ data }, { status: 201 });
}

// Standard error responses
export function badRequest(message: string, field?: string): NextResponse {
  return NextResponse.json(
    { error: { code: 'VALIDATION_ERROR', message, ...(field ? { field } : {}) } },
    { status: 400 }
  );
}

export function notFound(resource = 'Resource'): NextResponse {
  return NextResponse.json(
    { error: { code: 'NOT_FOUND', message: `${resource} not found` } },
    { status: 404 }
  );
}

export function forbidden(message = 'Insufficient permissions'): NextResponse {
  return NextResponse.json(
    { error: { code: 'FORBIDDEN', message } },
    { status: 403 }
  );
}

export function serverError(message = 'An unexpected error occurred'): NextResponse {
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message } },
    { status: 500 }
  );
}
