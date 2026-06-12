-- ============================================================
-- Migration 0002: Helper functions & RPC endpoints
-- ============================================================

-- get_supplier_stats: used by dashboard to get supplier status breakdown
CREATE OR REPLACE FUNCTION get_supplier_stats(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_total   int;
  v_active  int;
  v_pending int;
  v_overdue int;
  v_period  text;
BEGIN
  -- Current reporting period
  v_period := to_char(now(), 'YYYY') || '-Q' || ceil(date_part('month', now()) / 3)::text;

  SELECT COUNT(*) INTO v_total FROM suppliers WHERE org_id = p_org_id;
  SELECT COUNT(*) INTO v_active FROM suppliers WHERE org_id = p_org_id AND status = 'active';
  SELECT COUNT(*) INTO v_pending FROM suppliers WHERE org_id = p_org_id AND status IN ('invited', 'onboarding');

  -- Overdue = questionnaire sent, past due date, not accepted
  SELECT COUNT(DISTINCT sq.supplier_id) INTO v_overdue
  FROM supplier_questionnaires sq
  WHERE sq.org_id = p_org_id
    AND sq.period = v_period
    AND sq.due_date < CURRENT_DATE
    AND sq.status NOT IN ('accepted', 'rejected');

  RETURN jsonb_build_object(
    'total', v_total,
    'active', v_active,
    'pending', v_pending,
    'overdue', v_overdue
  );
END;
$$;

-- get_org_framework_config: fetch merged framework config for org
CREATE OR REPLACE FUNCTION get_org_framework_config(p_org_id uuid, p_framework_slug text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    cf.config_schema || COALESCE(ofe.config, '{}')
  FROM compliance_frameworks cf
  LEFT JOIN org_framework_enrollments ofe
    ON ofe.framework_id = cf.id AND ofe.org_id = p_org_id
  WHERE cf.slug = p_framework_slug AND cf.is_active = true
  LIMIT 1;
$$;

-- get_dashboard_summary: fast aggregate for dashboard KPIs
CREATE OR REPLACE FUNCTION get_dashboard_summary(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_period text;
  v_score  numeric;
  v_risk   text;
  v_critical_issues int;
  v_open_issues int;
  v_unread_alerts int;
BEGIN
  v_period := to_char(now(), 'YYYY') || '-Q' || ceil(date_part('month', now()) / 3)::text;

  -- Latest score
  SELECT overall_score, risk_level, open_issue_count, critical_issue_count
  INTO v_score, v_risk, v_open_issues, v_critical_issues
  FROM compliance_scores
  WHERE org_id = p_org_id AND period = v_period
  ORDER BY version DESC
  LIMIT 1;

  -- Unread regulation alerts
  SELECT COUNT(*) INTO v_unread_alerts
  FROM org_regulation_alerts
  WHERE org_id = p_org_id AND acknowledged = false;

  RETURN jsonb_build_object(
    'period', v_period,
    'score', v_score,
    'risk_level', v_risk,
    'open_issues', v_open_issues,
    'critical_issues', v_critical_issues,
    'unread_alerts', v_unread_alerts
  );
END;
$$;
