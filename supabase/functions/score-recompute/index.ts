/**
 * Supabase Edge Function: score-recompute
 *
 * Triggered via:
 *   1. pg_notify 'score_recompute' from database triggers
 *   2. POST /functions/v1/score-recompute from API
 *
 * Deploy: supabase functions deploy score-recompute
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface RecomputePayload {
  org_id: string;
  framework_id?: string;
  period?: string;
}

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let payload: RecomputePayload;

    if (req.method === 'POST') {
      payload = await req.json();
    } else {
      return new Response('Method not allowed', { status: 405 });
    }

    const { org_id } = payload;
    if (!org_id) {
      return new Response(JSON.stringify({ error: 'org_id required' }), { status: 400 });
    }

    // Get CBAM framework
    const { data: framework } = await supabase
      .from('compliance_frameworks')
      .select('id')
      .eq('slug', 'cbam')
      .single();

    if (!framework) {
      return new Response(JSON.stringify({ error: 'Framework not found' }), { status: 404 });
    }

    const frameworkId = payload.framework_id ?? framework.id;
    const period = payload.period ?? getCurrentPeriod();

    // Trigger recompute via the Next.js API (or inline the scoring logic)
    // For simplicity, call the internal scoring endpoint
    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:3000';

    const response = await fetch(`${appUrl}/api/scoring`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': Deno.env.get('INTERNAL_SECRET') ?? '',
      },
      body: JSON.stringify({ org_id, framework_id: frameworkId, period }),
    });

    const result = await response.json();

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
}
