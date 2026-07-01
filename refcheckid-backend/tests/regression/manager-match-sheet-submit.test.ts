import { describe, expect, it } from 'vitest';
import { createRestApiRouter } from '../../src/api/index.js';
import { createApplicationContainer } from '../../src/config/application-container.js';
import { pilotIds } from '../../src/config/pilot-data.js';
import { authHeaders } from '../test-fixtures.js';

describe('regression: manager match sheet smoke submission', () => {
  it('submits the same pilot match sheet exposed by the wizard and persists it', async () => {
    const container = createApplicationContainer();
    const router = createRestApiRouter(container);

    const beforeSubmit = await router.handle({
      headers: authHeaders,
      method: 'GET',
      path: '/api/v1/match-sheets',
      query: {},
    });
    expect(beforeSubmit).toMatchObject({
      status: 200,
    });
    expect(beforeSubmit.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: pilotIds.homeSheet, status: 'draft' })]),
    );

    const submitResponse = await router.handle({
      headers: authHeaders,
      method: 'POST',
      path: `/api/v1/match-sheets/${pilotIds.homeSheet}/submit`,
      query: {},
    });
    expect(submitResponse).toMatchObject({
      status: 200,
      body: { id: pilotIds.homeSheet, status: 'submitted' },
    });

    await expect(
      container.repositories.matchSheets.findById(pilotIds.homeSheet),
    ).resolves.toMatchObject({
      id: pilotIds.homeSheet,
      status: 'submitted',
    });
  });
});
