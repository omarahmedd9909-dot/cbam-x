'use client';

import { useState } from 'react';
import { Plus, Search, Package, CheckCircle, XCircle, HelpCircle, ExternalLink } from 'lucide-react';
import { clsx } from 'clsx';
import { createClient } from '@/lib/supabase/client';
import type { Product, Facility } from '@/types/domain';

interface ProductsClientProps {
  products: (Product & { facility?: Facility | null })[];
  facilities: Facility[];
  orgId: string;
  userRole: string;
}

const CBAM_STATUS = {
  true: { label: 'CBAM covered', icon: CheckCircle, color: 'hsl(var(--success))', badge: 'badge-success' },
  false: { label: 'Not covered', icon: XCircle, color: 'hsl(var(--ink-tertiary))', badge: 'badge-neutral' },
  null: { label: 'Unchecked', icon: HelpCircle, color: 'hsl(var(--warning))', badge: 'badge-warning' },
} as const;

export function ProductsClient({ products: initialProducts, facilities, orgId, userRole }: ProductsClientProps) {
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cnCheckId, setCnCheckId] = useState<string | null>(null);

  // New product form
  const [form, setForm] = useState({
    name: '',
    cn_code: '',
    facility_id: '',
    unit_of_measure: 't',
    annual_production_volume: '',
    description: '',
  });

  const supabase = createClient();
  const canEdit = ['admin', 'analyst'].includes(userRole);

  const filtered = products.filter((p) =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.cn_code.includes(search)
  );

  async function handleAddProduct() {
    if (!form.name || !form.cn_code) return;
    setSaving(true);

    const { data, error } = await supabase
      .from('products')
      .insert({
        org_id: orgId,
        name: form.name.trim(),
        cn_code: form.cn_code.trim(),
        facility_id: form.facility_id || null,
        unit_of_measure: form.unit_of_measure,
        annual_production_volume: form.annual_production_volume
          ? Number(form.annual_production_volume)
          : null,
        description: form.description || null,
      })
      .select('*, facility:facilities(id, name, country)')
      .single();

    if (!error && data) {
      setProducts((prev) => [data as Product & { facility?: Facility | null }, ...prev]);
      setShowAdd(false);
      setForm({ name: '', cn_code: '', facility_id: '', unit_of_measure: 't', annual_production_volume: '', description: '' });

      // Auto-trigger CN code applicability check
      checkApplicability(data.id, data.cn_code);
    }

    setSaving(false);
  }

  async function checkApplicability(productId: string, cnCode: string) {
    setCnCheckId(productId);
    try {
      // Try exact 8-digit match first, fall back to 4-digit heading
      let { data: cnEntry } = await supabase
        .from('cn_code_registry')
        .select('is_cbam_covered, cbam_sector')
        .eq('cn_code', cnCode)
        .maybeSingle();

      if (!cnEntry) {
        const fallback = await supabase
          .from('cn_code_registry')
          .select('is_cbam_covered, cbam_sector')
          .eq('cn_code', cnCode.slice(0, 4))
          .maybeSingle();
        cnEntry = fallback.data;
      }

      const isCovered = cnEntry?.is_cbam_covered ?? false;

      await supabase
        .from('products')
        .update({
          is_cbam_covered: isCovered,
          cbam_sector: cnEntry?.cbam_sector ?? null,
          applicability_checked_at: new Date().toISOString(),
        })
        .eq('id', productId);

      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? { ...p, is_cbam_covered: isCovered, cbam_sector: cnEntry?.cbam_sector ?? null }
            : p
        )
      );
    } finally {
      setCnCheckId(null);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'hsl(var(--ink-tertiary))' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or CN code…"
            className="input pl-9"
          />
        </div>
        {canEdit && (
          <button
            onClick={() => setShowAdd(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add product
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: 'Total products', value: products.length },
          { label: 'CBAM covered', value: products.filter((p) => p.is_cbam_covered).length },
          { label: 'Unchecked', value: products.filter((p) => p.is_cbam_covered === null).length },
        ].map((stat) => (
          <div key={stat.label} className="metric-card">
            <div className="metric-label">{stat.label}</div>
            <div className="metric-value">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Products table */}
      <div className="card p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <Package className="w-10 h-10 mb-3" style={{ color: 'hsl(var(--ink-tertiary))' }} />
            <p className="text-sm font-medium" style={{ color: 'hsl(var(--ink-secondary))' }}>
              {search ? 'No products match your search' : 'No products yet'}
            </p>
            {!search && canEdit && (
              <button onClick={() => setShowAdd(true)} className="btn btn-primary btn-sm mt-3">
                Add your first product
              </button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>CN code</th>
                <th>Facility</th>
                <th>CBAM status</th>
                <th>Unit</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => {
                const key = String(product.is_cbam_covered) as keyof typeof CBAM_STATUS;
                const status = CBAM_STATUS[key] ?? CBAM_STATUS['null'];
                const StatusIcon = status.icon;
                const isChecking = cnCheckId === product.id;

                return (
                  <tr key={product.id}>
                    <td>
                      <div className="font-medium" style={{ color: 'hsl(var(--ink-primary))' }}>
                        {product.name}
                      </div>
                      {product.description && (
                        <div className="text-xs mt-0.5" style={{ color: 'hsl(var(--ink-tertiary))' }}>
                          {product.description}
                        </div>
                      )}
                    </td>
                    <td>
                      <code
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{
                          background: 'hsl(var(--surface-sunken))',
                          color: 'hsl(var(--ink-primary))',
                          fontFamily: 'var(--font-geist-mono)',
                        }}
                      >
                        {product.cn_code}
                      </code>
                    </td>
                    <td style={{ color: 'hsl(var(--ink-secondary))' }}>
                      {product.facility?.name ?? '—'}
                    </td>
                    <td>
                      {isChecking ? (
                        <span className="badge badge-neutral">Checking…</span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <StatusIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: status.color }} />
                          <span className={clsx('badge', status.badge)}>{status.label}</span>
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'hsl(var(--ink-secondary))' }}>
                      {product.unit_of_measure}
                    </td>
                    <td>
                      {canEdit && product.is_cbam_covered === null && !isChecking && (
                        <button
                          onClick={() => checkApplicability(product.id, product.cn_code)}
                          className="btn btn-ghost btn-sm text-xs"
                          style={{ color: 'hsl(var(--accent))' }}
                        >
                          Check CN code
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

      {/* Add product modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'hsl(0 0% 0% / 0.5)' }}
          onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}
        >
          <div className="w-full max-w-md" style={{
            background: 'hsl(var(--surface-raised))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '12px',
            padding: '24px',
          }}>
            <h2 className="text-base font-semibold mb-4" style={{ color: 'hsl(var(--ink-primary))' }}>
              Add product
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>
                  Product name *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Hot-rolled steel coil"
                  className="input"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>
                  CN code * (8 digits)
                </label>
                <input
                  type="text"
                  value={form.cn_code}
                  onChange={(e) => setForm({ ...form, cn_code: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                  placeholder="72081000"
                  className="input font-mono"
                  maxLength={8}
                />
                <p className="text-xs mt-1" style={{ color: 'hsl(var(--ink-tertiary))' }}>
                  We&apos;ll automatically check CBAM coverage after adding.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>
                    Facility
                  </label>
                  <select value={form.facility_id} onChange={(e) => setForm({ ...form, facility_id: e.target.value })} className="input">
                    <option value="">Not specified</option>
                    {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--ink-secondary))' }}>
                    Unit
                  </label>
                  <select value={form.unit_of_measure} onChange={(e) => setForm({ ...form, unit_of_measure: e.target.value })} className="input">
                    <option value="t">Tonne (t)</option>
                    <option value="MWh">MWh</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowAdd(false)} className="btn btn-secondary btn-sm">
                Cancel
              </button>
              <button
                onClick={handleAddProduct}
                disabled={saving || !form.name || form.cn_code.length < 4}
                className="btn btn-primary btn-sm"
              >
                {saving ? 'Adding…' : 'Add product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
