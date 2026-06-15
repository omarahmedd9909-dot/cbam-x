/**
 * Compliance Readiness Scoring Engine
 *
 * Computes a 0–100 composite score per org / framework / period.
 * Five weighted dimensions, configurable per framework.
 *
 * Designed to run as both a server-side function and as
 * a Supabase Edge Function trigger (on relevant table changes).
 */

import type { ScoreDimensions, RiskLevel, IssueSeverity } from '@/types/domain';
import type { SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_WEIGHTS: ScoreDimensions = {
  data_completeness: 0.30,
  supplier_coverage: 0.25,
  calculation_quality: 0.20,
  evidence_quality: 0.15,
  submission_readiness: 0.10,
};

export interface ScoringContext {
  org_id: string;
  framework_id: string;
  period: string;
}

export interface ScoringResult {
  overall_score: number;
  dimension_scores: ScoreDimensions;
  risk_level: RiskLevel;
  issues: ScoringIssue[];
}

export interface ScoringIssue {
  issue_type: string;
  severity: IssueSeverity;
  title: string;
  description: string;
  entity_type?: string;
  entity_id?: string;
  entity_label?: string;
  resolution_steps: Array<{ step: number; action: string; route?: string }>;
}

/**
 * Main scoring function — queries all required data and returns a score.
 */
export async function computeComplianceScore(
  supabase: SupabaseClient,
  ctx: ScoringContext,
  weights: ScoreDimensions = DEFAULT_WEIGHTS
): Promise<ScoringResult> {
  const issues: ScoringIssue[] = [];

  // Fetch all data needed in parallel
  const [
    productsRes,
    suppliersRes,
    questionnairesRes,
    calculationsRes,
    evidenceRes,
    submissionRes,
  ] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, cn_code, is_cbam_covered, cbam_sector')
      .eq('org_id', ctx.org_id)
      .eq('is_active', true),

    supabase
      .from('suppliers')
      .select('id, name, status')
      .eq('org_id', ctx.org_id),

    supabase
      .from('supplier_questionnaires')
      .select('id, supplier_id, status, due_date')
      .eq('org_id', ctx.org_id)
      .eq('framework_id', ctx.framework_id)
      .eq('period', ctx.period),

    supabase
      .from('emission_calculations')
      .select('id, product_id, method, is_approved, total_co2e')
      .eq('org_id', ctx.org_id)
      .eq('framework_id', ctx.framework_id)
      .eq('period', ctx.period),

    supabase
      .from('evidence')
      .select('id, linked_to_id')
      .eq('org_id', ctx.org_id),

    supabase
      .from('submissions')
      .select('id, status, submitted_at')
      .eq('org_id', ctx.org_id)
      .eq('framework_id', ctx.framework_id)
      .eq('period', ctx.period)
      .maybeSingle(),
  ]);

  const products = productsRes.data ?? [];
  const suppliers = suppliersRes.data ?? [];
  const questionnaires = questionnairesRes.data ?? [];
  const calculations = calculationsRes.data ?? [];
  const evidenceLinks = evidenceRes.data ?? [];
  const submission = submissionRes.data;

  // ----------------------------------------------------------------
  // Dimension 1: Data completeness (30%)
  // ----------------------------------------------------------------
  const cbamProducts = products.filter((p) => p.is_cbam_covered);
  const productsWithCalc = new Set(calculations.map((c) => c.product_id));
  const uncoveredProducts = cbamProducts.filter((p) => !productsWithCalc.has(p.id));

  let dataCompletenessScore = 100;
  if (cbamProducts.length === 0) {
    dataCompletenessScore = 0;
    issues.push({
      issue_type: 'missing_supplier_data',
      severity: 'critical',
      title: 'No CBAM-covered products defined',
      description: 'Add products with valid CN codes to begin calculating embedded emissions.',
      resolution_steps: [
        { step: 1, action: 'Go to Products and add your exported goods', route: '/products' },
        { step: 2, action: 'Run the CN code applicability check for each product' },
      ],
    });
  } else {
    const completePct = (productsWithCalc.size / cbamProducts.length) * 100;
    dataCompletenessScore = completePct;

    if (uncoveredProducts.length > 0) {
      const severity: IssueSeverity = uncoveredProducts.length === cbamProducts.length ? 'critical' : 'high';
      issues.push({
        issue_type: 'missing_supplier_data',
        severity,
        title: `${uncoveredProducts.length} product${uncoveredProducts.length > 1 ? 's' : ''} missing emission calculations`,
        description: `${uncoveredProducts.map((p) => p.name).join(', ')} ${uncoveredProducts.length > 1 ? 'have' : 'has'} no calculation for ${ctx.period}.`,
        entity_type: 'product',
        entity_id: uncoveredProducts[0]?.id,
        entity_label: uncoveredProducts[0]?.name,
        resolution_steps: [
          { step: 1, action: 'Open each product and run a new emission calculation', route: '/emissions/new' },
          { step: 2, action: 'Choose actual monitoring data or EU default values' },
        ],
      });
    }
  }

  // ----------------------------------------------------------------
  // Dimension 2: Supplier coverage (25%)
  // ----------------------------------------------------------------
  const activeSuppliers = suppliers.filter((s) => s.status === 'active');
  const pendingSuppliers = suppliers.filter((s) =>
    ['invited', 'onboarding'].includes(s.status)
  );

  const acceptedQuestionnaires = questionnaires.filter(
    (q) => q.status === 'accepted'
  );
  const overdueQuestionnaires = questionnaires.filter((q) => {
    const isOverdue =
      q.due_date && new Date(q.due_date) < new Date() && q.status !== 'accepted';
    return isOverdue;
  });

  let supplierCoverageScore = 100;
  if (suppliers.length === 0) {
    supplierCoverageScore = 0;
    issues.push({
      issue_type: 'missing_supplier_data',
      severity: 'high',
      title: 'No suppliers added',
      description: 'Add your key suppliers and send them CBAM data questionnaires.',
      resolution_steps: [
        { step: 1, action: 'Go to Suppliers and invite key suppliers', route: '/suppliers' },
        { step: 2, action: 'Send questionnaires for each supplier to gather emission data' },
      ],
    });
  } else {
    const coveragePct =
      questionnaires.length > 0
        ? (acceptedQuestionnaires.length / questionnaires.length) * 100
        : 0;

    supplierCoverageScore = coveragePct;

    if (overdueQuestionnaires.length > 0) {
      const supplierIds = overdueQuestionnaires.map((q) => q.supplier_id);
      const affectedSuppliers = suppliers.filter((s) => supplierIds.includes(s.id));
      issues.push({
        issue_type: 'overdue_questionnaire',
        severity: 'critical',
        title: `${overdueQuestionnaires.length} supplier questionnaire${overdueQuestionnaires.length > 1 ? 's' : ''} overdue`,
        description: `Data not received from: ${affectedSuppliers.map((s) => s.name).slice(0, 3).join(', ')}${affectedSuppliers.length > 3 ? ` and ${affectedSuppliers.length - 3} more` : ''}.`,
        entity_type: 'supplier',
        entity_id: affectedSuppliers[0]?.id,
        entity_label: affectedSuppliers[0]?.name,
        resolution_steps: [
          { step: 1, action: 'Send reminder to overdue suppliers', route: '/suppliers?filter=overdue' },
          { step: 2, action: 'If data unavailable, consider using EU default values' },
        ],
      });
    }

    if (pendingSuppliers.length > 0 && pendingSuppliers.length === suppliers.length) {
      issues.push({
        issue_type: 'missing_supplier_data',
        severity: 'high',
        title: 'No suppliers have completed onboarding',
        description: `${pendingSuppliers.length} supplier${pendingSuppliers.length > 1 ? 's' : ''} invited but not yet active.`,
        resolution_steps: [
          { step: 1, action: 'Follow up with invited suppliers', route: '/suppliers' },
        ],
      });
    }
  }

  // ----------------------------------------------------------------
  // Dimension 3: Calculation quality (20%)
  // ----------------------------------------------------------------
  const defaultCalcs = calculations.filter((c) => c.method === 'default');
  const actualCalcs = calculations.filter((c) => c.method === 'actual');
  const unapprovedCalcs = calculations.filter((c) => !c.is_approved);

  let calculationQualityScore = 100;
  if (calculations.length === 0) {
    calculationQualityScore = 0;
  } else {
    const defaultPct = (defaultCalcs.length / calculations.length) * 100;
    const approvalPct =
      calculations.length > 0
        ? ((calculations.length - unapprovedCalcs.length) / calculations.length) * 100
        : 100;

    // Penalise heavy default value usage (EU applies 1.0 multiplier but financial risk is higher)
    calculationQualityScore = (100 - defaultPct * 0.6) * (approvalPct / 100);

    if (defaultPct > 50) {
      issues.push({
        issue_type: 'high_default_value_usage',
        severity: defaultPct > 80 ? 'high' : 'medium',
        title: `${Math.round(defaultPct)}% of calculations use EU default values`,
        description:
          'EU default values are typically higher than actual monitored data and may overstate your carbon liability.',
        resolution_steps: [
          { step: 1, action: 'Collect actual monitoring data from your production process', route: '/emissions' },
          { step: 2, action: 'Update calculations using actual values' },
          { step: 3, action: 'Get calculations approved by your compliance officer' },
        ],
      });
    }

    if (unapprovedCalcs.length > 0) {
      issues.push({
        issue_type: 'unverified_calculation',
        severity: 'medium',
        title: `${unapprovedCalcs.length} calculation${unapprovedCalcs.length > 1 ? 's' : ''} pending approval`,
        description: 'Calculations must be reviewed and approved before submission.',
        resolution_steps: [
          { step: 1, action: 'Review and approve pending calculations', route: '/emissions?filter=pending' },
        ],
      });
    }
  }

  // ----------------------------------------------------------------
  // Dimension 4: Evidence quality (15%)
  // ----------------------------------------------------------------
  const calcIds = new Set(calculations.map((c) => c.id));
  const calcsWithEvidence = new Set(
    evidenceLinks
      .filter((e) => calcIds.has(e.linked_to_id))
      .map((e) => e.linked_to_id)
  );

  let evidenceQualityScore = 100;
  if (calculations.length > 0) {
    const evidencePct = (calcsWithEvidence.size / calculations.length) * 100;
    evidenceQualityScore = evidencePct;

    const missingEvidenceCount = calculations.length - calcsWithEvidence.size;
    if (missingEvidenceCount > 0) {
      issues.push({
        issue_type: 'no_evidence_linked',
        severity: missingEvidenceCount > calculations.length / 2 ? 'high' : 'medium',
        title: `${missingEvidenceCount} calculation${missingEvidenceCount > 1 ? 's' : ''} without supporting evidence`,
        description:
          'Supporting documents (invoices, production reports, meter readings) must be linked to each calculation.',
        resolution_steps: [
          { step: 1, action: 'Upload supporting documents to the Document Center', route: '/documents' },
          { step: 2, action: 'Link documents to each calculation as evidence' },
        ],
      });
    }
  }

  // ----------------------------------------------------------------
  // Dimension 5: Submission readiness (10%)
  // ----------------------------------------------------------------
  const daysToDeadline = getDeadlineDays(ctx.period);
  let submissionReadinessScore = 100;

  if (submission?.status === 'submitted' || submission?.status === 'accepted') {
    submissionReadinessScore = 100;
  } else {
    const openCritical = issues.filter((i) => i.severity === 'critical').length;
    const openHigh = issues.filter((i) => i.severity === 'high').length;

    if (daysToDeadline <= 7 && openCritical > 0) {
      submissionReadinessScore = 20;
      issues.push({
        issue_type: 'deadline_approaching',
        severity: 'critical',
        title: `Submission deadline in ${daysToDeadline} days — critical issues unresolved`,
        description: `${openCritical} critical issue${openCritical > 1 ? 's' : ''} must be resolved before submission.`,
        resolution_steps: [
          { step: 1, action: 'Resolve all critical issues immediately' },
          { step: 2, action: 'Generate and review submission package', route: '/submissions' },
          { step: 3, action: 'Submit to EU CBAM registry' },
        ],
      });
    } else if (daysToDeadline <= 14 && (openCritical > 0 || openHigh > 0)) {
      submissionReadinessScore = 50;
      issues.push({
        issue_type: 'deadline_approaching',
        severity: 'high',
        title: `Submission deadline in ${daysToDeadline} days`,
        description: `${openCritical + openHigh} open issue${openCritical + openHigh > 1 ? 's' : ''} should be resolved before submission.`,
        resolution_steps: [
          { step: 1, action: 'Work through open issues in priority order' },
          { step: 2, action: 'Prepare submission package', route: '/submissions' },
        ],
      });
    } else if (!submission) {
      submissionReadinessScore = 60; // submission not started
    } else if (submission.status === 'draft') {
      submissionReadinessScore = 80;
    }
  }

  // ----------------------------------------------------------------
  // Composite score
  // ----------------------------------------------------------------
  const dimensionScores: ScoreDimensions = {
    data_completeness: clamp(dataCompletenessScore),
    supplier_coverage: clamp(supplierCoverageScore),
    calculation_quality: clamp(calculationQualityScore),
    evidence_quality: clamp(evidenceQualityScore),
    submission_readiness: clamp(submissionReadinessScore),
  };

  const overallScore = clamp(
    dimensionScores.data_completeness * weights.data_completeness +
    dimensionScores.supplier_coverage * weights.supplier_coverage +
    dimensionScores.calculation_quality * weights.calculation_quality +
    dimensionScores.evidence_quality * weights.evidence_quality +
    dimensionScores.submission_readiness * weights.submission_readiness
  );

  const riskLevel: RiskLevel =
    overallScore >= 85 ? 'low' :
    overallScore >= 65 ? 'medium' :
    overallScore >= 40 ? 'high' :
    'critical';

  return {
    overall_score: Math.round(overallScore * 10) / 10,
    dimension_scores: Object.fromEntries(
      Object.entries(dimensionScores).map(([k, v]) => [k, Math.round(v * 10) / 10])
    ) as ScoreDimensions,
    risk_level: riskLevel,
    issues,
  };
}

/**
 * Persist a freshly computed score and its issues to the database.
 */
export async function persistScore(
  supabase: SupabaseClient,
  ctx: ScoringContext,
  result: ScoringResult
): Promise<string> {
  // Get max version for this period
  const { data: existing } = await supabase
    .from('compliance_scores')
    .select('version')
    .eq('org_id', ctx.org_id)
    .eq('framework_id', ctx.framework_id)
    .eq('period', ctx.period)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (existing?.version ?? 0) + 1;

  const { data: score, error } = await supabase
    .from('compliance_scores')
    .insert({
      org_id: ctx.org_id,
      framework_id: ctx.framework_id,
      period: ctx.period,
      overall_score: result.overall_score,
      dimension_scores: result.dimension_scores,
      risk_level: result.risk_level,
      open_issue_count: result.issues.filter((i) => i.severity !== 'info').length,
      critical_issue_count: result.issues.filter((i) => i.severity === 'critical').length,
      version: nextVersion,
    })
    .select('id')
    .single();

  if (error || !score) throw new Error(`Failed to persist score: ${error?.message}`);

  // Upsert current issues (clear old open issues, insert fresh ones)
  await supabase
    .from('compliance_issues')
    .update({ auto_resolved: true, resolved_at: new Date().toISOString() })
    .eq('org_id', ctx.org_id)
    .eq('framework_id', ctx.framework_id)
    .eq('period', ctx.period)
    .is('resolved_at', null)
    .eq('auto_resolved', false);

  if (result.issues.length > 0) {
    await supabase.from('compliance_issues').insert(
      result.issues.map((issue) => ({
        org_id: ctx.org_id,
        framework_id: ctx.framework_id,
        period: ctx.period,
        issue_type: issue.issue_type,
        severity: issue.severity,
        title: issue.title,
        description: issue.description,
        entity_type: issue.entity_type ?? null,
        entity_id: issue.entity_id ?? null,
        entity_label: issue.entity_label ?? null,
        resolution_steps: issue.resolution_steps,
      }))
    );
  }

  return score.id;
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function getDeadlineDays(period: string): number {
  // period = '2025-Q1'
  const [year, q] = period.split('-Q');
  if (!year || !q) return 90;

  // monthIndex is 0-based; new Date(y, m+1, 0) gives last day of month m
  const quarterEndMonth: Record<string, number> = { '1': 2, '2': 4, '3': 7, '4': 10 };
  const monthIndex = quarterEndMonth[q] ?? 10;
  const lastDayOfQuarter = new Date(Number(year), monthIndex + 1, 0);
  const deadline = new Date(lastDayOfQuarter);
  deadline.setDate(deadline.getDate() + 30);

  return Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}
