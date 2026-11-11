import type { PhotoApproval } from '../domain/photo/types.js';
export interface PhotoApprovalPageQuery {
  federationIds: readonly string[] | null; status?: string; clubId?: string; sla?: string;
  limit: number; afterRequestedAt?: string; afterId?: string; now: string;
}
export interface PhotoApprovalPageRow extends PhotoApproval {
  clubId: string | null; clubName: string | null; subjectName: string | null;
  currentVersionId: string | null; proposedVersionId: string;
  slaStatus: string;
}
export interface PhotoApprovalPageResult { total: number; items: PhotoApprovalPageRow[] }

/** Scope and filtering happen before the bounded page joins; one database round trip. */
export const photoApprovalPageSql = `
WITH scoped AS MATERIALIZED (
 SELECT a.document
 FROM refcheckid.entities a
 WHERE a.repository='photo_approvals' AND a.document->>'deletedAt' IS NULL
 AND ($1::text[] IS NULL OR a.document->>'federationId'=ANY($1))
 AND ($2::text IS NULL OR a.document->>'status'=$2)
 AND ($3::text IS NULL OR EXISTS (
   SELECT 1 FROM refcheckid.entities r
   WHERE r.repository IN ('player_registrations','staff_registrations')
   AND r.id=a.document->>'registrationId' AND r.document->>'clubId'=$3))
 AND ($4::text IS NULL OR CASE WHEN a.document->>'status'<>'pending' THEN 'closed'
   WHEN a.document->>'slaDueAt' IS NULL THEN 'not_set'
   WHEN a.document->>'slaDueAt'<$5 THEN 'overdue' ELSE 'on_track' END=$4)
), page AS (
 SELECT document FROM scoped
 WHERE ($6::text IS NULL OR (document->>'requestedAt',document->>'id')>($6,$7::text))
 ORDER BY document->>'requestedAt',document->>'id' LIMIT $8
), enriched AS (
 SELECT a.document || jsonb_build_object(
  'clubId',coalesce(pr.document->>'clubId',sr.document->>'clubId'),
  'clubName',c.document->>'name',
  'subjectName',nullif(trim(concat_ws(' ',coalesce(p.document->>'firstName',s.document->>'firstName'),coalesce(p.document->>'lastName',s.document->>'lastName'))),''),
  'currentVersionId',CASE WHEN g.document->>'currentVersionId'=a.document->>'photoVersionId' THEN NULL ELSE g.document->>'currentVersionId' END,
  'proposedVersionId',a.document->>'photoVersionId',
  'slaStatus',CASE WHEN a.document->>'status'<>'pending' THEN 'closed'
    WHEN a.document->>'slaDueAt' IS NULL THEN 'not_set'
    WHEN a.document->>'slaDueAt'<$5 THEN 'overdue' ELSE 'on_track' END
 ) AS document
 FROM page a
 LEFT JOIN refcheckid.entities pr ON pr.repository='player_registrations' AND pr.id=a.document->>'registrationId'
 LEFT JOIN refcheckid.entities sr ON sr.repository='staff_registrations' AND sr.id=a.document->>'registrationId'
 LEFT JOIN refcheckid.entities c ON c.repository='clubs' AND c.id=coalesce(pr.document->>'clubId',sr.document->>'clubId')
 LEFT JOIN refcheckid.entities p ON p.repository='players' AND p.id=pr.document->>'playerId'
 LEFT JOIN refcheckid.entities s ON s.repository='staff_members' AND s.id=sr.document->>'staffMemberId'
 LEFT JOIN refcheckid.entities v ON v.repository='photo_versions' AND v.id=a.document->>'photoVersionId'
 LEFT JOIN refcheckid.entities g ON g.repository='global_official_photos' AND g.id=v.document->>'globalOfficialPhotoId'
)
SELECT (SELECT count(*) FROM scoped)::int AS total,
 coalesce((SELECT jsonb_agg(document ORDER BY document->>'requestedAt',document->>'id') FROM enriched),'[]'::jsonb) AS items`;
