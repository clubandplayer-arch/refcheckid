import { describe, expect, it } from 'vitest';
import { createRestApiRouter } from '../../src/api/index.js';
import { createApplicationContainer } from '../../src/config/application-container.js';

describe('auth: password login, token session, refresh, and role resolution', () => {
  it('logs in with email and password and resolves the role on the backend', async () => {
    const router = createRestApiRouter(createApplicationContainer());
    const login = await router.handle({
      method: 'POST',
      path: '/api/v1/auth/login',
      headers: {},
      query: {},
      body: { email: 'dirigente@refcheckid.local', password: 'Password123!' },
    });

    expect(login).toMatchObject({ status: 200, body: { user: { role: 'manager' } } });
    const accessToken = (login.body as { accessToken: string }).accessToken;

    await expect(
      router.handle({
        method: 'GET',
        path: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${accessToken}` },
        query: {},
      }),
    ).resolves.toMatchObject({ status: 200, body: { email: 'dirigente@refcheckid.local', role: 'manager' } });
  });

  it('logs in the away pilot manager with the manager role', async () => {
    const router = createRestApiRouter(createApplicationContainer());

    await expect(
      router.handle({
        method: 'POST',
        path: '/api/v1/auth/login',
        headers: {},
        query: {},
        body: { email: 'dirigenteospite@refcheckid.local', password: 'Password123!' },
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: { user: { email: 'dirigenteospite@refcheckid.local', role: 'manager' } },
    });
  });

  it('returns pilot-ready authentication errors', async () => {
    const router = createRestApiRouter(createApplicationContainer());

    await expect(router.handle({ method: 'POST', path: '/api/v1/auth/login', headers: {}, query: {}, body: { email: 'missing@refcheckid.local', password: 'Password123!' } })).resolves.toMatchObject({ status: 401, body: { error: 'USER_NOT_FOUND' } });
    await expect(router.handle({ method: 'POST', path: '/api/v1/auth/login', headers: {}, query: {}, body: { email: 'dirigente@refcheckid.local', password: 'wrong' } })).resolves.toMatchObject({ status: 401, body: { error: 'INVALID_CREDENTIALS' } });
    await expect(router.handle({ method: 'POST', path: '/api/v1/auth/login', headers: {}, query: {}, body: { email: 'disabilitato@refcheckid.local', password: 'Password123!' } })).resolves.toMatchObject({ status: 401, body: { error: 'ACCOUNT_DISABLED' } });
  });
});
