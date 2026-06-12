-- ============================================================
-- CBAM X — Master Database Schema
-- Migration: 0001_initial_schema.sql
-- Includes all Phase 1 + amendment tables
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- for text search

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('admin', 'analyst', 'auditor', 'viewer', 'supplier', 'consultant');
CREATE TYPE org_plan AS ENUM ('trial', 'starter', 'professional', 'enterprise', 'consultant');
CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'incomplete');
CREATE TYPE framework_status AS ENUM ('active', 'draft', 'deprecated');
CREATE TYPE enrollment_status AS ENUM ('active', 'suspended', 'completed', 'pending');
CREATE TYPE supplier_status AS ENUM ('invited', 'onboarding', 'active', 'suspended', 'unresponsive');
CREATE TYPE document_type AS ENUM (
  'invoice', 'supplier_declaration', 'customs_document',
  'electricity_bill', 'production_report', 'lab_certificate',
  'environmental_permit', 'audit_report', 'other'
);
CREATE TYPE ocr_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE calculation_method AS ENUM ('actual', 'default', 'conservative');
CREATE TYPE submission_status AS ENUM ('draft', 'in_review', 'approved', 'submitted', 'accepted', 'rejected');
CREATE TYPE issue_severity AS ENUM ('critical', 'high', 'medium', 'low', 'info');
CREATE TYPE issue_type AS ENUM (
  'missing_supplier_data', 'overdue_questionnaire', 'unverified_calculation',
  'no_evidence_linked', 'high_default_value_usage', 'cn_code_changed',
  'deadline_approaching', 'submission_gap', 'data_quality'
);
CREATE TYPE actor_type AS ENUM ('user', 'consultant', 'supplier', 'system', 'api');
CREATE TYPE reg_update_type AS ENUM (
  'cn_code_change', 'default_value_update', 'deadline_change',
  'new_requirement', 'threshold_change', 'guidance_update'
);
CREATE TYPE reg_severity AS ENUM ('critical', 'major', 'minor', 'informational');
CREATE TYPE link_status AS ENUM ('invited', 'active', 'suspended', 'revoked');
CREATE TYPE declaration_status AS ENUM ('received', 'under_review', 'accepted', 'rejected', 'correction_requested');
CREATE TYPE industry_sector AS ENUM ('iron_steel', 'aluminum', 'cement', 'fertilizers', 'hydrogen', 'electricity', 'other');
CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high', 'critical');

-- ============================================================
-- MODULAR COMPLIANCE FRAMEWORK
-- ============================================================

CREATE TABLE compliance_frameworks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text UNIQUE NOT NULL,             -- 'cbam', 'eu-ets', 'csrd', 'ghg-scope3'
  name             text NOT NULL,
  version          text NOT NULL,                    -- '2024-Q4'
  jurisdiction     text NOT NULL DEFAULT 'EU',
  description      text,
  effective_from   date NOT NULL,
  effective_to     date,                             -- null = currently active
  config_schema    jsonb NOT NULL DEFAULT '{}',      -- framework-specific validation schema
  calculation_rules jsonb NOT NULL DEFAULT '{}',     -- how to compute embedded emissions
  reporting_periods jsonb NOT NULL DEFAULT '{}',     -- quarterly/annual cycle config
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE framework_modules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id     uuid NOT NULL REFERENCES compliance_frameworks(id) ON DELETE CASCADE,
  module_slug      text NOT NULL,                    -- 'emissions_calc', 'reporting', 'supplier_data', 'financial'
  name             text NOT NULL,
  is_required      boolean NOT NULL DEFAULT true,
  config_schema    jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (framework_id, module_slug)
);

CREATE TABLE org_framework_enrollments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL,                    -- FK added after organizations table
  framework_id     uuid NOT NULL REFERENCES compliance_frameworks(id),
  enrolled_at      timestamptz NOT NULL DEFAULT now(),
  enrolled_by      uuid,                             -- user who enrolled
  config           jsonb NOT NULL DEFAULT '{}',      -- org-level overrides
  status           enrollment_status NOT NULL DEFAULT 'active',
  trial_ends_at    timestamptz,
  UNIQUE (org_id, framework_id)
);

-- ============================================================
-- ORGANIZATIONS & USERS
-- ============================================================

CREATE TABLE organizations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  slug             text UNIQUE NOT NULL,
  country          text NOT NULL,                    -- ISO 3166-1 alpha-2
  industry_sectors industry_sector[] NOT NULL DEFAULT '{}',
  plan             org_plan NOT NULL DEFAULT 'trial',
  logo_url         text,
  website          text,
  tax_id           text,
  eori_number      text,                             -- for EU importers
  settings         jsonb NOT NULL DEFAULT '{}',      -- locale, timezone, currency, etc.
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Add FK to org_framework_enrollments now that organizations exists
ALTER TABLE org_framework_enrollments
  ADD CONSTRAINT org_framework_enrollments_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

CREATE TABLE users (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role             user_role NOT NULL DEFAULT 'analyst',
  full_name        text,
  avatar_url       text,
  job_title        text,
  phone            text,
  language         text NOT NULL DEFAULT 'en',       -- 'en', 'ar'
  timezone         text NOT NULL DEFAULT 'UTC',
  notification_prefs jsonb NOT NULL DEFAULT '{"email": true, "in_app": true}',
  last_seen_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE team_invitations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email            text NOT NULL,
  role             user_role NOT NULL DEFAULT 'analyst',
  invited_by       uuid NOT NULL REFERENCES users(id),
  token            text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- SUBSCRIPTION & BILLING
-- ============================================================

CREATE TABLE subscription_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text UNIQUE NOT NULL,
  name             text NOT NULL,
  description      text,
  price_monthly    numeric(10,2),
  price_annual     numeric(10,2),
  max_users        int,                              -- null = unlimited
  max_facilities   int,
  max_products     int,
  max_suppliers    int,
  max_client_orgs  int,                              -- for consultant plan
  frameworks_included text[] NOT NULL DEFAULT ARRAY['cbam'],
  features         jsonb NOT NULL DEFAULT '{}',      -- {ai_ocr, white_label, api_access, sso, ...}
  stripe_price_id_monthly text,
  stripe_price_id_annual  text,
  is_active        boolean NOT NULL DEFAULT true,
  sort_order       int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE org_subscriptions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id               uuid NOT NULL REFERENCES subscription_plans(id),
  stripe_customer_id    text,
  stripe_subscription_id text,
  status                subscription_status NOT NULL DEFAULT 'trialing',
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancel_at_period_end  boolean NOT NULL DEFAULT false,
  trial_ends_at         timestamptz,
  canceled_at           timestamptz,
  metadata              jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id)
);

CREATE TABLE usage_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type       text NOT NULL,                    -- 'ai_ocr_page', 'report_export', 'api_call'
  quantity         int NOT NULL DEFAULT 1,
  metadata         jsonb NOT NULL DEFAULT '{}',
  stripe_usage_record_id text,
  recorded_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- FACILITIES & INSTALLATIONS
-- ============================================================

CREATE TABLE facilities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  country          text NOT NULL,
  city             text,
  address          text,
  latitude         numeric(10,7),
  longitude        numeric(10,7),
  industry_sector  industry_sector NOT NULL,
  permit_number    text,
  capacity_mt_year numeric(15,2),                   -- metric tonnes per year
  is_active        boolean NOT NULL DEFAULT true,
  metadata         jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE installations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id      uuid NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  process_type     text NOT NULL,                    -- 'eaf', 'bof', 'rotary_kiln', etc.
  capacity_value   numeric(15,2),
  capacity_unit    text,
  fuel_type        text,
  commissioned_year int,
  is_active        boolean NOT NULL DEFAULT true,
  metadata         jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PRODUCTS & CN CODES
-- ============================================================

CREATE TABLE products (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id      uuid REFERENCES facilities(id),
  name             text NOT NULL,
  description      text,
  cn_code          text NOT NULL,                    -- 8-digit CN code
  cbam_sector      industry_sector,
  unit_of_measure  text NOT NULL DEFAULT 't',        -- 't', 'MWh', 'kg'
  is_cbam_covered  boolean,                          -- computed by applicability engine
  applicability_checked_at timestamptz,
  applicability_notes text,
  annual_production_volume numeric(15,2),
  is_active        boolean NOT NULL DEFAULT true,
  metadata         jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cn_code_registry (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cn_code          text NOT NULL,
  description      text NOT NULL,
  cbam_sector      industry_sector,
  is_cbam_covered  boolean NOT NULL DEFAULT false,
  valid_from       date NOT NULL,
  valid_to         date,
  parent_cn_code   text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cn_code_registry_code ON cn_code_registry(cn_code);

-- ============================================================
-- SUPPLIERS
-- ============================================================

CREATE TABLE suppliers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  country          text NOT NULL,
  contact_name     text,
  contact_email    text,
  contact_phone    text,
  tax_id           text,
  status           supplier_status NOT NULL DEFAULT 'invited',
  portal_user_id   uuid REFERENCES auth.users(id),  -- if supplier has platform account
  invite_token     text UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invite_sent_at   timestamptz,
  last_activity_at timestamptz,
  notes            text,
  metadata         jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE supplier_questionnaires (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id      uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  framework_id     uuid NOT NULL REFERENCES compliance_frameworks(id),
  period           text NOT NULL,                    -- '2025-Q1'
  status           text NOT NULL DEFAULT 'draft',    -- 'draft','sent','in_progress','submitted','accepted','rejected'
  questions        jsonb NOT NULL DEFAULT '[]',      -- structured question definitions
  responses        jsonb NOT NULL DEFAULT '{}',      -- supplier responses keyed by question_id
  submitted_at     timestamptz,
  reviewed_at      timestamptz,
  reviewed_by      uuid REFERENCES users(id),
  review_notes     text,
  due_date         date,
  reminder_sent_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- DOCUMENTS & EVIDENCE
-- ============================================================

CREATE TABLE documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id      uuid REFERENCES suppliers(id),
  framework_id     uuid REFERENCES compliance_frameworks(id),
  type             document_type NOT NULL,
  filename         text NOT NULL,
  storage_path     text NOT NULL,                    -- Supabase Storage path
  file_size_bytes  bigint,
  mime_type        text,
  ocr_status       ocr_status NOT NULL DEFAULT 'pending',
  ocr_data         jsonb,                            -- extracted structured data
  ocr_confidence   numeric(5,2),                    -- 0-100
  version          int NOT NULL DEFAULT 1,
  parent_document_id uuid REFERENCES documents(id), -- for versioning
  period           text,                             -- '2025-Q1' if period-specific
  uploaded_by      uuid NOT NULL REFERENCES users(id),
  description      text,
  tags             text[] NOT NULL DEFAULT '{}',
  is_archived      boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evidence (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id      uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  linked_to_type   text NOT NULL,                    -- 'calculation', 'submission', 'questionnaire_response'
  linked_to_id     uuid NOT NULL,
  description      text,
  verified_by      uuid REFERENCES users(id),
  verified_at      timestamptz,
  is_primary       boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- EMISSIONS ENGINE
-- ============================================================

CREATE TABLE emission_factors (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id     uuid NOT NULL REFERENCES compliance_frameworks(id),
  sector           industry_sector NOT NULL,
  region           text NOT NULL DEFAULT 'GLOBAL',   -- country/region this factor applies to
  process_type     text,                             -- null = default for sector
  factor_value     numeric(15,6) NOT NULL,
  unit             text NOT NULL,                    -- 'tCO2e/t', 'tCO2e/MWh'
  source           text NOT NULL,                    -- 'EU_REGULATION', 'IPCC', 'CUSTOM'
  source_reference text,                             -- regulation article / IPCC table ref
  valid_from       date NOT NULL,
  valid_to         date,
  is_default       boolean NOT NULL DEFAULT true,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE emission_calculations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  framework_id          uuid NOT NULL REFERENCES compliance_frameworks(id),
  product_id            uuid NOT NULL REFERENCES products(id),
  facility_id           uuid REFERENCES facilities(id),
  period                text NOT NULL,               -- '2025-Q1'
  method                calculation_method NOT NULL DEFAULT 'actual',
  -- Direct emissions
  direct_emissions      numeric(15,6),               -- tCO2e per unit
  direct_inputs         jsonb NOT NULL DEFAULT '{}', -- structured calculation inputs
  direct_factor_id      uuid REFERENCES emission_factors(id),
  -- Indirect emissions
  indirect_emissions    numeric(15,6),               -- tCO2e per unit
  indirect_inputs       jsonb NOT NULL DEFAULT '{}',
  indirect_factor_id    uuid REFERENCES emission_factors(id),
  -- Totals
  total_embedded        numeric(15,6),               -- direct + indirect per unit
  production_volume     numeric(15,2),               -- units produced this period
  total_co2e            numeric(15,2),               -- total_embedded × production_volume
  -- Audit trail
  calculation_log       jsonb NOT NULL DEFAULT '[]', -- step-by-step immutable log
  assumptions           jsonb NOT NULL DEFAULT '{}',
  -- Status
  version               int NOT NULL DEFAULT 1,
  is_approved           boolean NOT NULL DEFAULT false,
  approved_by           uuid REFERENCES users(id),
  approved_at           timestamptz,
  notes                 text,
  calculated_by         uuid NOT NULL REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now()
  -- No updated_at — calculations are immutable snapshots
);

-- ============================================================
-- COMPLIANCE SCORING
-- ============================================================

CREATE TABLE compliance_scores (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  framework_id     uuid NOT NULL REFERENCES compliance_frameworks(id),
  period           text NOT NULL,
  overall_score    numeric(5,2) NOT NULL,            -- 0.00 to 100.00
  dimension_scores jsonb NOT NULL DEFAULT '{}',      -- {data_completeness, supplier_coverage, ...}
  risk_level       risk_level NOT NULL DEFAULT 'medium',
  open_issue_count int NOT NULL DEFAULT 0,
  critical_issue_count int NOT NULL DEFAULT 0,
  version          int NOT NULL DEFAULT 1,
  computed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, framework_id, period, version)
);

CREATE TABLE compliance_issues (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  framework_id     uuid NOT NULL REFERENCES compliance_frameworks(id),
  period           text NOT NULL,
  issue_type       issue_type NOT NULL,
  severity         issue_severity NOT NULL,
  title            text NOT NULL,
  description      text NOT NULL,
  entity_type      text,                             -- 'supplier', 'product', 'calculation', 'document'
  entity_id        uuid,
  entity_label     text,                             -- human-readable name of the entity
  resolution_steps jsonb NOT NULL DEFAULT '[]',      -- [{step, action, route}]
  resolved_at      timestamptz,
  resolved_by      uuid REFERENCES users(id),
  auto_resolved    boolean NOT NULL DEFAULT false,
  dismissed        boolean NOT NULL DEFAULT false,
  dismissed_by     uuid REFERENCES users(id),
  dismissed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- SUBMISSIONS
-- ============================================================

CREATE TABLE submissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  framework_id     uuid NOT NULL REFERENCES compliance_frameworks(id),
  period_quarter   text NOT NULL,                    -- '2025-Q1'
  status           submission_status NOT NULL DEFAULT 'draft',
  calculation_ids  uuid[] NOT NULL DEFAULT '{}',
  evidence_ids     uuid[] NOT NULL DEFAULT '{}',
  compliance_score numeric(5,2),                     -- score at time of submission
  xml_payload      text,                             -- generated XML for EU CBAM registry
  pdf_path         text,                             -- Supabase Storage path
  excel_path       text,
  submitted_at     timestamptz,
  submitted_by     uuid REFERENCES users(id),
  eu_reference     text,                             -- reference from EU CBAM portal
  notes            text,
  metadata         jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- REGULATION INTELLIGENCE
-- ============================================================

CREATE TABLE regulation_updates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id     uuid NOT NULL REFERENCES compliance_frameworks(id),
  source_url       text,
  update_type      reg_update_type NOT NULL,
  severity         reg_severity NOT NULL DEFAULT 'minor',
  title            text NOT NULL,
  summary          text NOT NULL,
  full_content     text,
  affected_cn_codes text[] NOT NULL DEFAULT '{}',
  effective_date   date,
  action_required  boolean NOT NULL DEFAULT false,
  action_deadline  date,
  raw_content      jsonb,
  processed_by_ai  boolean NOT NULL DEFAULT false,
  ai_summary       text,
  published_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE org_regulation_alerts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  update_id        uuid NOT NULL REFERENCES regulation_updates(id),
  impact_level     text NOT NULL DEFAULT 'indirect', -- 'direct', 'indirect', 'none'
  affected_product_ids uuid[] NOT NULL DEFAULT '{}',
  affected_cn_codes text[] NOT NULL DEFAULT '{}',
  action_required  boolean NOT NULL DEFAULT false,
  acknowledged     boolean NOT NULL DEFAULT false,
  acknowledged_by  uuid REFERENCES users(id),
  acknowledged_at  timestamptz,
  actioned         boolean NOT NULL DEFAULT false,
  actioned_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- CONSULTANT WORKSPACE
-- ============================================================

CREATE TABLE consultant_workspaces (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  white_label_config jsonb NOT NULL DEFAULT '{}',    -- {logo_url, primary_color, report_header, domain}
  max_clients      int,
  features         jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id)
);

CREATE TABLE consultant_client_links (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES consultant_workspaces(id) ON DELETE CASCADE,
  client_org_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  access_level     text NOT NULL DEFAULT 'full',     -- 'full', 'read_only', 'reporting_only'
  delegated_by     uuid NOT NULL REFERENCES users(id),
  granted_at       timestamptz NOT NULL DEFAULT now(),
  revoked_at       timestamptz,
  notes            text,
  UNIQUE (workspace_id, client_org_id)
);

CREATE TABLE consultant_portfolio_snapshots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES consultant_workspaces(id) ON DELETE CASCADE,
  snapshot_date    date NOT NULL DEFAULT CURRENT_DATE,
  client_count     int NOT NULL DEFAULT 0,
  client_summaries jsonb NOT NULL DEFAULT '[]',      -- [{org_id, name, score, open_issues, next_deadline}]
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- EU IMPORTER PORTAL
-- ============================================================

CREATE TABLE eu_importers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  eori_number           text,
  cbam_declarant_auth   text,                        -- CBAM registry authorization number
  eu_member_state       text,                        -- ISO country code, must be EU
  authorized_rep        jsonb,                       -- {name, email, phone}
  is_verified           boolean NOT NULL DEFAULT false,
  verified_at           timestamptz,
  metadata              jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id)
);

CREATE TABLE importer_exporter_links (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importer_org_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  exporter_org_id  uuid REFERENCES organizations(id), -- null if not on platform
  exporter_name    text NOT NULL,
  exporter_country text NOT NULL,
  status           link_status NOT NULL DEFAULT 'invited',
  invite_token     text UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invite_sent_at   timestamptz,
  linked_at        timestamptz,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE received_declarations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importer_org_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  exporter_org_id  uuid REFERENCES organizations(id),
  link_id          uuid NOT NULL REFERENCES importer_exporter_links(id),
  submission_id    uuid REFERENCES submissions(id),
  framework_id     uuid NOT NULL REFERENCES compliance_frameworks(id),
  period_quarter   text NOT NULL,
  status           declaration_status NOT NULL DEFAULT 'received',
  review_notes     text,
  correction_request jsonb,
  eu_filing_ref    text,
  filed_at         timestamptz,
  received_at      timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- AUDIT LOG (append-only — no RLS UPDATE/DELETE policies)
-- ============================================================

CREATE TABLE audit_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  framework_id     uuid REFERENCES compliance_frameworks(id),
  user_id          uuid REFERENCES auth.users(id),
  actor_type       actor_type NOT NULL DEFAULT 'user',
  action           text NOT NULL,                    -- 'create', 'update', 'delete', 'approve', 'submit'
  resource_type    text NOT NULL,                    -- table name
  resource_id      uuid,
  resource_label   text,                             -- human-readable identifier
  old_value        jsonb,
  new_value        jsonb,
  diff             jsonb,                            -- computed change diff
  ip_address       inet,
  user_agent       text,
  session_id       text,
  metadata         jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
  -- Intentionally no updated_at — immutable
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES users(id),        -- null = all org admins
  type             text NOT NULL,                    -- 'deadline', 'missing_data', 'reg_update', etc.
  title            text NOT NULL,
  message          text NOT NULL,
  action_url       text,                             -- deep link into the app
  regulation_update_id uuid REFERENCES regulation_updates(id),
  compliance_issue_id  uuid REFERENCES compliance_issues(id),
  priority         text NOT NULL DEFAULT 'normal',   -- 'low', 'normal', 'high', 'urgent'
  read             boolean NOT NULL DEFAULT false,
  read_at          timestamptz,
  email_sent       boolean NOT NULL DEFAULT false,
  email_sent_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Organization lookups
CREATE INDEX idx_users_org_id ON users(org_id);
CREATE INDEX idx_facilities_org_id ON facilities(org_id);
CREATE INDEX idx_products_org_id ON products(org_id);
CREATE INDEX idx_products_cn_code ON products(cn_code);
CREATE INDEX idx_suppliers_org_id ON suppliers(org_id);
CREATE INDEX idx_suppliers_status ON suppliers(org_id, status);

-- Documents
CREATE INDEX idx_documents_org_id ON documents(org_id);
CREATE INDEX idx_documents_supplier ON documents(org_id, supplier_id);
CREATE INDEX idx_documents_type ON documents(org_id, type);
CREATE INDEX idx_documents_period ON documents(org_id, period);

-- Emissions (critical query path)
CREATE INDEX idx_emissions_org_period ON emission_calculations(org_id, framework_id, period);
CREATE INDEX idx_emissions_product ON emission_calculations(org_id, product_id);

-- Compliance scoring
CREATE INDEX idx_compliance_scores_lookup ON compliance_scores(org_id, framework_id, period);
CREATE INDEX idx_compliance_issues_open ON compliance_issues(org_id, framework_id, period) WHERE resolved_at IS NULL AND dismissed = false;

-- Submissions
CREATE INDEX idx_submissions_org_period ON submissions(org_id, framework_id, period_quarter);

-- Audit log (time series)
CREATE INDEX idx_audit_logs_org_time ON audit_logs(org_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(org_id, resource_type, resource_id);

-- Notifications
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read) WHERE read = false;

-- Consultant
CREATE INDEX idx_consultant_links_workspace ON consultant_client_links(workspace_id) WHERE revoked_at IS NULL;

-- Regulation alerts
CREATE INDEX idx_reg_alerts_org_unread ON org_regulation_alerts(org_id, acknowledged) WHERE acknowledged = false;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_questionnaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE emission_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulation_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_regulation_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultant_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultant_client_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_framework_enrollments ENABLE ROW LEVEL SECURITY;

-- Helper function: get org_id for current user
CREATE OR REPLACE FUNCTION auth.org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT org_id FROM users WHERE id = auth.uid()
$$;

-- Helper function: get role for current user
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role FROM users WHERE id = auth.uid()
$$;

-- Helper function: check if current user is consultant for a given org
CREATE OR REPLACE FUNCTION auth.is_consultant_for(target_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM consultant_client_links ccl
    JOIN consultant_workspaces cw ON cw.id = ccl.workspace_id
    JOIN users u ON u.org_id = cw.org_id
    WHERE u.id = auth.uid()
      AND ccl.client_org_id = target_org_id
      AND ccl.revoked_at IS NULL
  )
$$;

-- Organizations: members of the org, or consultants with access
CREATE POLICY "org_read" ON organizations FOR SELECT
  USING (
    id = auth.org_id()
    OR auth.is_consultant_for(id)
  );

CREATE POLICY "org_update_admin" ON organizations FOR UPDATE
  USING (id = auth.org_id() AND auth.user_role() = 'admin');

-- Standard org isolation policy (applied to most tables)
-- Users can see rows in their own org, or rows in orgs they consult for
CREATE POLICY "org_isolation_select" ON facilities FOR SELECT
  USING (org_id = auth.org_id() OR auth.is_consultant_for(org_id));
CREATE POLICY "org_isolation_insert" ON facilities FOR INSERT
  WITH CHECK (org_id = auth.org_id());
CREATE POLICY "org_isolation_update" ON facilities FOR UPDATE
  USING (org_id = auth.org_id() AND auth.user_role() IN ('admin', 'analyst'));
CREATE POLICY "org_isolation_delete" ON facilities FOR DELETE
  USING (org_id = auth.org_id() AND auth.user_role() = 'admin');

-- Apply same pattern to core tables
DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    'products', 'suppliers', 'documents', 'evidence',
    'emission_calculations', 'compliance_scores', 'compliance_issues',
    'submissions', 'org_regulation_alerts', 'notifications',
    'org_framework_enrollments', 'org_subscriptions', 'usage_events'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format('
      CREATE POLICY "org_isolation_select" ON %I FOR SELECT
        USING (org_id = auth.org_id() OR auth.is_consultant_for(org_id));
      CREATE POLICY "org_isolation_insert" ON %I FOR INSERT
        WITH CHECK (org_id = auth.org_id());
      CREATE POLICY "org_isolation_update" ON %I FOR UPDATE
        USING (org_id = auth.org_id());
      CREATE POLICY "org_isolation_delete" ON %I FOR DELETE
        USING (org_id = auth.org_id());
    ', tbl, tbl, tbl, tbl);
  END LOOP;
END $$;

-- Users: can read others in same org
CREATE POLICY "users_org_read" ON users FOR SELECT
  USING (org_id = auth.org_id() OR auth.is_consultant_for(org_id));
CREATE POLICY "users_self_update" ON users FOR UPDATE
  USING (id = auth.uid());

-- Supplier questionnaires: suppliers can only see their own
CREATE POLICY "supplier_questionnaire_supplier_read" ON supplier_questionnaires FOR SELECT
  USING (
    org_id = auth.org_id()
    OR auth.is_consultant_for(org_id)
    OR supplier_id IN (
      SELECT id FROM suppliers WHERE portal_user_id = auth.uid()
    )
  );

-- Audit log: INSERT only for org members, SELECT for admin/auditor, NO UPDATE/DELETE
CREATE POLICY "audit_log_insert" ON audit_logs FOR INSERT
  WITH CHECK (org_id = auth.org_id());
CREATE POLICY "audit_log_select" ON audit_logs FOR SELECT
  USING (
    (org_id = auth.org_id() AND auth.user_role() IN ('admin', 'auditor'))
    OR auth.is_consultant_for(org_id)
  );
-- Intentionally NO update or delete policies on audit_logs

-- Compliance frameworks: public read (no org isolation needed)
ALTER TABLE compliance_frameworks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "frameworks_public_read" ON compliance_frameworks FOR SELECT USING (true);

-- CN code registry: public read
ALTER TABLE cn_code_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cn_code_public_read" ON cn_code_registry FOR SELECT USING (true);

-- Regulation updates: public read
CREATE POLICY "reg_updates_public_read" ON regulation_updates FOR SELECT USING (true);

-- Consultant workspace policies
CREATE POLICY "consultant_workspace_own_read" ON consultant_workspaces FOR SELECT
  USING (org_id = auth.org_id());
CREATE POLICY "consultant_workspace_own_write" ON consultant_workspaces FOR ALL
  USING (org_id = auth.org_id() AND auth.user_role() = 'admin');

CREATE POLICY "consultant_links_workspace_read" ON consultant_client_links FOR SELECT
  USING (
    workspace_id IN (SELECT id FROM consultant_workspaces WHERE org_id = auth.org_id())
  );

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    'organizations', 'users', 'facilities', 'products', 'suppliers',
    'supplier_questionnaires', 'documents', 'submissions', 'compliance_issues',
    'consultant_workspaces', 'received_declarations', 'org_subscriptions'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format('
      CREATE TRIGGER trg_%I_updated_at
      BEFORE UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    ', tbl, tbl);
  END LOOP;
END $$;

-- Auto-create org_subscription (trial) when org is created
CREATE OR REPLACE FUNCTION create_trial_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  starter_plan_id uuid;
BEGIN
  SELECT id INTO starter_plan_id FROM subscription_plans WHERE slug = 'starter' LIMIT 1;
  IF starter_plan_id IS NOT NULL THEN
    INSERT INTO org_subscriptions (org_id, plan_id, status, trial_ends_at)
    VALUES (NEW.id, starter_plan_id, 'trialing', now() + interval '14 days');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_org_create_subscription
AFTER INSERT ON organizations
FOR EACH ROW EXECUTE FUNCTION create_trial_subscription();

-- Auto-enroll org in CBAM framework when org is created
CREATE OR REPLACE FUNCTION auto_enroll_cbam()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cbam_id uuid;
BEGIN
  SELECT id INTO cbam_id FROM compliance_frameworks WHERE slug = 'cbam' AND is_active = true LIMIT 1;
  IF cbam_id IS NOT NULL THEN
    INSERT INTO org_framework_enrollments (org_id, framework_id, enrolled_by)
    VALUES (NEW.id, cbam_id, NEW.id)  -- enrolled_by org (system)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_org_enroll_cbam
AFTER INSERT ON organizations
FOR EACH ROW EXECUTE FUNCTION auto_enroll_cbam();

-- Recalculate compliance score when key data changes
CREATE OR REPLACE FUNCTION trigger_score_recompute()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Insert a deferred recompute job into a queue table
  -- (Supabase Edge Function listens via pg_notify or scheduled job)
  PERFORM pg_notify('score_recompute', json_build_object(
    'org_id', COALESCE(NEW.org_id, OLD.org_id),
    'trigger_table', TG_TABLE_NAME,
    'triggered_at', now()
  )::text);
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Notify on changes that affect compliance score
CREATE TRIGGER trg_suppliers_score
AFTER INSERT OR UPDATE OF status ON suppliers
FOR EACH ROW EXECUTE FUNCTION trigger_score_recompute();

CREATE TRIGGER trg_questionnaire_score
AFTER INSERT OR UPDATE OF status ON supplier_questionnaires
FOR EACH ROW EXECUTE FUNCTION trigger_score_recompute();

CREATE TRIGGER trg_calculations_score
AFTER INSERT ON emission_calculations
FOR EACH ROW EXECUTE FUNCTION trigger_score_recompute();

-- ============================================================
-- SEED DATA: Compliance frameworks
-- ============================================================

INSERT INTO compliance_frameworks (slug, name, version, jurisdiction, effective_from, config_schema, calculation_rules, reporting_periods) VALUES
(
  'cbam',
  'EU Carbon Border Adjustment Mechanism',
  '2024-Q4',
  'EU',
  '2023-10-01',
  '{
    "required_cn_codes": true,
    "embedded_emissions_unit": "tCO2e/t",
    "reporting_currency": "EUR",
    "supports_actual_values": true,
    "supports_default_values": true
  }',
  '{
    "direct_emission_formula": "activity_data × emission_factor × oxidation_factor",
    "indirect_emission_formula": "electricity_consumption × electricity_emission_factor",
    "default_value_penalty_factor": 1.0,
    "attribution_methods": ["single_production_process", "benchmark"]
  }',
  '{
    "type": "quarterly",
    "quarters": ["Q1", "Q2", "Q3", "Q4"],
    "filing_deadline_days_after_quarter_end": 30,
    "first_reporting_period": "2024-Q1"
  }'
),
(
  'eu-ets',
  'EU Emissions Trading System',
  '2024',
  'EU',
  '2005-01-01',
  '{"allowance_unit": "EUA", "monitoring_methodology": "CIM"}',
  '{"allocation_method": "free_allocation_or_auction"}',
  '{"type": "annual", "filing_deadline": "March 31"}'
),
(
  'csrd',
  'EU Corporate Sustainability Reporting Directive',
  '2024',
  'EU',
  '2024-01-01',
  '{"standards": ["ESRS_E1", "ESRS_E2", "ESRS_S1"], "assurance_required": true}',
  '{"scope_coverage": ["scope1", "scope2", "scope3"]}',
  '{"type": "annual", "filing_deadline": "June 30"}'
),
(
  'ghg-scope3',
  'GHG Protocol Scope 3 Accounting',
  '2023',
  'GLOBAL',
  '2011-01-01',
  '{"categories": 15, "materiality_threshold_pct": 1}',
  '{"calculation_methods": ["spend_based", "activity_based", "hybrid"]}',
  '{"type": "annual"}'
);

-- Mark EU ETS, CSRD, GHG as inactive (V2 features)
UPDATE compliance_frameworks SET is_active = false WHERE slug IN ('eu-ets', 'csrd', 'ghg-scope3');

-- ============================================================
-- SEED DATA: Subscription plans
-- ============================================================

INSERT INTO subscription_plans (slug, name, description, price_monthly, price_annual, max_users, max_facilities, max_products, max_suppliers, max_client_orgs, frameworks_included, features, sort_order) VALUES
(
  'trial',
  'Free Trial',
  '14-day full access trial',
  0, 0, 3, 1, 5, 10, NULL,
  ARRAY['cbam'],
  '{"ai_ocr": true, "white_label": false, "api_access": false, "sso": false, "consultant_portal": false, "advanced_reporting": false}',
  0
),
(
  'starter',
  'Starter',
  'For small exporters and manufacturers',
  199, 1990, 5, 1, 10, 20, NULL,
  ARRAY['cbam'],
  '{"ai_ocr": true, "ai_ocr_pages_monthly": 100, "white_label": false, "api_access": false, "sso": false, "consultant_portal": false, "advanced_reporting": false}',
  1
),
(
  'professional',
  'Professional',
  'For growing manufacturers and compliance teams',
  599, 5990, 15, 5, 100, 100, NULL,
  ARRAY['cbam'],
  '{"ai_ocr": true, "ai_ocr_pages_monthly": 500, "white_label": false, "api_access": true, "sso": false, "consultant_portal": false, "advanced_reporting": true}',
  2
),
(
  'enterprise',
  'Enterprise',
  'Unlimited scale with dedicated support',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  ARRAY['cbam', 'eu-ets', 'csrd'],
  '{"ai_ocr": true, "ai_ocr_pages_monthly": null, "white_label": true, "api_access": true, "sso": true, "consultant_portal": true, "advanced_reporting": true, "dedicated_csm": true}',
  3
),
(
  'consultant',
  'Consultant',
  'For CBAM advisory firms managing multiple clients',
  999, 9990, 20, NULL, NULL, NULL, 20,
  ARRAY['cbam'],
  '{"ai_ocr": true, "ai_ocr_pages_monthly": 1000, "white_label": true, "api_access": true, "sso": false, "consultant_portal": true, "advanced_reporting": true, "portfolio_view": true}',
  4
);

-- ============================================================
-- SEED DATA: CBAM CN codes (primary covered sectors)
-- ============================================================

INSERT INTO cn_code_registry (cn_code, description, cbam_sector, is_cbam_covered, valid_from) VALUES
-- Iron & Steel
('7201', 'Pig iron and spiegeleisen in pigs, blocks or other primary forms', 'iron_steel', true, '2023-10-01'),
('7202', 'Ferro-alloys', 'iron_steel', true, '2023-10-01'),
('7206', 'Iron and non-alloy steel in ingots or other primary forms', 'iron_steel', true, '2023-10-01'),
('7207', 'Semi-finished products of iron or non-alloy steel', 'iron_steel', true, '2023-10-01'),
('7208', 'Flat-rolled products of iron or non-alloy steel, hot-rolled', 'iron_steel', true, '2023-10-01'),
('7209', 'Flat-rolled products of iron or non-alloy steel, cold-rolled', 'iron_steel', true, '2023-10-01'),
('7210', 'Flat-rolled products of iron or non-alloy steel, coated', 'iron_steel', true, '2023-10-01'),
('7213', 'Bars and rods, hot-rolled, in irregularly wound coils', 'iron_steel', true, '2023-10-01'),
('7214', 'Other bars and rods of iron or non-alloy steel', 'iron_steel', true, '2023-10-01'),
('7216', 'Angles, shapes and sections of iron or non-alloy steel', 'iron_steel', true, '2023-10-01'),
-- Aluminum
('7601', 'Unwrought aluminium', 'aluminum', true, '2023-10-01'),
('7604', 'Aluminium bars, rods and profiles', 'aluminum', true, '2023-10-01'),
('7605', 'Aluminium wire', 'aluminum', true, '2023-10-01'),
('7606', 'Aluminium plates, sheets and strip', 'aluminum', true, '2023-10-01'),
('7607', 'Aluminium foil', 'aluminum', true, '2023-10-01'),
-- Cement
('2523', 'Portland cement, aluminous cement, slag cement', 'cement', true, '2023-10-01'),
-- Fertilizers
('3102', 'Mineral or chemical fertilisers, nitrogenous', 'fertilizers', true, '2023-10-01'),
('3105', 'Mineral or chemical fertilisers containing nitrogen, phosphorus and potassium', 'fertilizers', true, '2023-10-01'),
('2814', 'Ammonia, anhydrous or in aqueous solution', 'fertilizers', true, '2023-10-01'),
('2833', 'Sulphates; alums; peroxosulphates', 'fertilizers', true, '2023-10-01'),
-- Hydrogen
('2804', 'Hydrogen, rare gases and other non-metals', 'hydrogen', true, '2023-10-01'),
-- Electricity
('2716', 'Electrical energy', 'electricity', true, '2023-10-01');

-- ============================================================
-- SEED DATA: EU default emission factors for CBAM
-- ============================================================

WITH cbam_fw AS (SELECT id FROM compliance_frameworks WHERE slug = 'cbam')
INSERT INTO emission_factors (framework_id, sector, region, factor_value, unit, source, source_reference, valid_from, is_default)
SELECT
  cbam_fw.id,
  sector::industry_sector,
  'GLOBAL',
  factor_value,
  unit,
  'EU_REGULATION',
  reference,
  '2023-10-01',
  true
FROM cbam_fw, (VALUES
  ('iron_steel',   4.90, 'tCO2e/t',   'CBAM Regulation (EU) 2023/956 Annex III'),
  ('aluminum',     6.70, 'tCO2e/t',   'CBAM Regulation (EU) 2023/956 Annex III'),
  ('cement',       0.812,'tCO2e/t',   'CBAM Regulation (EU) 2023/956 Annex III'),
  ('fertilizers',  2.40, 'tCO2e/t',   'CBAM Regulation (EU) 2023/956 Annex III — urea'),
  ('hydrogen',    10.90, 'tCO2e/tH2', 'CBAM Regulation (EU) 2023/956 Annex III'),
  ('electricity',  0.487,'tCO2e/MWh', 'EU average grid emission factor 2023')
) AS f(sector, factor_value, unit, reference);
