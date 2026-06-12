// ============================================================
// CBAM X — Domain Types
// ============================================================

export type UserRole = 'admin' | 'analyst' | 'auditor' | 'viewer' | 'supplier' | 'consultant';
export type OrgPlan = 'trial' | 'starter' | 'professional' | 'enterprise' | 'consultant';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
export type SupplierStatus = 'invited' | 'onboarding' | 'active' | 'suspended' | 'unresponsive';
export type DocumentType =
  | 'invoice'
  | 'supplier_declaration'
  | 'customs_document'
  | 'electricity_bill'
  | 'production_report'
  | 'lab_certificate'
  | 'environmental_permit'
  | 'audit_report'
  | 'other';
export type OcrStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type CalculationMethod = 'actual' | 'default' | 'conservative';
export type SubmissionStatus = 'draft' | 'in_review' | 'approved' | 'submitted' | 'accepted' | 'rejected';
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type IndustrySector = 'iron_steel' | 'aluminum' | 'cement' | 'fertilizers' | 'hydrogen' | 'electricity' | 'other';
export type RegUpdateType =
  | 'cn_code_change'
  | 'default_value_update'
  | 'deadline_change'
  | 'new_requirement'
  | 'threshold_change'
  | 'guidance_update';
export type ActorType = 'user' | 'consultant' | 'supplier' | 'system' | 'api';

// ============================================================
// Organizations & Users
// ============================================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  country: string;
  industry_sectors: IndustrySector[];
  plan: OrgPlan;
  logo_url: string | null;
  website: string | null;
  tax_id: string | null;
  eori_number: string | null;
  settings: OrgSettings;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrgSettings {
  locale: string;
  timezone: string;
  currency: string;
  date_format: string;
  fiscal_year_start: string;
}

export interface User {
  id: string;
  org_id: string;
  role: UserRole;
  full_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  phone: string | null;
  language: 'en' | 'ar';
  timezone: string;
  notification_prefs: NotificationPrefs;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationPrefs {
  email: boolean;
  in_app: boolean;
  deadline_days_before: number;
}

export interface TeamInvitation {
  id: string;
  org_id: string;
  email: string;
  role: UserRole;
  invited_by: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

// ============================================================
// Compliance Framework
// ============================================================

export interface ComplianceFramework {
  id: string;
  slug: string;
  name: string;
  version: string;
  jurisdiction: string;
  description: string | null;
  effective_from: string;
  effective_to: string | null;
  config_schema: Record<string, unknown>;
  calculation_rules: FrameworkCalculationRules;
  reporting_periods: FrameworkReportingPeriods;
  is_active: boolean;
  created_at: string;
}

export interface FrameworkCalculationRules {
  direct_emission_formula: string;
  indirect_emission_formula: string;
  default_value_penalty_factor: number;
  attribution_methods: string[];
}

export interface FrameworkReportingPeriods {
  type: 'quarterly' | 'annual';
  quarters?: string[];
  filing_deadline_days_after_quarter_end?: number;
  filing_deadline?: string;
  first_reporting_period?: string;
}

export interface OrgFrameworkEnrollment {
  id: string;
  org_id: string;
  framework_id: string;
  enrolled_at: string;
  enrolled_by: string | null;
  config: Record<string, unknown>;
  status: 'active' | 'suspended' | 'completed' | 'pending';
  trial_ends_at: string | null;
  framework?: ComplianceFramework;
}

// ============================================================
// Billing & Subscriptions
// ============================================================

export interface SubscriptionPlan {
  id: string;
  slug: OrgPlan;
  name: string;
  description: string | null;
  price_monthly: number | null;
  price_annual: number | null;
  max_users: number | null;
  max_facilities: number | null;
  max_products: number | null;
  max_suppliers: number | null;
  max_client_orgs: number | null;
  frameworks_included: string[];
  features: PlanFeatures;
  stripe_price_id_monthly: string | null;
  stripe_price_id_annual: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface PlanFeatures {
  ai_ocr: boolean;
  ai_ocr_pages_monthly: number | null;
  white_label: boolean;
  api_access: boolean;
  sso: boolean;
  consultant_portal: boolean;
  advanced_reporting: boolean;
  portfolio_view?: boolean;
  dedicated_csm?: boolean;
}

export interface OrgSubscription {
  id: string;
  org_id: string;
  plan_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_ends_at: string | null;
  canceled_at: string | null;
  plan?: SubscriptionPlan;
}

// ============================================================
// Facilities & Products
// ============================================================

export interface Facility {
  id: string;
  org_id: string;
  name: string;
  country: string;
  city: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  industry_sector: IndustrySector;
  permit_number: string | null;
  capacity_mt_year: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  org_id: string;
  facility_id: string | null;
  name: string;
  description: string | null;
  cn_code: string;
  cbam_sector: IndustrySector | null;
  unit_of_measure: string;
  is_cbam_covered: boolean | null;
  applicability_checked_at: string | null;
  annual_production_volume: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  facility?: Facility;
}

export interface CnCodeEntry {
  id: string;
  cn_code: string;
  description: string;
  cbam_sector: IndustrySector | null;
  is_cbam_covered: boolean;
  valid_from: string;
  valid_to: string | null;
}

// ============================================================
// Suppliers
// ============================================================

export interface Supplier {
  id: string;
  org_id: string;
  name: string;
  country: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  tax_id: string | null;
  status: SupplierStatus;
  portal_user_id: string | null;
  invite_token: string | null;
  invite_sent_at: string | null;
  last_activity_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierQuestionnaire {
  id: string;
  org_id: string;
  supplier_id: string;
  framework_id: string;
  period: string;
  status: 'draft' | 'sent' | 'in_progress' | 'submitted' | 'accepted' | 'rejected';
  questions: QuestionnaireQuestion[];
  responses: Record<string, QuestionnaireResponse>;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  due_date: string | null;
  supplier?: Supplier;
}

export interface QuestionnaireQuestion {
  id: string;
  type: 'text' | 'number' | 'select' | 'multiselect' | 'file' | 'date';
  label: string;
  description: string | null;
  required: boolean;
  options?: string[];
  unit?: string;
  validation?: Record<string, unknown>;
}

export interface QuestionnaireResponse {
  question_id: string;
  value: string | number | string[] | null;
  file_path?: string;
  answered_at: string;
}

// ============================================================
// Documents
// ============================================================

export interface Document {
  id: string;
  org_id: string;
  supplier_id: string | null;
  framework_id: string | null;
  type: DocumentType;
  filename: string;
  storage_path: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  ocr_status: OcrStatus;
  ocr_data: OcrExtractedData | null;
  ocr_confidence: number | null;
  version: number;
  parent_document_id: string | null;
  period: string | null;
  uploaded_by: string;
  description: string | null;
  tags: string[];
  is_archived: boolean;
  created_at: string;
  supplier?: Supplier;
}

export interface OcrExtractedData {
  extracted_fields: Record<string, ExtractedField>;
  raw_text: string;
  page_count: number;
  extraction_model: string;
  extracted_at: string;
}

export interface ExtractedField {
  value: string | number;
  confidence: number;
  source_text: string;
  page: number;
}

// ============================================================
// Emissions Engine
// ============================================================

export interface EmissionFactor {
  id: string;
  framework_id: string;
  sector: IndustrySector;
  region: string;
  process_type: string | null;
  factor_value: number;
  unit: string;
  source: string;
  source_reference: string | null;
  valid_from: string;
  valid_to: string | null;
  is_default: boolean;
  notes: string | null;
}

export interface EmissionCalculation {
  id: string;
  org_id: string;
  framework_id: string;
  product_id: string;
  facility_id: string | null;
  period: string;
  method: CalculationMethod;
  direct_emissions: number | null;
  direct_inputs: DirectEmissionInputs;
  direct_factor_id: string | null;
  indirect_emissions: number | null;
  indirect_inputs: IndirectEmissionInputs;
  indirect_factor_id: string | null;
  total_embedded: number | null;
  production_volume: number | null;
  total_co2e: number | null;
  calculation_log: CalculationLogEntry[];
  assumptions: Record<string, unknown>;
  version: number;
  is_approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  calculated_by: string;
  created_at: string;
  product?: Product;
}

export interface DirectEmissionInputs {
  fuel_type?: string;
  fuel_consumption?: number;
  fuel_unit?: string;
  emission_factor_value?: number;
  oxidation_factor?: number;
  process_emissions?: number;
  heat_input?: number;
  custom_inputs?: Record<string, number>;
}

export interface IndirectEmissionInputs {
  electricity_consumption_mwh?: number;
  electricity_source?: string;
  electricity_emission_factor?: number;
  heat_consumption_gj?: number;
  cooling_consumption_gj?: number;
}

export interface CalculationLogEntry {
  step: number;
  description: string;
  formula: string;
  inputs: Record<string, number | string>;
  result: number;
  unit: string;
  timestamp: string;
}

// ============================================================
// Compliance Scoring
// ============================================================

export interface ComplianceScore {
  id: string;
  org_id: string;
  framework_id: string;
  period: string;
  overall_score: number;
  dimension_scores: ScoreDimensions;
  risk_level: RiskLevel;
  open_issue_count: number;
  critical_issue_count: number;
  version: number;
  computed_at: string;
}

export interface ScoreDimensions {
  data_completeness: number;
  supplier_coverage: number;
  calculation_quality: number;
  evidence_quality: number;
  submission_readiness: number;
}

export interface ComplianceIssue {
  id: string;
  org_id: string;
  framework_id: string;
  period: string;
  issue_type: string;
  severity: IssueSeverity;
  title: string;
  description: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  resolution_steps: ResolutionStep[];
  resolved_at: string | null;
  resolved_by: string | null;
  auto_resolved: boolean;
  dismissed: boolean;
  created_at: string;
}

export interface ResolutionStep {
  step: number;
  action: string;
  route?: string;
  cta?: string;
}

// ============================================================
// Submissions
// ============================================================

export interface Submission {
  id: string;
  org_id: string;
  framework_id: string;
  period_quarter: string;
  status: SubmissionStatus;
  calculation_ids: string[];
  evidence_ids: string[];
  compliance_score: number | null;
  xml_payload: string | null;
  pdf_path: string | null;
  excel_path: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  eu_reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Regulation Intelligence
// ============================================================

export interface RegulationUpdate {
  id: string;
  framework_id: string;
  source_url: string | null;
  update_type: RegUpdateType;
  severity: 'critical' | 'major' | 'minor' | 'informational';
  title: string;
  summary: string;
  full_content: string | null;
  affected_cn_codes: string[];
  effective_date: string | null;
  action_required: boolean;
  action_deadline: string | null;
  processed_by_ai: boolean;
  ai_summary: string | null;
  published_at: string | null;
  created_at: string;
}

export interface OrgRegulationAlert {
  id: string;
  org_id: string;
  update_id: string;
  impact_level: 'direct' | 'indirect' | 'none';
  affected_product_ids: string[];
  affected_cn_codes: string[];
  action_required: boolean;
  acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  actioned: boolean;
  created_at: string;
  update?: RegulationUpdate;
}

// ============================================================
// Consultant Workspace
// ============================================================

export interface ConsultantWorkspace {
  id: string;
  org_id: string;
  white_label_config: WhiteLabelConfig;
  max_clients: number | null;
  features: Record<string, boolean>;
  created_at: string;
}

export interface WhiteLabelConfig {
  logo_url?: string;
  primary_color?: string;
  report_header?: string;
  report_footer?: string;
  custom_domain?: string;
  company_name?: string;
}

export interface ConsultantClientLink {
  id: string;
  workspace_id: string;
  client_org_id: string;
  access_level: 'full' | 'read_only' | 'reporting_only';
  delegated_by: string;
  granted_at: string;
  revoked_at: string | null;
  notes: string | null;
  client_org?: Organization;
}

export interface ClientPortfolioSummary {
  org_id: string;
  name: string;
  country: string;
  overall_score: number;
  risk_level: RiskLevel;
  open_issues: number;
  critical_issues: number;
  next_deadline: string | null;
  next_deadline_period: string | null;
  days_to_deadline: number | null;
}

// ============================================================
// EU Importer Portal
// ============================================================

export interface EuImporter {
  id: string;
  org_id: string;
  eori_number: string | null;
  cbam_declarant_auth: string | null;
  eu_member_state: string | null;
  authorized_rep: AuthorizedRep | null;
  is_verified: boolean;
  verified_at: string | null;
}

export interface AuthorizedRep {
  name: string;
  email: string;
  phone: string | null;
}

export interface ReceivedDeclaration {
  id: string;
  importer_org_id: string;
  exporter_org_id: string | null;
  link_id: string;
  submission_id: string | null;
  framework_id: string;
  period_quarter: string;
  status: 'received' | 'under_review' | 'accepted' | 'rejected' | 'correction_requested';
  review_notes: string | null;
  correction_request: Record<string, unknown> | null;
  eu_filing_ref: string | null;
  filed_at: string | null;
  received_at: string;
}

// ============================================================
// Audit Log
// ============================================================

export interface AuditLog {
  id: string;
  org_id: string;
  framework_id: string | null;
  user_id: string | null;
  actor_type: ActorType;
  action: string;
  resource_type: string;
  resource_id: string | null;
  resource_label: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  diff: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  user?: User;
}

// ============================================================
// Dashboard aggregates
// ============================================================

export interface DashboardData {
  org: Organization;
  current_period: string;
  score: ComplianceScore | null;
  open_issues: ComplianceIssue[];
  suppliers: {
    total: number;
    active: number;
    pending: number;
    overdue: number;
  };
  submissions: {
    next_deadline: string | null;
    days_remaining: number | null;
    current_status: SubmissionStatus | null;
  };
  reg_alerts: OrgRegulationAlert[];
  recent_activity: AuditLog[];
}

// ============================================================
// API response wrappers
// ============================================================

export interface ApiSuccess<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    per_page?: number;
    has_more?: boolean;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    field?: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function isApiError(res: ApiResponse<unknown>): res is ApiError {
  return 'error' in res;
}

// ============================================================
// Form schemas (used with Zod + react-hook-form)
// ============================================================

export interface OnboardingOrgForm {
  name: string;
  country: string;
  industry_sectors: IndustrySector[];
  tax_id?: string;
  website?: string;
}

export interface FacilityForm {
  name: string;
  country: string;
  city?: string;
  address?: string;
  industry_sector: IndustrySector;
  permit_number?: string;
  capacity_mt_year?: number;
}

export interface ProductForm {
  name: string;
  cn_code: string;
  facility_id?: string;
  unit_of_measure: string;
  annual_production_volume?: number;
  description?: string;
}

export interface SupplierInviteForm {
  name: string;
  country: string;
  contact_name?: string;
  contact_email: string;
  contact_phone?: string;
  notes?: string;
}

export interface EmissionCalculationForm {
  product_id: string;
  facility_id?: string;
  period: string;
  method: CalculationMethod;
  production_volume: number;
  direct_inputs: DirectEmissionInputs;
  indirect_inputs: IndirectEmissionInputs;
  notes?: string;
}
