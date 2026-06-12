import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, ok, created, badRequest, notFound, writeAuditLog } from '@/lib/auth';
import { calculateEmbeddedEmissions, validateCalculationInputs } from '@/lib/emissions/calculator';
import type { IndustrySector } from '@/types/domain';

const calculationSchema = z.object({
  product_id: z.string().uuid(),
  facility_id: z.string().uuid().optional(),
  period: z.string().regex(/^\d{4}-Q[1-4]$/),
  method: z.enum(['actual', 'default', 'conservative']),
  production_volume: z.number().positive(),
  direct_inputs: z.object({
    fuel_type: z.string().optional(),
    fuel_consumption: z.number().nonnegative().optional(),
    fuel_unit: z.string().optional(),
    oxidation_factor: z.number().min(0.9).max(1.0).optional(),
    process_emissions: z.number().nonnegative().optional(),
  }).default({}),
  indirect_inputs: z.object({
    electricity_consumption_mwh: z.number().nonnegative().optional(),
    electricity_source: z.string().optional(),
    electricity_emission_factor: z.number().nonnegative().optional(),
    heat_consumption_gj: z.number().nonnegative().optional(),
  }).default({}),
  notes: z.string().optional(),
});

export const POST = withAuth(async (request: NextRequest, ctx) => {
  const body = await request.json();
  const parsed = calculationSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.errors[0]?.message ?? 'Invalid input', parsed.error.errors[0]?.path.join('.'));
  }

  const { product_id, facility_id, period, method, production_volume, direct_inputs, indirect_inputs, notes } = parsed.data;

  // Verify product belongs to org
  const { data: product } = await ctx.supabase
    .from('products')
    .select('id, name, cn_code, cbam_sector, facility:facilities(country)')
    .eq('id', product_id)
    .eq('org_id', ctx.orgId)
    .single();

  if (!product) return notFound('Product');

  // Get CBAM framework
  const { data: framework } = await ctx.supabase
    .from('compliance_frameworks')
    .select('id')
    .eq('slug', 'cbam')
    .single();

  if (!framework) return notFound('Framework');

  // Validate inputs
  const validation = validateCalculationInputs(method, direct_inputs, indirect_inputs, production_volume);
  if (!validation.valid && method === 'actual') {
    return badRequest(validation.errors[0] ?? 'Invalid calculation inputs');
  }

  // Get default emission factors for sector
  const { data: factors } = await ctx.supabase
    .from('emission_factors')
    .select('sector, factor_value')
    .eq('framework_id', framework.id)
    .eq('is_default', true);

  const defaultFactors = Object.fromEntries(
    (factors ?? []).map((f) => [f.sector, f.factor_value])
  ) as Record<IndustrySector, number>;

  // Get facility country for electricity factor
  const facilityCountry = (product.facility as { country: string } | null)?.country ?? 'GLOBAL';

  // Run calculation
  const result = calculateEmbeddedEmissions(
    {
      org_id: ctx.orgId,
      product_id,
      facility_id,
      period,
      method,
      production_volume,
      country: facilityCountry,
      sector: product.cbam_sector as IndustrySector ?? 'iron_steel',
      direct_inputs,
      indirect_inputs,
      notes,
    },
    defaultFactors
  );

  // Persist
  const { data: calc, error } = await ctx.supabase
    .from('emission_calculations')
    .insert({
      org_id: ctx.orgId,
      framework_id: framework.id,
      product_id,
      facility_id: facility_id ?? null,
      period,
      method: result.method_used,
      direct_emissions: result.direct_emissions,
      direct_inputs,
      indirect_emissions: result.indirect_emissions,
      indirect_inputs,
      total_embedded: result.total_embedded,
      production_volume,
      total_co2e: result.total_co2e,
      calculation_log: result.calculation_log,
      assumptions: { warnings: result.warnings },
      notes: notes ?? null,
      calculated_by: ctx.userId,
    })
    .select('id, total_embedded, total_co2e, method')
    .single();

  if (error || !calc) {
    return NextResponse.json({ error: { code: 'DB_ERROR', message: error?.message } }, { status: 500 });
  }

  await writeAuditLog(ctx.supabase, {
    org_id: ctx.orgId,
    user_id: ctx.userId,
    action: 'calculate',
    resource_type: 'emission_calculations',
    resource_id: calc.id,
    resource_label: `${product.name} — ${period}`,
    framework_id: framework.id,
    new_value: { total_embedded: result.total_embedded, method: result.method_used },
  });

  return created({
    ...calc,
    warnings: result.warnings,
    calculation_log: result.calculation_log,
  });
});

export const GET = withAuth(async (request: NextRequest, ctx) => {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period');
  const productId = searchParams.get('product_id');

  let query = ctx.supabase
    .from('emission_calculations')
    .select(`
      *,
      product:products(id, name, cn_code, cbam_sector),
      facility:facilities(id, name, country)
    `)
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false });

  if (period) query = query.eq('period', period);
  if (productId) query = query.eq('product_id', productId);

  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });

  return ok(data, { total: data?.length ?? 0 });
});
