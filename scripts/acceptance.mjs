import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

// All mutations are confined to this run's private temporary storage and owned processes.
const root = resolve(import.meta.dirname, '..');
const backendRoot = join(root, 'refcheckid-backend');
const directory = await mkdtemp(join(tmpdir(), 'refcheckid-acceptance-'));
const dataset = JSON.parse(await readFile(join(backendRoot, 'demo/arch1/dataset.json'), 'utf8'));
const plan = dataset.workflowPlan;
const backendPort = await freePort(Number(process.env.REFCHECKID_ACCEPTANCE_BACKEND_PORT ?? 0));
const webPort = await freePort();
const origin = `http://127.0.0.1:${backendPort}`;
const webOrigin = `http://127.0.0.1:${webPort}`;
const env = { ...process.env, NODE_ENV: 'development', PORT: String(backendPort), HOST: '127.0.0.1',
  AUTH_SECRET: randomBytes(32).toString('hex'), REFCHECKID_DATABASE_PATH: join(directory, 'state.sqlite'),
  REFCHECKID_PHOTO_METADATA_ROOT: join(directory, 'metadata'), REFCHECKID_PHOTO_STORAGE_ROOT: join(directory, 'photos'),
  NEXT_TELEMETRY_DISABLED: '1', BACKEND_ORIGIN: origin,
};
delete env.AUTH_USERS_FILE;
delete env.NEXT_PUBLIC_API_BASE_URL;
await mkdir(env.REFCHECKID_PHOTO_METADATA_ROOT);
const originalPhotoState = await fingerprints(join(backendRoot, 'storage/refcheckid-photos-dev'));
const originalMetadataState = await fingerprints(join(backendRoot, 'storage/refcheckid-photo-metadata-dev'));
let backend;
let web;
let browser;
const checks = [];
function check(message) { checks.push(message); console.log(`PASS: ${message}`); }
try {
  backend = startBackend();
  await waitFor(`${origin}/api/health`, backend);
  await run(process.execPath, ['dist/scripts/demo-bootstrap.js', '--api-base-url', `${origin}/api/v1`], backendRoot);
  await run(process.execPath, ['dist/scripts/demo-verify.js', '--api-base-url', `${origin}/api/v1`], backendRoot);
  check('Clean HTTP workflow: sync, 44 uploads/approvals, two locks, 44 decisions, completed match, draft report');
  const home = await login('homeManager');
  const referee = await login('referee');
  const federation = await login('federation');
  const initialSnapshots = await api(`/match-sheets/${plan.homeSheetId}/photo-snapshots`, referee);
  assert.equal(initialSnapshots.length, 22);
  const initialManifest = await api(`/matches/${plan.matchId}/photo-manifest`, referee);
  assert.equal(initialManifest.subjects.length, 44);
  const versionIds = new Set(initialManifest.subjects.map((subject) => new URL(subject.photoUrl, origin).pathname));
  assert.equal(versionIds.size, 44);
  for (const subject of initialManifest.subjects) {
    const response = await fetch(new URL(subject.photoUrl, origin));
    assert.equal(response.status, 200);
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
  const unsigned = new URL(initialManifest.subjects[0].photoUrl, origin);
  unsigned.searchParams.delete('signature');
  assert.equal((await fetch(unsigned)).status, 401);
  check('44 real photo contents reachable; unsigned reads denied');
  const photoFingerprints = await fingerprints(env.REFCHECKID_PHOTO_STORAGE_ROOT);
  await stop(backend, 'SIGKILL');
  backend = startBackend();
  await waitFor(`${origin}/api/health`, backend);
  assert.equal((await api(`/matches/${plan.matchId}/readiness`, home)).initialized, true);
  assert.deepEqual((await api(`/match-sheets/${plan.homeSheetId}/photo-snapshots`, referee)).map((row) => row.id), initialSnapshots.map((row) => row.id));
  assert.equal((await api(`/recognitions?matchId=${plan.matchId}`, referee)).length, 44);
  await run(process.execPath, ['scripts/demo-init.mjs', '--api-base-url', `${origin}/api/v1`], root);
  assert.deepEqual(await fingerprints(env.REFCHECKID_PHOTO_STORAGE_ROOT), photoFingerprints);
  check('Hard process restart and repeated demo:init preserve match, decisions, snapshot IDs and every photo byte');
  await api(`/match-sheets/${plan.homeSheetId}/reset-smoke`, home, {});
  assert.equal(await api(`/match-reports?matchId=${plan.matchId}`, referee), null);
  assert.equal((await api(`/recognitions?matchId=${plan.matchId}`, referee)).length, 0);
  assert.equal((await api(`/match-sheets/${plan.homeSheetId}/photo-snapshots`, referee)).length, 0);
  assert.deepEqual(await fingerprints(env.REFCHECKID_PHOTO_STORAGE_ROOT), photoFingerprints);
  await api(`/match-sheets/${plan.homeSheetId}/submit`, home, lineup('homeManager'));
  await api(`/match-sheets/${plan.homeSheetId}/lock`, referee, {});
  await run(process.execPath, ['scripts/demo-init.mjs', '--api-base-url', `${origin}/api/v1`], root);
  assert.equal((await api(`/matches/${plan.matchId}/readiness`, home)).initialized, true);
  assert.deepEqual(await fingerprints(env.REFCHECKID_PHOTO_STORAGE_ROOT), photoFingerprints);
  check('Interrupted bootstrap with only home locked resumes without replacing photo files');
  await api(`/match-sheets/${plan.homeSheetId}/reset-smoke`, home, {});
  for (const [manager, sheet] of [['homeManager', plan.homeSheetId], ['awayManager', plan.awaySheetId]]) {
    const token = await login(manager);
    await api(`/match-sheets/${sheet}/submit`, token, lineup(manager));
    await api(`/match-sheets/${sheet}/lock`, referee, {});
  }
  await api('/recognitions/start', referee, { matchId: plan.matchId });
  const incomplete = await fetch(`${origin}/api/v1/recognitions/complete`, { method: 'POST', headers: headers(referee), body: JSON.stringify({ matchId: plan.matchId }) });
  assert.equal(incomplete.status, 409);
  check('Reset removes only race state; re-lock succeeds and premature recognition completion fails');
  // Replace one official photo after locking and verify the frozen version remains served.
  const participant = dataset.photoPlan[0];
  const oldPhoto = await api(`/registrations/${participant.registrationId}/season-photo`, home);
  const oldBytes = Buffer.from(await (await fetch(new URL(oldPhoto.signedUrl.url, origin))).arrayBuffer());
  const uploaded = await api('/photos/upload-intent', home, {
    subjectKind: participant.subjectKind, subjectId: participant.subjectId, registrationId: participant.registrationId,
    federationId: dataset.federationSyncPayload.federations[0].id, seasonId: dataset.seasonId,
    mimeType: 'image/png', fileSizeBytes: oldBytes.length, sha256: createHash('sha256').update(oldBytes).digest('hex'),
  });
  const replacement = await api(`/photos/uploads/${uploaded.intent.uploadId}/complete`, home, { objectKey: uploaded.intent.objectKey, contentBase64: oldBytes.toString('base64') });
  const pending = await api(`/photo-approvals?federationId=${dataset.federationSyncPayload.federations[0].id}&status=pending`, federation);
  await api(`/photo-approvals/${pending.find((row) => row.photoVersionId === replacement.id).id}/approve`, federation, { reasonCode: 'identity_verified' });
  const frozen = await api(`/matches/${plan.matchId}/photo-manifest`, referee);
  const pinned = frozen.subjects.find((row) => row.id === participant.registrationId);
  assert.ok(new URL(pinned.photoUrl, origin).pathname.includes(oldPhoto.version.id));
  assert.equal((await fetch(new URL(pinned.photoUrl, origin))).status, 200);
  assert.equal((await api(`/matches/${plan.matchId}/photo-manifest`, federation)).subjects.length, 44);
  check('Official photo replacement leaves frozen historical photo readable');
  const productionWeb = process.env.REFCHECKID_ACCEPTANCE_WEB_MODE === 'production';
  web = start(process.execPath, ['node_modules/next/dist/bin/next', productionWeb ? 'start' : 'dev', '--hostname', '127.0.0.1', '--port', String(webPort)], join(root, 'refcheckid-web'), 'web.log', productionWeb ? { ...env, NODE_ENV: 'production' } : env);
  await waitFor(webOrigin, web);
  browser = await chromium.launch({ ...(existsSync(process.env.CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium') ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium' } : {}), headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) console.log(`Browser route: ${new URL(frame.url()).pathname}`); });
  page.on('requestfailed', (request) => console.log(`Browser request failed: ${new URL(request.url()).pathname}: ${request.failure()?.errorText}`));
  await page.goto(webOrigin);
  await page.getByLabel('Email o codice personale', { exact: true }).fill(dataset.auth.referee.email);
  await page.getByLabel('Password', { exact: true }).fill(dataset.auth.referee.password);
  await page.getByRole('button', { name: 'ACCEDI', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/referee', { waitUntil: 'commit' });
  await page.goto(`${webOrigin}/referee/match`);
  await page.getByRole('button', { name: /Inizia riconoscimento/ }).click();
  await page.getByRole('button', { name: 'Conferma riconoscimento', exact: true }).waitFor();
  await page.locator('img[alt^="Foto "]').first().waitFor();
  await page.waitForFunction(() => { const image = document.querySelector('img[alt^="Foto "]'); return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0; });
  const [saved] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/recognitions/decision') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Conferma riconoscimento', exact: true }).click(),
  ]);
  assert.equal(saved.status(), 200);
  assert.equal((await api(`/recognitions?matchId=${plan.matchId}`, referee)).length, 1);
  await page.reload();
  await page.getByRole('button', { name: /Inizia riconoscimento/ }).click();
  await page.getByRole('button', { name: 'Conferma riconoscimento', exact: true }).waitFor();
  await page.screenshot({ path: join(directory, 'recognition-resumed.png'), fullPage: true });
  assert.equal((await api(`/recognitions?matchId=${plan.matchId}`, referee)).length, 1);
  assert.deepEqual(browserErrors, []);
  check('Real Chromium: login, role routing, photo manifest, decision write and page reload');
  for (const person of dataset.photoPlan) await api('/recognitions/decision', referee, { matchId: plan.matchId, registrationId: person.registrationId, status: 'recognized', notes: 'Acceptance fixture' });
  await api('/recognitions/complete', referee, { matchId: plan.matchId });
  const summary = JSON.stringify({ matchId: plan.matchId, result: { homeGoals: 0, awayGoals: 0 }, goals: [], cautions: [], expulsions: [], substitutions: [], refereeNotes: 'Acceptance fixture' });
  await api(`/matches/${plan.matchId}/report-draft`, referee, { summary });
  await page.reload();
  await page.getByRole('button', { name: 'Salva bozza', exact: true }).waitFor();
  assert.equal((await api(`/match-reports?matchId=${plan.matchId}`, referee)).summary, summary);
  await api(`/matches/${plan.matchId}/final-report`, referee, { summary });
  assert.equal((await api(`/match-reports?matchId=${plan.matchId}`, federation)).status, 'submitted');
  await page.reload();
  await page.getByRole('button', { name: 'Salva bozza', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Salva bozza', exact: true }).isDisabled(), true);
  check('Saved report draft survives reload; final submission is visible to federation and read-only in UI');
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await page.getByLabel('Email o codice personale', { exact: true }).fill(dataset.auth.homeManager.email);
  await page.getByLabel('Password', { exact: true }).fill(dataset.auth.homeManager.password);
  await page.getByRole('button', { name: 'ACCEDI', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/manager', { waitUntil: 'commit' });
  await page.goto(`${webOrigin}/manager/match-sheet`);
  if (productionWeb) {
    assert.equal(await page.getByRole('button', { name: 'Ripristina partita demo', exact: true }).count(), 0);
    await api(`/match-sheets/${plan.homeSheetId}/reset-smoke`, home, {});
    await page.reload();
  } else {
    const [reset] = await Promise.all([
      page.waitForResponse((response) => response.url().includes('/reset-smoke') && response.request().method() === 'POST'),
      page.getByRole('button', { name: 'Ripristina partita demo', exact: true }).click(),
    ]);
    assert.equal(reset.status(), 200);
  }
  await page.getByRole('button', { name: 'Salva distinta in bozza', exact: true }).waitFor();
  await page.locator('input[type="checkbox"]').first().check();
  const [draftWrite] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/draft') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Salva distinta in bozza', exact: true }).click(),
  ]);
  assert.equal(draftWrite.status(), 200);
  await page.reload();
  await page.getByRole('button', { name: 'Salva distinta in bozza', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('input[type="checkbox"]:checked').length === 1);
  await page.screenshot({ path: join(directory, 'manager-draft-resumed.png'), fullPage: true });
  check('Real Chromium: logout, role switch, demo reset and saved lineup draft restored after reload');
  // Synthetic approval queue exercise; all data belongs to this temporary run.
  const intentForReview = await api('/photos/upload-intent', home, {
    subjectKind: participant.subjectKind, subjectId: participant.subjectId, registrationId: participant.registrationId,
    federationId: dataset.federationSyncPayload.federations[0].id, seasonId: dataset.seasonId,
    replacementReason: 'Crescita fisica rilevante che richiede un nuovo confronto del volto per il riconoscimento.',
    mimeType: 'image/png', fileSizeBytes: oldBytes.length, sha256: createHash('sha256').update(oldBytes).digest('hex'),
  });
  await api(`/photos/uploads/${intentForReview.intent.uploadId}/complete`, home, {
    objectKey: intentForReview.intent.objectKey, contentBase64: oldBytes.toString('base64'),
  });
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await page.getByLabel('Email o codice personale', { exact: true }).fill(dataset.auth.federation.email);
  await page.getByLabel('Password', { exact: true }).fill(dataset.auth.federation.password);
  await page.getByRole('button', { name: 'ACCEDI', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/federation', { waitUntil: 'commit' });
  let photoPageLoads = 0;
  const countPhotoPages = (request) => { if (request.method() === 'GET' && request.url().includes('/photo-approvals/page')) photoPageLoads++; };
  page.on('request', countPhotoPages);
  await page.getByRole('button', { name: 'Foto', exact: true }).click();
  await page.getByRole('button', { name: 'Approva', exact: true }).first().waitFor();
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll('img')];
    return images.length >= 2 && images.every((image) => image.complete && image.naturalWidth > 0 && image.naturalWidth <= 320);
  });
  await page.getByText('Richiesta di cambio foto aggiuntivo nell’anno', { exact: true }).waitFor();
  const pagesBeforeDecision = photoPageLoads;
  const [decision] = await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/approve')),
    page.getByRole('button', { name: 'Approva', exact: true }).first().click(),
  ]);
  assert.equal(decision.status(), 200);
  await page.getByText('Foto approvata: la nuova immagine è subito disponibile al Club.', { exact: true }).waitFor();
  assert.equal(photoPageLoads, pagesBeforeDecision);
  await page.screenshot({ path: join(directory, 'photo-approval-no-reload.png'), fullPage: true });
  page.off('request', countPhotoPages);
  check('Real Chromium: bounded photo queue, decoded small previews, approval confirmation without list reload');
  await page.getByRole('button', {name:'Gestione ente',exact:true}).click();
  const form=(title)=>page.locator('form').filter({has:page.getByRole('heading',{name:title,exact:true})});
  const configuration=form('Configura un ente');
  await configuration.locator('[name=name]').fill('Lega browser test');
  await configuration.locator('[name=kind]').selectOption('sports');
  await configuration.locator('[name=federationId]').selectOption(dataset.federationSyncPayload.federations[0].id);
  await configuration.getByRole('button',{name:'Crea ente',exact:true}).click();
  await page.getByRole('button',{name:'Campionati',exact:true}).waitFor();
  const platformContext=await api('/platform/context',federation);
  const sportsOrg=platformContext.organizations.find(org=>org.kind==='sports');
  const provinceForm=form('Aggiungi comitato, delegazione o sezione');
  await provinceForm.locator('[name=name]').fill('Delegazione Siracusa test');
  await provinceForm.locator('[name=kind]').selectOption('provincial');
  await provinceForm.locator('[name=territory]').fill('Siracusa');
  await provinceForm.getByRole('button',{name:'Salva',exact:true}).click();
  await page.getByLabel('Struttura',{exact:true}).locator('option').filter({hasText:'Delegazione Siracusa test'}).waitFor({state:'attached'});
  const province=(await api(`/platform/units?organizationId=${sportsOrg.id}`,federation)).find(unit=>unit.kind==='provincial');
  await page.getByLabel('Struttura',{exact:true}).selectOption(province.id);
  await page.getByRole('button',{name:'Campionati',exact:true}).click();
  const competitionForm=form('Crea campionato e girone');
  await competitionForm.locator('[name=name]').fill('Under 19 provinciale test');
  await competitionForm.locator('[name=sport]').selectOption('football');
  await competitionForm.locator('[name=category]').fill('Under 19');
  await competitionForm.locator('[name=group]').fill('A');
  const [competitionResponse]=await Promise.all([page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/v1/platform/competitions'),competitionForm.getByRole('button',{name:'Salva',exact:true}).click()]);
  assert.equal(competitionResponse.status(),201);const competition=await competitionResponse.json();
  await page.getByRole('button',{name:'Importazioni',exact:true}).click();
  await page.getByLabel('Seleziona file',{exact:true}).setInputFiles({name:'societa-browser.csv',mimeType:'text/csv',buffer:Buffer.from('code;name\nBROWSER;Società importata dal browser')});
  await page.getByRole('button',{name:'Carica e prepara anteprima',exact:true}).click();
  await page.getByRole('button',{name:/Conferma importazione/}).waitFor();
  await page.getByRole('button',{name:/Conferma importazione/}).click();
  await page.getByRole('status').filter({hasText:/Completata.*Applicate: 1/}).waitFor();
  await page.screenshot({path:join(directory,'platform-import-completed.png'),fullPage:true});
  const arbitration=await api('/platform/organizations',federation,{name:'Organizzazione arbitrale browser test',kind:'refereeing'});
  const section=await api('/platform/units',federation,{organizationId:arbitration.id,parentId:arbitration.rootUnitId,name:'Sezione Siracusa test',kind:'section'});
  await api('/platform/delegations',federation,{competitionId:competition.id,recipientOrganizationId:arbitration.id,recipientUnitId:section.id,designate:true,expiresAt:'2099-01-01T00:00:00Z'});
  await page.reload();
  await page.getByLabel('Ente',{exact:true}).selectOption(arbitration.id);
  await page.getByLabel('Struttura',{exact:true}).locator(`option[value="${section.id}"]`).waitFor({state:'attached'});
  await page.getByLabel('Struttura',{exact:true}).selectOption(section.id);
  await page.getByRole('button',{name:'Arbitri',exact:true}).click();
  const officialForm=form('Censisci arbitro / ufficiale');
  await officialForm.locator('[name=code]').fill('BROWSER-REF');await officialForm.locator('[name=firstName]').fill('Mario');await officialForm.locator('[name=lastName]').fill('Prova');await officialForm.locator('[name=sports]').selectOption('football');
  const [officialResponse]=await Promise.all([page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/v1/platform/officials'),officialForm.getByRole('button',{name:'Salva',exact:true}).click()]);
  assert.equal(officialResponse.status(),201);const official=await officialResponse.json();
  await page.getByRole('button',{name:'Operatori e inviti',exact:true}).click();
  const invitationForm=form('Invita un operatore o un arbitro');await invitationForm.locator('[name=displayName]').fill('Mario Prova');await invitationForm.locator('[name=role]').selectOption('referee');
  await invitationForm.locator(`[name=officialId] option[value="${official.id}"]`).waitFor({state:'attached'});await invitationForm.locator('[name=officialId]').selectOption(official.id);
  await invitationForm.getByRole('button',{name:'Genera invito personale',exact:true}).click();
  const activationLink=page.locator('a[href^="/activate#"]');await activationLink.waitFor();const activationPath=await activationLink.getAttribute('href');
  const invitations=await api(`/platform/entities/invitations?organizationId=${arbitration.id}&unitId=${section.id}`,federation);const invitation=invitations.items.find(item=>item.officialId===official.id);
  const refereeContext=await browser.newContext({viewport:{width:1280,height:900}}),refereePage=await refereeContext.newPage();refereePage.on('pageerror',error=>browserErrors.push(error.message));
  await refereePage.goto(webOrigin+activationPath);await refereePage.getByLabel('Password',{exact:true}).fill('Browser-test-password-2026!');await refereePage.getByLabel('Ripeti password',{exact:true}).fill('Browser-test-password-2026!');await refereePage.getByRole('button',{name:'Attiva account',exact:true}).click();await refereePage.getByRole('link',{name:'Vai all’accesso',exact:true}).click();
  await refereePage.getByLabel('Email o codice personale',{exact:true}).fill(invitation.code);await refereePage.getByLabel('Password',{exact:true}).fill('Browser-test-password-2026!');await refereePage.getByRole('button',{name:'ACCEDI',exact:true}).click();await refereePage.waitForURL(url=>url.pathname==='/referee');
  const scope={organizationId:sportsOrg.id,unitId:province.id},teams=[];
  for(const [index,club]of dataset.federationSyncPayload.clubs.slice(0,2).entries()){
    await api('/platform/clubs',federation,{...scope,code:`LEGACY-${index}`,name:club.name,existingClubId:club.id});
    const team=await api('/platform/teams',federation,{...scope,code:`TEAM-${index}`,name:club.name,clubId:club.id,sport:'football',season:'2026/2027',category:'Under 19'});teams.push(team);await api('/platform/entries',federation,{competitionId:competition.id,teamId:team.id});
  }
  const fixture=await api('/platform/fixtures',federation,{competitionId:competition.id,code:'BROWSER-GAME',homeTeamId:teams[0].id,awayTeamId:teams[1].id,round:'1',scheduledAt:'2026-12-12T15:00:00+01:00',venue:'Campo browser test'});
  await api('/platform/appointments',federation,{fixtureId:fixture.id,officialId:official.id,role:'principal',send:true});
  await refereePage.reload();await refereePage.getByRole('button',{name:'Accetta gara',exact:true}).click();await refereePage.getByText('Accettata',{exact:false}).waitFor();await refereePage.screenshot({path:join(directory,'platform-referee-appointment.png'),fullPage:true});
  await page.getByRole('button',{name:'Designazioni',exact:true}).click();await page.screenshot({path:join(directory,'platform-delegated-designations.png'),fullPage:true});
  await refereeContext.close();assert.deepEqual(browserErrors,[]);
  check('Real Chromium: territorial competition, guided CSV import, referee activation/login by code and accepted delegated appointment');
  assert.deepEqual(await fingerprints(join(backendRoot, 'storage/refcheckid-photos-dev')), originalPhotoState);
  assert.deepEqual(await fingerprints(join(backendRoot, 'storage/refcheckid-photo-metadata-dev')), originalMetadataState);
  check('Existing workspace photos and JSON metadata unchanged');
  await run(process.execPath, ['scripts/backup-runtime.mjs', join(directory, 'backup')], backendRoot);
  await run(process.execPath, ['scripts/verify-backup.mjs', join(directory, 'backup')], backendRoot);
  check('Live database backup, photo copy and checksum verification');
  console.log(JSON.stringify({ status: 'passed', checks, artifacts: directory }, null, 2));
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    await page.screenshot({ path: join(directory, 'failure.png'), fullPage: true });
    console.log(`Browser failure at ${new URL(page.url()).pathname}: ${(await page.locator('body').innerText()).slice(0, 2000)}`);
    console.log('Session metadata', await page.evaluate(() => { const text = localStorage.getItem('refcheckid.session'); const session = text ? JSON.parse(text) : null; return session ? { role: session.user?.role, keys: Object.keys(session), userKeys: Object.keys(session.user ?? {}) } : { present: false }; }));
  }
  throw error;
} finally {
  await Promise.allSettled([browser?.close(), stop(web), stop(backend)]);
  console.log(`Acceptance artifacts retained at ${directory}`);
}

function startBackend() { return start(process.execPath, ['dist/src/server.js'], backendRoot, 'backend.log'); }
function start(command, args, cwd, log, environment = env) {
  const fd = openSync(join(directory, log), 'a', 0o600);
  const child = spawn(command, args, { cwd, env: environment, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  return child;
}
async function run(command, args, cwd) {
  const child = start(command, args, cwd, 'workflow.log');
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, `${command} ${args.join(' ')} failed; inspect ${directory}/workflow.log`);
}
async function stop(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill(signal);
  await exited;
}
async function waitFor(url, child) {
  for (let attempt = 0; attempt < 180; attempt++) {
    if (child.exitCode !== null) throw new Error(`Service exited with ${child.exitCode}; inspect ${directory}`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch { /* Poll our own starting process. */ }
    await delay(250);
  }
  throw new Error(`Service not ready; inspect ${directory}`);
}
async function freePort(preferred = 0) {
  const server = createServer();
  server.listen(preferred, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}
function headers(token) { return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }; }
async function api(path, token, body) {
  const response = await fetch(`${origin}/api/v1${path}`, { headers: headers(token), ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
  const result = await response.json();
  assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(result)}`);
  return result;
}
async function login(account) { return (await api('/auth/login', '', dataset.auth[account])).accessToken; }
function lineup(manager) {
  const people = dataset.photoPlan.filter((person) => person.manager === manager);
  return {
    players: people.filter((person) => person.subjectKind === 'athlete').map((person, index) => ({ playerRegistrationId: person.registrationId, shirtNumber: index + 1, role: index < 11 ? 'starter' : 'reserve' })),
    staff: people.filter((person) => person.subjectKind === 'staff_member').map((person) => ({ staffRegistrationId: person.registrationId, role: 'staff' })),
  };
}
async function fingerprints(path) {
  if (!existsSync(path)) return {};
  const result = {};
  async function visit(relative = '') {
    for (const entry of await readdir(join(path, relative), { withFileTypes: true })) {
      const key = join(relative, entry.name);
      if (entry.isDirectory()) await visit(key);
      else if (entry.isFile()) result[key] = createHash('sha256').update(await readFile(join(path, key))).digest('hex');
    }
  }
  await visit();
  return result;
}
