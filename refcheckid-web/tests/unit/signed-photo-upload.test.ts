import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../src/lib/api-client', () => ({ request: mocks.request }));
vi.mock('../../src/lib/photo-feature-flags', () => ({ getPhotoFeatureFlags: () => ({ officialBackendRead: true, officialBackendUpload: true }) }));

import { uploadOfficialSubjectPhoto } from '../../src/lib/manager-photo-backend';

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('sends image bytes to signed storage and only the object reference to Upload Complete', async () => {
  mocks.request.mockImplementation(async (path: string) => {
    if (path === '/photos/upload-intent') return { intent: { uploadId: 'upload', objectKey: 'subjects/id/original.png',
      uploadUrl: { url: 'https://storage.example/signed', method: 'PUT', headers: { 'content-type': 'image/png' } } } };
    return { status: 'pending', signedUrl: {} };
  });
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  await uploadOfficialSubjectPhoto({ subjectKind: 'athlete', subjectId: 'player', registrationId: 'registration',
    clubId: 'club', federationId: 'federation', seasonId: '2026', dataUrl: 'data:image/png;base64,AQID' });
  expect(fetcher).toHaveBeenCalledWith('https://storage.example/signed', expect.objectContaining({ method: 'PUT', body: expect.any(Blob) }));
  const complete = mocks.request.mock.calls.find(([path]) => path === '/photos/uploads/upload/complete');
  expect(JSON.parse(complete![1].body)).toMatchObject({ objectKey: 'subjects/id/original.png' });
  expect(JSON.parse(complete![1].body)).not.toHaveProperty('contentBase64');
});
