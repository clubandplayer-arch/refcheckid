INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('photos', 'photos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
    ('identity-documents', 'identity-documents', false, 10485760, ARRAY['image/jpeg', 'image/png', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY storage_photos_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'photos' AND auth.uid() IS NOT NULL);

CREATE POLICY storage_photos_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'photos' AND auth.uid() IS NOT NULL);

CREATE POLICY storage_photos_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'photos' AND app_security.is_platform_admin())
WITH CHECK (bucket_id = 'photos' AND app_security.is_platform_admin());

CREATE POLICY storage_photos_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'photos' AND app_security.is_platform_admin());

CREATE POLICY storage_identity_documents_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'identity-documents' AND (app_security.is_platform_admin() OR app_security.is_federation_admin()));

CREATE POLICY storage_identity_documents_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'identity-documents' AND (app_security.is_platform_admin() OR app_security.is_federation_admin()));

CREATE POLICY storage_identity_documents_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'identity-documents' AND app_security.is_platform_admin())
WITH CHECK (bucket_id = 'identity-documents' AND app_security.is_platform_admin());

CREATE POLICY storage_identity_documents_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'identity-documents' AND app_security.is_platform_admin());
