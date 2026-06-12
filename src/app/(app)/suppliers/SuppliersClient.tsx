'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, Mail, Users, CheckCircle, Clock, AlertTriangle, XCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { createClient } from '@/lib/supabase/client';
import type { Supplier } from '@/types/domain';

type SupplierWithQ = Supplier & {
  latestQuestionnaire?: { status: string; period: string; due_date: string | null } | null;
};

interface SuppliersClientProps {
  suppliers: Supplier[];
  questionnaires: { supplier_id: string; status: string; period: string; due_date: string | null }[];
  frameworkId: string;
  orgId: string;
  userRole: string;
  defaultOpenInvite: boolean;
  defaultFilter?: string;
}

const STATUS_CONFIG = {
  active: { label: 'Active', icon: CheckCircle, color: 'hsl(var(--success))', badge: 'badge-success' },
  invited: { label: 'Invited', icon: Mail, color: 'hsl(var(--accent))', badge: 'badge-accent' },
  onboarding: { label: 'Onboarding', icon: Clock, color: 'hsl(var(--warning))', badge: 'badge-warning' },
  suspended: { label: 'Suspended', icon: XCircle, color: 'hsl(var(--ink-tertiary))', badge: 'badge-neutral' },
  unresponsive: { label: 'Unresponsive', icon: AlertTriangle, color: 'hsl(var(--danger))', badge: 'badge-danger' },
} as const;

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
}

export function SuppliersClient({
  suppliers: initialSuppliers,
  questionnaires,
  frameworkId,
  orgId,
  userRole,
  defaultOpenInvite,
  defaultFilter,
}: SuppliersClientProps) {
  const [suppliers, setSuppliers] = useState<SupplierWithQ[]>(() => {
    // Merge questionnaire data with suppliers
    const qBySupplier: Record<string, typeof questionnaires[0]> = {};
    const currentPeriod = getCurrentPeriod();
    questionnaires
      .filter((q) => q.period === currentPeriod)
      .forEach((q) => { qBySupplier[q.supplier_id] = q; });

    return initialSuppliers.map((s) => ({
      ...s,
      latestQuestionnaire: qBySupplier[s.id] ?? null,
    }));
  });

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(defaultFilter ?? 'all');
  const [showInvite, setShowInvite] = useState(defaultOpenInvite);
  const [saving, setSaving] = useState(false);
  const [sendingQ, setSendingQ] = useState<string | null>(null);

  const [inviteForm, setInviteForm] = useState({
    name: '',
    country: '',
    contact_name: '',
    contact_email: '',
    notes: '',
  });

  const supabase = createClient();
  const canEdit = ['admin', 'analyst'].includes(userRole);
  const currentPeriod = getCurrentPeriod();

  const filtered = suppliers.filter((s) => {
    const matchSearch = !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.country.toLowerCase().includes(search.toLowerCase()) ||
      (s.contact_email ?? '').toLowerCase().includes(search.toLowerCase());

    const now = new Date();
    const matchFilter = filter === 'all' ||
      (filter === 'active' && s.status === 'active') ||
      (filter === 'pending' && ['invited', 'onboarding'].includes(s.status)) ||
      (filter === 'overdue' && s.latestQuestionnaire?.due_date &&
        new Date(s.latestQuestionnaire.due_date) < now &&
        s.latestQuestionnaire.status !== 'accepted');

    return matchSearch && matchFilter;
  });

  async function handleInviteSupplier() {
    if (!inviteForm.name || !inviteForm.contact_email) return;
    setSaving(true);

    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        org_id: orgId,
        name: inviteForm.name.trim(),
        country: inviteForm.country || 'UNKNOWN',
        contact_name: inviteForm.contact_name || null,
        contact_email: inviteForm.contact_email.trim(),
        notes: inviteForm.notes || null,
        status: 'invited',
        invite_sent_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (!error && data) {
      // Send invite email via API
      await fetch('/api/suppliers/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_id: data.id }),
      });

      setSuppliers((prev) => [{ ...data as Supplier, latestQuestionnaire: null }, ...prev]);
      setShowInvite(false);
      setInviteForm({ name: '', country: '', contact_name: '', contact_email: '', notes: '' });
    }

    setSaving(false);
  }

  async function handleSendQuestionnaire(supplierId: string) {
    setSendingQ(supplierId);

    const { data } = await supabase
      .from('supplier_questionnaires')
      .insert({
        org_id: orgId,
        supplier_id: supplierId,
        framework_id: frameworkId,
        period: currentPeriod,
        status: 'sent',
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      })
      .select('status, period, due_date')
      .single();

    if (data) {
      setSuppliers((prev) =>
        prev.map((s) =>
          s.id === supplierId
            ? { ...s, latestQuestionnaire: { ...data, supplier_id: supplierId } }
            : s
        )
      );
    }

    setSendingQ(null);
  }

  const FILTERS = [
    { key: 'all', label: `All (${suppliers.length})` },
    { key: 'active', label: `Active (${suppliers.filter((s) => s.status === 'active').length})` },
    { key: 'pending', label: `Pending (${suppliers.filter((s) => ['invited', 'onboarding'].includes(s.status)).length})` },
    { key: 'overdue', label: `Overdue (${suppliers.filter((s) => s.latestQuestionnaire?.due_date && new Date(s.latestQuestionnaire.due_date) < new Date() && s.latestQuestionnaire.status !== 'accepted').length})` },
  ];

  return (
    <>
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'hsl(var(--ink-tertiary))' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers…"
            className="input pl-9"
          />
        </div>
        {canEdit && (
          <button onClick={() => setShowInvite(true)} className="btn btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Invite supplier
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-lg w-fit" style={{ background: 'hsl(var(--surface-sunken))' }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
            style={{
              background: filter === f.key ? 'hsl(var(--surface-raised))' : 'transparent',
              color: filter === f.key ? 'hsl(var(--ink-primary))' : 'hsl(var(--ink-secondary))',
              border: filter === f.key ? '1px solid hsl(var(--border))' : '1px solid transparent',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Suppliers table */}
      <div className="card p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-10 h-10 mb-3" style={{ color: 'hsl(var(--ink-tertiary))' }} />
            <p className="text-sm font-medium" style={{ color: 'hsl(var(--ink-secondary))' }}>
              {search || filter !== 'all' ? 'No suppliers match this filter' : 'No suppliers yet'}
            </p>
            {!search && filter === 'all' && canEdit && (
              <button onClick={() => setShowInvite(true)} className="btn btn-primary btn-sm mt-3">
                Invite your first supplier
              </button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Country</th>
                <th>Status</th>
                <th>Questionnaire ({currentPeriod})</th>
                <th>Last activity</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((supplier) => {
                const statusKey = supplier.status as keyof typeof STATUS_CONFIG;
                const statusCfg = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.invited;
                const StatusIcon = statusCfg.icon;
                const q = supplier.latestQuestionnaire;
                const isOverdue = q?.due_date && new Date(q.due_date) < new Date() && q.status !== 'accepted';

                return (
                  <tr key={supplier.id}>
                    <td>
                      <div className="font-medium" style={{ color: 'hsl(var(--ink-primary))' }}>
                        {supplier.name}
                      </div>
                      {supplier.contact_name && (
                        <div className="text-xs" style={{ color: 'hsl(var(--ink-tertiary))' }}>
                          {supplier.contact_name} · {supplier.contact_email}
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'hsl(var(--ink-secondary))' }}>{supplier.country}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <StatusIcon className="w-3.5 h-3.5" style={{ color: statusCfg.color }} />
                        <span className={clsx('badge', statusCfg.badge)}>{statusCfg.label}</span>
                      </div>
                    </td>
                    <td>
                      {q ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            className={clsx(
                              'badge',
                              q.status === 'accepted' ? 'badge-success' :
                              isOverdue ? 'badge-danger' :
                              'badge-warning'
                            )}
                          >
                            {isOverdue ? 'Overdue' : q.status}
                          </span>
                          {isOverdue && q.due_date && (
                            <span className="text-xs" style={{ color: 'hsl(var(--danger))' }}>
                              due {new Date(q.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                        </div>
                      ) : supplier.status === 'active' ? (
                        <button
                          onClick={() => handleSendQuestionnaire(supplier.id)}
                          disabled={sendingQ === supplier.id}
                          className="btn btn-secondary btn-sm text-xs"
                        >
                          {sendingQ === supplier.id ? 'Sending…' : 'Send questionnaire'}
                        </button>
                      ) : (
                        <span style={{ color: 'hsl(var(--ink-tertiary))' }}>—</span>
                      )}
                    </td>
                    <td style={{ color: 'hsl(var(--ink-tertiary))' }}>
                      {supplier.last_activity_at
                        ? new Date(supplier.last_activity_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                        : supplier.invite_sent_at
                        ? `Invited ${new Date(supplier.invite_sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                        : '—'}
                    </td>
                    <td>
                      {isOverdue && (
                        <button className="btn btn-ghost btn-sm text-xs" style={{ color: 'hsl(var(--danger))' }}>
                          Send reminder
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'hsl(0 0% 0% / 0.5)' }}
          onClick={(e) => e.target === e.currentTarget && setShowInvite(false)}
        >
          <div className="w-full max-w-md" style={{
            background: 'hsl(var(--surface-raised))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '12px',
            padding: '24px',
          }}>
            <h2 className="text-base font-semibold mb-4" style={{ color: 'hsl(var(--ink-primary))' }}>
              Invite supplier
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>
                  Company name *
                </label>
                <input
                  type="text"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                  placeholder="Cairo Steel Works"
                  className="input"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>
                    Contact name
                  </label>
                  <input
                    type="text"
                    value={inviteForm.contact_name}
                    onChange={(e) => setInviteForm({ ...inviteForm, contact_name: e.target.value })}
                    placeholder="Ahmed Hassan"
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>
                    Country
                  </label>
                  <input
                    type="text"
                    value={inviteForm.country}
                    onChange={(e) => setInviteForm({ ...inviteForm, country: e.target.value })}
                    placeholder="EG"
                    className="input"
                    maxLength={4}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>
                  Contact email *
                </label>
                <input
                  type="email"
                  value={inviteForm.contact_email}
                  onChange={(e) => setInviteForm({ ...inviteForm, contact_email: e.target.value })}
                  placeholder="compliance@supplier.com"
                  className="input"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowInvite(false)} className="btn btn-secondary btn-sm">
                Cancel
              </button>
              <button
                onClick={handleInviteSupplier}
                disabled={saving || !inviteForm.name || !inviteForm.contact_email}
                className="btn btn-primary btn-sm"
              >
                {saving ? 'Sending…' : 'Send invite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
