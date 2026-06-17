import { NextRequest, NextResponse } from 'next/server';
import { withAuth, badRequest, created, serverError } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = withAuth(async (request: NextRequest, ctx) => {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const docType = (formData.get('type') as string) || 'invoice';
  const supplierId = (formData.get('supplier_id') as string) || null;
  const period = (formData.get('period') as string) || null;

  if (!file) return badRequest('file is required');
  if (file.size > 20 * 1024 * 1024) return badRequest('File too large (max 20MB)');

  const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (!allowedMimes.includes(file.type)) {
    return badRequest(`Unsupported file type: ${file.type}. Use PDF, JPG, or PNG.`);
  }

  try {
    // Use admin client so RLS doesn't block the upload in dev bypass mode
    const admin = createAdminClient();

    const ext = file.name.split('.').pop() ?? 'pdf';
    const storagePath = `${ctx.orgId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const { error: storageError } = await admin.storage
      .from('documents')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (storageError) {
      console.error('Storage upload error:', storageError);
      // If bucket doesn't exist, give a clear error
      if (storageError.message?.includes('Bucket not found') || storageError.message?.includes('bucket')) {
        return NextResponse.json(
          {
            error: {
              code: 'BUCKET_NOT_FOUND',
              message: 'Storage bucket "documents" not found. Run the SQL migration at supabase/migrations/0003_fix_auth_and_storage.sql in your Supabase dashboard.',
            },
          },
          { status: 500 }
        );
      }
      throw new Error(storageError.message);
    }

    // Insert document record
    const { data: doc, error: dbError } = await admin
      .from('documents')
      .insert({
        org_id: ctx.orgId,
        uploaded_by: ctx.userId,
        filename: file.name,
        storage_path: storagePath,
        file_size_bytes: file.size,
        mime_type: file.type,
        type: docType,
        supplier_id: supplierId || null,
        period: period || null,
        ocr_status: 'pending',
      })
      .select('*, supplier:suppliers(id, name)')
      .single();

    if (dbError || !doc) {
      // Clean up the uploaded file if DB insert failed
      await admin.storage.from('documents').remove([storagePath]);
      throw new Error(dbError?.message ?? 'Failed to save document record');
    }

    return created(doc);
  } catch (error) {
    console.error('Document upload failed:', error);
    return serverError(error instanceof Error ? error.message : 'Upload failed');
  }
});
