import { createHmac, timingSafeEqual } from 'node:crypto';

function signature(id: string, rendition: string, expires: string): string {
  return createHmac('sha256', process.env.AUTH_SECRET ?? 'refcheckid-dev-secret')
    .update(`photo-content:${id}:${rendition}:${expires}`).digest('base64url');
}

export function signedPhotoContentUrl(id: string, rendition: 'normalized' | 'thumb_320' = 'normalized'): string {
  const expires = String(Math.floor(Date.now() / 1000) + 900);
  return `/api/v1/photos/versions/${id}/content?rendition=${rendition}&expires=${expires}&signature=${signature(id, rendition, expires)}`;
}

export function validPhotoContentToken(id: string, query: Record<string, string | undefined>): boolean {
  const { expires, signature: token, rendition } = query;
  const now = Math.floor(Date.now() / 1000);
  if (!expires || !token || !rendition || !/^\d+$/.test(expires) || Number(expires) <= now || Number(expires) > now + 900) return false;
  const expected = Buffer.from(signature(id, rendition, expires));
  const supplied = Buffer.from(token);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
