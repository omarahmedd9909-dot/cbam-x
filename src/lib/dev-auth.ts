/**
 * DEV-ONLY auth bypass — never ships to production.
 * Set DEV_BYPASS=true in .env.local to enable.
 */

export const DEV_BYPASS_COOKIE = '__dev_bypass';
export const DEV_BYPASS_SECRET = 'cbam-dev-local-2025';

export const DEV_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  org_id: '00000000-0000-0000-0000-000000000002',
  role: 'admin' as const,
  full_name: 'Dev User',
};

export const DEV_ORG = {
  id: DEV_USER.org_id,
  name: 'Demo Organisation',
  plan: 'professional',
  country: 'EG',
};

export function isDevBypassEnabled(): boolean {
  return process.env.NODE_ENV === 'development';
}
