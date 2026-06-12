'use client';

import { useState } from 'react';
import { Building2, Users, CreditCard, Mail, Shield } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface SettingsClientProps {
  user: {
    id: string; org_id: string; role: string; full_name: string | null;
    org: {
      id: string; name: string; country: string; plan: string;
      subscription?: { status: string; trial_ends_at: string | null; plan?: { name: string; price_monthly: number | null } } | null;
    };
  };
  teamMembers: { id: string; full_name: string | null; role: string; job_title: string | null; created_at: string }[];
  invitations: { id: string; email: string; role: string; created_at: string; expires_at: string }[];
}

const TABS = [
  { id: 'org',     label: 'Organisation', icon: Building2 },
  { id: 'team',    label: 'Team',         icon: Users },
  { id: 'billing', label: 'Billing',      icon: CreditCard },
] as const;

const ROLES = ['admin', 'analyst', 'auditor', 'viewer'] as const;

export function SettingsClient({ user, teamMembers, invitations }: SettingsClientProps) {
  const [tab, setTab]             = useState<'org' | 'team' | 'billing'>('org');
  const [orgName, setOrgName]     = useState(user.org.name);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole]   = useState<typeof ROLES[number]>('analyst');
  const [inviting, setInviting]   = useState(false);
  const [members, setMembers]     = useState(teamMembers);

  const supabase = createClient();
  const isAdmin = user.role === 'admin';

  async function handleSaveOrg() {
    setSaving(true);
    await supabase.from('organizations').update({ name: orgName }).eq('id', user.org_id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleInvite() {
    if (!inviteEmail) return;
    setInviting(true);
    await fetch('/api/team/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    setInviteEmail('');
    setInviting(false);
  }

  async function handleRemoveMember(memberId: string) {
    if (memberId === user.id) return;
    await supabase.from('users').delete().eq('id', memberId);
    setMembers(prev => prev.filter(m => m.id !== memberId));
  }

  const sub = user.org.subscription;
  const plan = sub?.plan;

  return (
    <>
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg w-fit" style={{ background: 'hsl(var(--surface-sunken))' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all"
            style={{
              background: tab === t.id ? 'hsl(var(--surface-raised))' : 'transparent',
              color: tab === t.id ? 'hsl(var(--ink-primary))' : 'hsl(var(--ink-secondary))',
              border: tab === t.id ? '1px solid hsl(var(--border))' : '1px solid transparent',
            }}>
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Organisation tab */}
      {tab === 'org' && (
        <div className="card">
          <div className="text-sm font-semibold mb-5" style={{ color: 'hsl(var(--ink-primary))' }}>Organisation details</div>
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Company name</label>
              <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)} className="input" disabled={!isAdmin} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Country</label>
              <input type="text" value={user.org.country} className="input" disabled />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Plan</label>
              <div className="flex items-center gap-2">
                <span className="badge badge-accent capitalize">{user.org.plan}</span>
                {sub?.trial_ends_at && new Date(sub.trial_ends_at) > new Date() && (
                  <span className="text-xs" style={{ color: 'hsl(var(--warning))' }}>
                    Trial ends {new Date(sub.trial_ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>
            </div>
            {isAdmin && (
              <button onClick={handleSaveOrg} disabled={saving} className="btn btn-primary">
                {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save changes'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Team tab */}
      {tab === 'team' && (
        <div className="space-y-4">
          {/* Invite form */}
          {isAdmin && (
            <div className="card">
              <div className="text-sm font-semibold mb-4" style={{ color: 'hsl(var(--ink-primary))' }}>Invite team member</div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Email address</label>
                  <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="colleague@company.com" className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>Role</label>
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value as typeof ROLES[number])} className="input">
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <button onClick={handleInvite} disabled={inviting || !inviteEmail} className="btn btn-primary">
                  {inviting ? 'Sending…' : 'Send invite'}
                </button>
              </div>
            </div>
          )}

          {/* Team members */}
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
              <div className="text-sm font-medium" style={{ color: 'hsl(var(--ink-primary))' }}>Team members ({members.length})</div>
            </div>
            <table className="data-table">
              <thead><tr><th>Name</th><th>Role</th><th>Job title</th><th>Joined</th>{isAdmin && <th />}</tr></thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: 'hsl(var(--accent-muted))', color: 'hsl(var(--accent))' }}>
                          {(m.full_name ?? m.role).slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-medium" style={{ color: 'hsl(var(--ink-primary))' }}>{m.full_name ?? '—'}</span>
                        {m.id === user.id && <span className="badge badge-neutral text-xs">You</span>}
                      </div>
                    </td>
                    <td><span className="badge badge-neutral capitalize">{m.role}</span></td>
                    <td style={{ color: 'hsl(var(--ink-secondary))' }}>{m.job_title ?? '—'}</td>
                    <td style={{ color: 'hsl(var(--ink-tertiary))' }}>
                      {new Date(m.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    {isAdmin && (
                      <td>
                        {m.id !== user.id && (
                          <button onClick={() => handleRemoveMember(m.id)} className="btn btn-ghost btn-sm" style={{ color: 'hsl(var(--danger))' }}>Remove</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pending invitations */}
          {invitations.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="px-6 py-4" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                <div className="text-sm font-medium" style={{ color: 'hsl(var(--ink-primary))' }}>Pending invitations</div>
              </div>
              <table className="data-table">
                <thead><tr><th>Email</th><th>Role</th><th>Sent</th><th>Expires</th></tr></thead>
                <tbody>
                  {invitations.map(inv => (
                    <tr key={inv.id}>
                      <td style={{ color: 'hsl(var(--ink-primary))' }}>{inv.email}</td>
                      <td><span className="badge badge-neutral capitalize">{inv.role}</span></td>
                      <td style={{ color: 'hsl(var(--ink-tertiary))' }}>{new Date(inv.created_at).toLocaleDateString('en-GB')}</td>
                      <td style={{ color: 'hsl(var(--ink-tertiary))' }}>{new Date(inv.expires_at).toLocaleDateString('en-GB')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Billing tab */}
      {tab === 'billing' && (
        <div className="space-y-4">
          <div className="card">
            <div className="text-sm font-semibold mb-4" style={{ color: 'hsl(var(--ink-primary))' }}>Current plan</div>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xl font-semibold" style={{ color: 'hsl(var(--ink-primary))' }}>{plan?.name ?? 'Trial'}</div>
                {plan?.price_monthly && (
                  <div className="text-sm mt-0.5" style={{ color: 'hsl(var(--ink-secondary))' }}>€{plan.price_monthly}/month</div>
                )}
                <div className="mt-2">
                  <span className={`badge ${sub?.status === 'active' ? 'badge-success' : sub?.status === 'trialing' ? 'badge-warning' : 'badge-danger'}`}>
                    {sub?.status ?? 'trialing'}
                  </span>
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={async () => {
                    const res = await fetch('/api/billing/portal', { method: 'POST' });
                    const { data } = await res.json();
                    if (data?.url) window.location.href = data.url;
                  }}
                  className="btn btn-secondary"
                >
                  Manage billing
                </button>
              )}
            </div>
          </div>

          {user.org.plan === 'trial' && (
            <div className="card" style={{ borderColor: 'hsl(var(--accent) / 0.3)', background: 'hsl(var(--accent-subtle))' }}>
              <div className="text-sm font-semibold mb-2" style={{ color: 'hsl(var(--accent))' }}>Upgrade to continue</div>
              <p className="text-sm mb-4" style={{ color: 'hsl(var(--ink-secondary))' }}>
                Your trial includes all Professional features. Upgrade before it ends to keep access.
              </p>
              <button
                onClick={async () => {
                  const res = await fetch('/api/billing/checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ plan_slug: 'professional', billing_cycle: 'monthly' }),
                  });
                  const { data } = await res.json();
                  if (data?.checkout_url) window.location.href = data.checkout_url;
                }}
                className="btn btn-primary"
              >
                Upgrade to Professional — €599/mo
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
