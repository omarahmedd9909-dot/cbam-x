import { NextRequest, NextResponse } from 'next/server';
import { withAuth, notFound, forbidden, ok } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const DELETE = withAuth(async (request: NextRequest, ctx, params) => {
  const docId = params?.id;
  if (!docId) return notFound('Document');

  // Verify document belongs to this org
  const { data: doc } = await ctx.supabase
    .from('documents')
    .select('id, storage_path, org_id')
    .eq('id', docId)
    .single();

  if (!doc) return notFound('Document');
  if (doc.org_id !== ctx.orgId) return forbidden('Not your document');

  try {
    const admin = createAdminClient();

    // Delete from storage
    const { error: storageError } = await admin.storage
      .from('documents')
      .remove([doc.storage_path]);

    if (storageError) {
      console.error('Storage delete error (continuing):', storageError.message);
      // Continue even if storage delete fails — still remove the DB record
    }

    // Delete DB record
    const { error: dbError } = await admin
      .from('documents')
      .delete()
      .eq('id', docId);

    if (dbError) throw new Error(dbError.message);

    return ok({ deleted: true });
  } catch (error) {
    console.error('Document delete failed:', error);
    return NextResponse.json(
      { error: { code: 'DELETE_FAILED', message: error instanceof Error ? error.message : 'Delete failed' } },
      { status: 500 }
    );
  }
});
