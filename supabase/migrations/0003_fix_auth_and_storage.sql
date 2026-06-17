-- ============================================================
-- Migration 0003: Fix auth flow + storage bucket
--
-- Fixes:
-- 1. Add INSERT policy on organizations (new users can create their org)
-- 2. Add INSERT + UPDATE policy on users (onboarding can create/update user row)
-- 3. Add handle_new_user trigger (auto-creates users row on auth signup)
-- 4. Create documents storage bucket
-- 5. Add storage policies for documents bucket
-- ============================================================

-- ============================================================
-- 1. organizations: allow authenticated users to INSERT their own org
-- ============================================================
CREATE POLICY "org_insert_authenticated" ON organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- 2. users: allow users to INSERT their own row, and update themselves
-- ============================================================
CREATE POLICY "users_self_insert" ON users FOR INSERT
  WITH CHECK (id = auth.uid());

-- UPDATE already exists as "users_self_update" (id = auth.uid())
-- but we need to also allow admins to update org members
CREATE POLICY "users_admin_update" ON users FOR UPDATE
  USING (org_id = auth.org_id() AND auth.user_role() = 'admin');

-- ============================================================
-- 3. handle_new_user trigger — creates a users row when someone
--    signs up via Supabase Auth. The user can then update it
--    during onboarding to set their org_id.
--
--    NOTE: org_id is NOT NULL in the schema. We use a temp
--    sentinel org or we defer the constraint. The cleanest fix
--    is to make org_id nullable until onboarding completes.
-- ============================================================

-- Make org_id nullable so we can create the users row before onboarding
ALTER TABLE users ALTER COLUMN org_id DROP NOT NULL;

-- Trigger function: insert a stub users row on new auth signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, org_id, role, full_name)
  VALUES (
    NEW.id,
    NULL,  -- org_id set during onboarding
    'admin',
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 4. documents storage bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,  -- private bucket
  20971520,  -- 20MB max
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. Storage RLS policies for documents bucket
-- ============================================================

-- Users can upload to their own org folder: {org_id}/{filename}
CREATE POLICY "documents_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = (
    SELECT org_id::text FROM public.users WHERE id = auth.uid()
  )
);

-- Users can read documents from their own org folder
CREATE POLICY "documents_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = (
    SELECT org_id::text FROM public.users WHERE id = auth.uid()
  )
);

-- Users can delete documents from their own org folder
CREATE POLICY "documents_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = (
    SELECT org_id::text FROM public.users WHERE id = auth.uid()
  )
);
