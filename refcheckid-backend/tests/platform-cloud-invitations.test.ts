import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { preparedApp, dataset } from './runtime-fixtures.js';
import { Organizations } from '../src/platform/organizations.js';
import { activateInvitation } from '../src/platform/invitations.js';
import { PlatformStore } from '../src/platform/store.js';
import type { Invitation } from '../src/platform/types.js';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it.each([true, false])(
  'provisions invitation identities with explicit email confirmation policy (email=%s)',
  async (withEmail) => {
    const app = await preparedApp(),
      actorId = randomUUID(),
      service = new Organizations(app, {
        actorId,
        roles: ['federation'],
        federationIds: [dataset.federationSyncPayload.federations[0].id],
      });
    try {
      const org = await app.store.transaction(() =>
        service.create({
          name: 'Provider invite test',
          kind: 'sports',
          federationId: dataset.federationSyncPayload.federations[0].id,
        }),
      );
      const invitation = await app.store.transaction(() =>
        service.createInvitation({
          organizationId: org.id,
          unitId: org.rootUnitId,
          role: 'viewer',
          displayName: 'Test operator',
          ...(withEmail ? { email: 'operator@example.invalid' } : {}),
        }),
      );
      vi.stubEnv('REFCHECKID_RUNTIME', 'supabase');
      vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('SUPABASE_SERVER_KEY', 'sb_secret_fake');
      const providerId = randomUUID();
      const fetcher = vi.fn().mockImplementation((url: string, init: RequestInit) => {
        expect(new URL(url).hostname).toBe('example.supabase.co');
        if (url.endsWith('/admin/users')) {
          const body = JSON.parse(String(init.body)) as {
            email: string;
            email_confirm: boolean;
            password: string;
          };
          expect(body.email_confirm).toBe(!withEmail);
          expect(body.password).toBe('Provider-test-password-2026!');
          expect(body.email).toBe(
            withEmail
              ? 'operator@example.invalid'
              : `${invitation.code.toLowerCase()}@login.refcheckid.invalid`,
          );
          return Promise.resolve(Response.json({ id: providerId }));
        }
        if (url.endsWith('/resend')) return Promise.resolve(Response.json({ ok: true }));
        throw new Error('Unexpected provider request');
      });
      vi.stubGlobal('fetch', fetcher);
      const result = await activateInvitation(app, {
        token: invitation.token,
        password: 'Provider-test-password-2026!',
      });
      expect(result.verificationRequired).toBe(withEmail);
      expect(result.verificationSent).toBe(withEmail);
      expect(fetcher).toHaveBeenCalledTimes(withEmail ? 2 : 1);
      const profile = await app.store.get<{
        federationIds: string[];
        requiresBoundSessions: boolean;
        password?: string;
      }>('auth_profiles', providerId);
      expect(profile?.federationIds).toEqual([]);
      expect(profile?.requiresBoundSessions).toBe(true);
      expect(profile?.password).toBeUndefined();
      expect(
        await new PlatformStore(app.store).get<Invitation>('invitations', invitation.id),
      ).toHaveProperty('status', 'accepted');
    } finally {
      await app.store.close();
    }
  },
);
