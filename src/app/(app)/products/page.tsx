import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ProductsClient } from './ProductsClient';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Products' };

export default async function ProductsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase
    .from('users')
    .select('org_id, role')
    .eq('id', user.id)
    .single();
  if (!userData) redirect('/login');

  const [productsRes, facilitiesRes] = await Promise.all([
    supabase
      .from('products')
      .select('*, facility:facilities(id, name, country)')
      .eq('org_id', userData.org_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false }),

    supabase
      .from('facilities')
      .select('id, name, country, industry_sector')
      .eq('org_id', userData.org_id)
      .eq('is_active', true),
  ]);

  return (
    <div className="page-container">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'hsl(var(--ink-primary))' }}>
            Products
          </h1>
          <p className="text-sm mt-1" style={{ color: 'hsl(var(--ink-secondary))' }}>
            Define the goods you export to the EU and check CBAM applicability by CN code.
          </p>
        </div>
      </div>
      <ProductsClient
        products={(productsRes.data ?? []) as Parameters<typeof ProductsClient>[0]['products']}
        facilities={(facilitiesRes.data ?? []) as Parameters<typeof ProductsClient>[0]['facilities']}
        orgId={userData.org_id}
        userRole={userData.role}
      />
    </div>
  );
}
