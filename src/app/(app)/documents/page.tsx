import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DocumentsClient } from './DocumentsClient';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Documents' };

export default async function DocumentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('org_id, role').eq('id', user.id).single();
  if (!userData) redirect('/login');

  const { data: documents } = await supabase
    .from('documents')
    .select('*, supplier:suppliers(id, name)')
    .eq('org_id', userData.org_id)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id, name')
    .eq('org_id', userData.org_id)
    .eq('status', 'active');

  return (
    <div className="page-container">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold" style={{ color: 'hsl(var(--ink-primary))' }}>Documents</h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(var(--ink-secondary))' }}>
          Upload invoices, supplier declarations, and production reports. AI extracts compliance data automatically.
        </p>
      </div>
      <DocumentsClient
        documents={(documents ?? []) as Parameters<typeof DocumentsClient>[0]['documents']}
        suppliers={(suppliers ?? []) as Parameters<typeof DocumentsClient>[0]['suppliers']}
        orgId={userData.org_id}
        userId={user.id}
        userRole={userData.role}
      />
    </div>
  );
}
