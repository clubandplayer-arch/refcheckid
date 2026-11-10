import datasetJson from '../demo/arch1/dataset.json' with { type: 'json' };
import { createApplicationContainer } from '../src/config/application-container.js';
import type { FederationSyncPayload } from '../src/services/federation-sync-service.js';
import { createRestApiRouter } from '../src/api/router.js';

export const dataset = datasetJson;
export const plan = dataset.workflowPlan;
export function lineup(manager: 'homeManager' | 'awayManager') {
  const items = dataset.photoPlan.filter((item) => item.manager === manager);
  return {
    players: items.filter((item) => item.subjectKind === 'athlete').map((item, index) => ({
      playerRegistrationId: item.registrationId, shirtNumber: index + 1, role: index < 11 ? 'starter' : 'reserve',
    })),
    staff: items.filter((item) => item.subjectKind === 'staff_member').map((item) => ({ staffRegistrationId: item.registrationId, role: 'staff' })),
  };
}
export async function preparedApp(databasePath = ':memory:') {
  const app = createApplicationContainer({ databasePath });
  await app.services.federationSync.syncAll(dataset.federationSyncPayload as FederationSyncPayload);
  return app;
}
export async function login(router: ReturnType<typeof createRestApiRouter>, account: keyof typeof dataset.auth) {
  const response = await router.handle({ method: 'POST', path: '/api/v1/auth/login', headers: {}, query: {}, body: dataset.auth[account] });
  if (response.status !== 200) throw new Error(`Test login failed: ${response.status}`);
  return { authorization: `Bearer ${(response.body as { accessToken: string }).accessToken}` };
}
export async function lockedApp(databasePath = ':memory:') {
  const app = await preparedApp(databasePath);
  for (const [manager, id] of [['homeManager', plan.homeSheetId], ['awayManager', plan.awaySheetId]] as const) {
    await app.services.matchSheets.submitMatchSheet(id, lineup(manager));
    await app.services.matchSheets.lockMatchSheet(id);
  }
  return app;
}
