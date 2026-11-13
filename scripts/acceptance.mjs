import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';
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
delete env.REFCHECKID_RUNTIME;delete env.DATABASE_URL;delete env.SUPABASE_URL;delete env.SUPABASE_SERVER_KEY;
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
  // Every order control fits a phone and edits survive saving and reloading.
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Seleziona tutti',exact:true}).click();
  await page.getByRole('button',{name:'2. Ordine',exact:true}).click();
  const orderList=page.getByRole('list',{name:'Giocatori in ordine di distinta'});
  const secondName=await orderList.getByRole('listitem').nth(1).getAttribute('aria-label');
  const secondCard=orderList.getByRole('listitem',{name:secondName,exact:true});
  await secondCard.getByLabel('Numero maglia',{exact:true}).fill('42');
  await secondCard.getByRole('combobox').selectOption('reserve');
  await secondCard.getByRole('button',{name:`Sposta su ${secondName}`,exact:true}).click();
  assert.equal(await orderList.getByRole('listitem').first().getAttribute('aria-label'),secondName);
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    assert(await secondCard.evaluate(card=>card.scrollWidth<=card.clientWidth));
  }
  const compactFields=await secondCard.evaluate(card=>{
    const number=card.querySelector('input[type="number"]');const role=card.querySelector('select');
    const n=number.getBoundingClientRect(),r=role.getBoundingClientRect();
    return {numberWidth:n.width, sameRow:Math.abs(n.top-r.top)<2};
  });
  assert(compactFields.numberWidth<=100);assert(compactFields.sameRow);
  await page.screenshot({path:join(directory,'mobile-lineup-order.png'),fullPage:true});
  await page.setViewportSize({width:1280,height:900});
  await page.screenshot({path:join(directory,'desktop-lineup-order.png'),fullPage:true});

  const orderSave=page.waitForResponse(response=>response.url().endsWith('/draft')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Salva distinta in bozza',exact:true}).click();assert.equal((await orderSave).status(),200);
  await page.reload();await page.getByRole('button',{name:'2. Ordine',exact:true}).click();
  await orderList.waitFor();assert.equal(await orderList.getByRole('listitem').first().getAttribute('aria-label'),secondName);
  assert.equal(await secondCard.getByLabel('Numero maglia',{exact:true}).inputValue(),'42');
  assert.equal(await secondCard.getByRole('combobox').inputValue(),'reserve');
  await page.getByRole('button',{name:'1. Compilazione',exact:true}).click();
  check('Real Chromium mobile: lineup controls fit 320px, buttons reorder players and saved number/role/order survive reload');
  // On mobile, require the annual reason before any upload and ignore a double tap.
  await page.setViewportSize({width:390,height:844});
  const uploader=dataset.federationSyncPayload.players.find(player=>player.id===participant.subjectId);
  await page.getByLabel(`Modifica foto ${uploader.lastName} ${uploader.firstName}`,{exact:true}).setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:oldBytes});
  const reasonInput=page.getByPlaceholder('Motivo del cambio aggiuntivo (almeno 20 caratteri)',{exact:true});await reasonInput.waitFor();
  assert(await page.getByRole('button',{name:'Invia richiesta',exact:true}).isDisabled());
  let uploadRequests=0;const countUpload=request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/v1/photos/upload-intent')uploadRequests++;};page.on('request',countUpload);
  await reasonInput.fill('Crescita fisica rilevante che richiede un nuovo confronto del volto per il riconoscimento.');
  const completion=page.waitForResponse(response=>response.request().method()==='POST'&&/\/photos\/uploads\/[^/]+\/complete$/.test(new URL(response.url()).pathname));
  await page.getByRole('button',{name:'Invia richiesta',exact:true}).evaluate(button=>{button.click();button.click();});assert.equal((await completion).status(),200);
  await page.getByText('Richiesta già in attesa.',{exact:true}).waitFor();assert.equal(uploadRequests,1);page.off('request',countUpload);
  const uniquePending=await api(`/photo-approvals?federationId=${dataset.federationSyncPayload.federations[0].id}&status=pending`,federation);assert.equal(uniquePending.filter(row=>row.registrationId===participant.registrationId).length,1);
  await page.screenshot({path:join(directory,'mobile-photo-single-request.png'),fullPage:true});await page.setViewportSize({width:1280,height:900});
  check('Real Chromium mobile: required annual reason, double-tap protection and one pending photo request');
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
  await page.getByText('Cambio foto aggiuntivo nell’anno', { exact: true }).waitFor();
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
  // A legacy federation can save its logo before activating its organizational hierarchy.
  await page.getByRole('link',{name:'Profilo e loghi',exact:true}).click();await page.waitForURL(url=>url.pathname==='/profile');
  const legacyFederationId=dataset.federationSyncPayload.federations[0].id;
  await page.getByLabel('Profilo',{exact:true}).selectOption(`organization/${legacyFederationId}`);
  const profileSharp=createRequire(join(backendRoot,'package.json'))('sharp'),legacyLogo=await profileSharp({create:{width:100,height:100,channels:4,background:'#ffcc00'}}).png().toBuffer();
  await page.getByLabel('Logo',{exact:true}).setInputFiles({name:'federal-logo.png',mimeType:'image/png',buffer:legacyLogo});
  await page.getByLabel('Colore principale',{exact:true}).fill('#ffcc00');await page.getByLabel('Colore sfondi',{exact:true}).fill('#000000');
  await page.getByRole('button',{name:'Salva profilo',exact:true}).click();await page.getByText('Profilo salvato.',{exact:true}).waitFor();
  await page.getByLabel('Colore principale',{exact:true}).fill('#ffcc00');await page.getByLabel('Colore sfondi',{exact:true}).fill('#000000');await page.getByRole('button',{name:'Applica colori',exact:true}).click();await page.getByRole('alert').filter({hasText:'Scegli un colore principale più scuro'}).waitFor();
  assert((await api(`/platform/profiles/organization/${legacyFederationId}`,federation)).imageUrl);
  await page.reload();await page.getByRole('img',{name:'Anteprima profilo',exact:true}).waitFor();await page.getByRole('link',{name:'Gestione ente',exact:true}).click();
  check('Real Chromium: federation logo persists before hierarchy activation and survives rejected colors');
  await page.getByRole('button', {name:'Gestione ente',exact:true}).click();
  const form=(title)=>page.locator('form').filter({has:page.getByRole('heading',{name:title,exact:true})});
  const configuration=form('Attiva la gestione della tua federazione');
  assert.equal(await configuration.locator('[name=kind] option[value=refereeing]').count(),0);
  await configuration.locator('[name=name]').fill('Lega browser test');
  await configuration.locator('[name=kind]').selectOption('sports');
  await configuration.locator('[name=federationId]').selectOption(dataset.federationSyncPayload.federations[0].id);
  await configuration.getByRole('button',{name:'Attiva gestione',exact:true}).click();
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
  await competitionForm.locator('[name=season]').fill(dataset.seasonId);
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
  // The publication administrator exists only in this run's isolated SQLite database.
  const {RuntimeStore}=await import('../refcheckid-backend/dist/src/repositories/runtime-store.js');
  const {stableId}=await import('../refcheckid-backend/dist/src/platform/store.js');
  const ephemeral=new RuntimeStore(env.REFCHECKID_DATABASE_PATH),adminId=randomUUID(),adminActor=randomUUID(),adminEmail='publication-admin@example.invalid',adminPassword='Browser-platform-admin-2026!',salt=randomBytes(16).toString('hex');
  ephemeral.put('auth_profiles',{id:adminId,actorId:adminActor,email:adminEmail,displayName:'Publication test admin',role:'admin',enabled:true,passwordHash:`scrypt$${salt}$${scryptSync(adminPassword,salt,64).toString('hex')}`,federationIds:[],clubIds:[],refereeIds:[]});ephemeral.put('platform_login_aliases',{id:stableId('login',adminEmail),profileId:adminId,email:adminEmail});ephemeral.close();
  const adminToken=(await api('/auth/login','',{email:adminEmail,password:adminPassword})).accessToken;
  assert.equal((await fetch(`${origin}/api/v1/platform/organizations`,{method:'POST',headers:headers(federation),body:JSON.stringify({name:'Forbidden league-created refereeing body',kind:'refereeing'})})).status,403);
  const arbitration=await api('/platform/organizations',adminToken,{name:'Organizzazione arbitrale browser test',kind:'refereeing'});
  // Explicit central-admin grant for this dual-role test operator; never inferred from league ownership.
  const grantStore=new RuntimeStore(env.REFCHECKID_DATABASE_PATH);grantStore.put('platform_memberships',{id:randomUUID(),organizationId:arbitration.id,unitId:arbitration.rootUnitId,actorId:platformContext.memberships[0].actorId,role:'org_admin',active:true,descendants:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),deletedAt:null});grantStore.close();
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
    const team=await api('/platform/teams',federation,{...scope,code:`TEAM-${index}`,name:club.name,clubId:club.id,sport:'football',season:competition.season,category:'Under 19'});teams.push(team);await api('/platform/entries',federation,{competitionId:competition.id,teamId:team.id});
  }
  const fixture=await api('/platform/fixtures',federation,{competitionId:competition.id,code:'BROWSER-GAME',homeTeamId:teams[0].id,awayTeamId:teams[1].id,round:'1',scheduledAt:'2026-12-12T15:00:00+01:00',venue:'Campo browser test'});
  await api('/platform/appointments',federation,{fixtureId:fixture.id,officialId:official.id,role:'principal',send:true});
  await refereePage.reload();await refereePage.getByRole('button',{name:'Accetta gara',exact:true}).click();await refereePage.getByText('Accettata',{exact:false}).waitFor();await refereePage.getByRole('link',{name:'Apri distinta e riconoscimento di questa gara',exact:true}).waitFor();await refereePage.getByRole('heading',{name:'Prossima gara',exact:true}).locator('..').getByText(teams[0].name+' - '+teams[1].name,{exact:true}).waitFor();await refereePage.screenshot({path:join(directory,'platform-referee-appointment.png'),fullPage:true});
  await refereePage.getByRole('link',{name:'Apri distinta e riconoscimento di questa gara',exact:true}).click();await refereePage.waitForURL(url=>url.pathname==='/referee/match'&&url.searchParams.get('matchId')===fixture.matchId);await refereePage.getByRole('heading',{name:'Verifica distinte',exact:true}).waitFor();
  await page.getByRole('button',{name:'Designazioni',exact:true}).click();await page.screenshot({path:join(directory,'platform-delegated-designations.png'),fullPage:true});
  const csvLine=values=>values.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(';');
  const playerRows=[],staffRows=[];
  for(const[index,club]of dataset.federationSyncPayload.clubs.slice(0,2).entries()){
    for(const registration of dataset.federationSyncPayload.playerRegistrations.filter(row=>row.clubId===club.id)){const player=dataset.federationSyncPayload.players.find(row=>row.id===registration.playerId);playerRows.push([registration.registrationNumber,player.firstName,player.lastName,player.birthDate,`LEGACY-${index}`,competition.season,player.id,`TEAM-${index}`]);}
    for(const registration of dataset.federationSyncPayload.staffRegistrations.filter(row=>row.clubId===club.id)){const person=dataset.federationSyncPayload.staffMembers.find(row=>row.id===registration.staffMemberId);staffRows.push([registration.registrationNumber,person.firstName,person.lastName,`LEGACY-${index}`,competition.season,registration.role,person.id,`TEAM-${index}`]);}
  }
  for(const[kind,columns,rows]of [['players',['code','first_name','last_name','birth_date','club_code','season','existing_person_id','team_code'],playerRows],['staff',['code','first_name','last_name','club_code','season','role','existing_person_id','team_code'],staffRows]]){
    const bytes=Buffer.from([columns,...rows].map(csvLine).join('\n'));const upload=await api('/platform/imports/upload',federation,{...scope,kind,filename:kind+'-publication.csv',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});let job=await api('/platform/imports/prepare',federation,{uploadId:upload.id,contentBase64:bytes.toString('base64')});while(job.status==='validating')job=await api(`/platform/imports/${job.id}/advance`,federation,{action:'advance'});assert.equal(job.errors,0);await api(`/platform/imports/${job.id}/advance`,federation,{action:'commit'});while(job.status!=='completed')job=await api(`/platform/imports/${job.id}/advance`,federation,{action:'advance'});
  }
  const newRefereeToken=await refereePage.evaluate(()=>JSON.parse(localStorage.getItem('refcheckid.session')).accessToken);
  const sheets=await api(`/match-sheets?matchId=${fixture.matchId}`,federation);
  for(const[account,club]of [['homeManager',teams[0]],['awayManager',teams[1]]]){const token=await login(account),sheet=sheets.find(row=>row.clubId===club.clubId),body=lineup(account);body.players=body.players.map((row,index)=>({...row,isGoalkeeper:index===0,isCaptain:index===3,isViceCaptain:index===2}));await api(`/match-sheets/${sheet.id}/submit`,token,body);await api(`/match-sheets/${sheet.id}/lock`,newRefereeToken,{});}
  await api('/recognitions/start',newRefereeToken,{matchId:fixture.matchId});for(const person of dataset.photoPlan)await api('/recognitions/decision',newRefereeToken,{matchId:fixture.matchId,registrationId:person.registrationId,status:'recognized',notes:'Isolated publication acceptance'});await api('/recognitions/complete',newRefereeToken,{matchId:fixture.matchId});
  const publicContext=await browser.newContext({viewport:{width:1280,height:900}}),publicPage=await publicContext.newPage();publicPage.on('pageerror',error=>browserErrors.push(error.message));await publicPage.goto(webOrigin+'/results');await publicPage.getByText(/Non ci sono campionati pubblicati/).waitFor();assert.equal(await publicPage.getByLabel('Disciplina risultati',{exact:true}).locator('option').count(),37);const sportFiltered=publicPage.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/public/competitions'&&new URL(response.url()).searchParams.get('sport')==='rugby_union');await publicPage.getByLabel('Disciplina risultati',{exact:true}).selectOption('rugby_union');assert.equal((await sportFiltered).status(),200);await publicPage.getByLabel('Disciplina risultati',{exact:true}).selectOption('');
  await page.getByLabel('Ente',{exact:true}).selectOption(sportsOrg.id);await page.getByLabel('Struttura',{exact:true}).locator(`option[value="${province.id}"]`).waitFor({state:'attached'});await page.getByLabel('Struttura',{exact:true}).selectOption(province.id);await page.getByRole('button',{name:'Pubblicazione',exact:true}).click();
  const consentForm=form('Autorizzazione dell’ente sportivo');await consentForm.locator('[name=consent]').check();await consentForm.locator('[name=consentEvents]').check();await consentForm.getByRole('button',{name:'Salva autorizzazione',exact:true}).click();await page.getByText('Impostazioni salvate.',{exact:true}).waitFor();
  const adminContext=await browser.newContext({viewport:{width:1280,height:900}}),adminPage=await adminContext.newPage();adminPage.on('pageerror',error=>browserErrors.push(error.message));await adminPage.goto(webOrigin);await adminPage.getByLabel('Email o codice personale',{exact:true}).fill(adminEmail);await adminPage.getByLabel('Password',{exact:true}).fill(adminPassword);await adminPage.getByRole('button',{name:'ACCEDI',exact:true}).click();await adminPage.waitForURL(url=>url.pathname==='/admin/publication');
  await adminPage.getByRole('link',{name:'Registro enti autonomi',exact:true}).click();await adminPage.getByRole('heading',{name:'Registro degli enti autonomi',exact:true}).waitFor();await adminPage.getByRole('button',{name:'Registra ente',exact:true}).waitFor();assert.equal(await adminPage.locator('[name=kind] option[value=refereeing]').count(),1);await adminPage.goto(webOrigin+'/admin/publication');
  const distribution=adminPage.locator('form').filter({has:adminPage.getByRole('heading',{name:'Attiva o sospendi la distribuzione',exact:true})});await distribution.locator('[name=mode]').selectOption('public');await distribution.locator('[name=includeLive]').check();await distribution.locator('[name=includeEvents]').check();await distribution.getByRole('button',{name:'Salva distribuzione',exact:true}).click();await adminPage.getByText('Impostazioni salvate.',{exact:true}).waitFor();
  await refereePage.goto(webOrigin+`/referee/notebook?fixtureId=${fixture.id}`);await refereePage.getByRole('button',{name:'Avvia periodo',exact:true}).click();await refereePage.getByLabel('Giocatore evento',{exact:true}).selectOption({index:1});await refereePage.getByRole('button',{name:'Registra evento',exact:true}).click();await refereePage.getByText('Aggiornamento ricevuto e salvato dal server.',{exact:true}).waitFor();
  await publicPage.getByLabel('Punteggio',{exact:true}).filter({hasText:'1 – 0'}).waitFor();await publicPage.getByText('Aggiornamento provvisorio',{exact:true}).waitFor();await publicPage.screenshot({path:join(directory,'official-results-live.png'),fullPage:true});
  await refereePage.getByRole('button',{name:'Conferma fine periodo, anche senza eventi',exact:true}).click();await refereePage.getByRole('button',{name:'Avvia periodo',exact:true}).waitFor();await refereePage.getByRole('button',{name:'Avvia periodo',exact:true}).click();await refereePage.getByRole('button',{name:'Conferma fine gara',exact:true}).click();
  const privateNote='PRIVATE-REPORT-NOT-IN-OFFICIAL-RESULTS';const reportForm=refereePage.locator('form').filter({has:refereePage.getByRole('heading',{name:'Invia il referto finale',exact:true})});await reportForm.locator('[name=notes]').fill(privateNote);await reportForm.getByRole('button',{name:'Conferma e invia referto',exact:true}).click();await refereePage.getByText('Referto inviato: i dati sono in sola lettura.',{exact:false}).waitFor();await refereePage.screenshot({path:join(directory,'digital-notebook-final.png'),fullPage:true});
  const publicJson=await api(`/public/games/${fixture.id}`,'');assert.equal(publicJson.phase,'finished');assert.equal(publicJson.certification,'referee_confirmed');assert(!JSON.stringify(publicJson).includes(privateNote));assert(!JSON.stringify(publicJson).includes('registrationId'));assert.deepEqual(publicJson.events[0].participant,{});
  assert.equal((await fetch(`${origin}/api/v1/platform/games/${fixture.id}/report`,{headers:headers(adminToken)})).status,403);
  await page.goto(webOrigin+`/federation/reports?fixtureId=${fixture.id}`);await page.getByText(privateNote,{exact:true}).waitFor();await page.screenshot({path:join(directory,'private-federation-report.png'),fullPage:true});await publicPage.goto(webOrigin+`/results/${fixture.id}`);await publicPage.getByText('Terminata',{exact:true}).waitFor();assert(!(await publicPage.locator('body').innerText()).includes(privateNote));await publicPage.screenshot({path:join(directory,'official-results-final.png'),fullPage:true});
  // Profile images and branding are exercised only in this temporary test environment.
  const sharp=createRequire(join(backendRoot,'package.json'))('sharp');
  const logo=await sharp({create:{width:180,height:180,channels:4,background:'#173d69'}}).png().toBuffer();
  const homeClubId=dataset.federationSyncPayload.clubs[0].id;
  const managerContext=await browser.newContext({viewport:{width:1280,height:900}}),managerPage=await managerContext.newPage();managerPage.on('pageerror',error=>browserErrors.push(error.message));
  await managerPage.goto(webOrigin);await managerPage.getByLabel('Email o codice personale',{exact:true}).fill(dataset.auth.homeManager.email);await managerPage.getByLabel('Password',{exact:true}).fill(dataset.auth.homeManager.password);await managerPage.getByRole('button',{name:'ACCEDI',exact:true}).click();await managerPage.waitForURL(url=>url.pathname==='/manager');
  await managerPage.getByRole('link',{name:'Profilo e loghi',exact:true}).click();await managerPage.waitForURL(url=>url.pathname==='/profile');await managerPage.getByLabel('Profilo',{exact:true}).selectOption(`club/${homeClubId}`);
  await managerPage.getByLabel('Logo',{exact:true}).setInputFiles({name:'club-logo.png',mimeType:'image/png',buffer:logo});await managerPage.getByRole('button',{name:'Salva profilo',exact:true}).click();await managerPage.getByText('Profilo salvato.',{exact:true}).waitFor();await managerPage.screenshot({path:join(directory,'club-profile-logo.png'),fullPage:true});
  await publicPage.reload();await publicPage.getByRole('img',{name:/Logo ASD RefCheck Home/}).waitFor();await publicPage.getByRole('img',{name:/Logo ASD RefCheck Home/}).evaluate(image=>image.decode());
  const oldBrand=await api(`/platform/profiles/organization/${sportsOrg.id}`,federation);await api(`/platform/profiles/organization/${sportsOrg.id}`,federation,{revision:oldBrand.revision,displayName:'Federazione identità test',primaryColor:'#173d69',accentColor:'#edf2ff',imageBase64:'data:image/png;base64,'+logo.toString('base64')});
  await managerPage.reload();await managerPage.getByText('Federazione identità test',{exact:true}).first().waitFor();await managerPage.waitForFunction(()=>document.documentElement.style.getPropertyValue('--primary').length>0);assert.equal(await managerPage.locator('[aria-label="Federazione di appartenenza"] img').count(),1);assert.equal(await managerPage.locator('[aria-label="Federazione di appartenenza"]').evaluate(section=>section.previousElementSibling?.contains(section)===false),true);await managerPage.setViewportSize({width:390,height:844});assert(await managerPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await managerPage.screenshot({path:join(directory,'club-profile-mobile.png'),fullPage:true});
  await refereePage.goto(webOrigin+'/profile');const refereeProfiles=await api('/platform/profiles/context',newRefereeToken);const ownRefereeProfile=refereeProfiles.items.find(row=>row.kind==='referee');await refereePage.getByLabel('Profilo',{exact:true}).selectOption(`referee/${ownRefereeProfile.subjectId}`);
  await refereePage.getByLabel('Foto personale',{exact:true}).setInputFiles({name:'referee-photo.png',mimeType:'image/png',buffer:logo});await refereePage.getByRole('button',{name:'Salva profilo',exact:true}).click();await refereePage.getByText('Profilo salvato.',{exact:true}).waitFor();await refereePage.screenshot({path:join(directory,'referee-profile-photo.png'),fullPage:true});
  await page.goto(webOrigin+'/profile');await page.getByRole('heading',{name:'Verifica configurazione del sito',exact:true}).waitFor();await page.getByText('Amministratore pubblicazione: configurato',{exact:true}).waitFor();await page.screenshot({path:join(directory,'deployment-readiness.png'),fullPage:true});
  await managerContext.close();
  check('Real Chromium: manager club logo upload, live public logo, inherited federal branding, referee portrait and deployment readiness');
  const policy=await api(`/platform/competitions/${competition.id}/publication`,federation);await api(`/platform/competitions/${competition.id}/publication/consent`,federation,{revision:policy.revision,consent:false,consentEvents:false,consentNames:false});assert.equal((await fetch(`${origin}/api/v1/public/games/${fixture.id}`)).status,404);await publicPage.reload();await publicPage.getByText('Questi dati non sono pubblicati.',{exact:true}).waitFor();
  await adminContext.close();await publicContext.close();
  check('Real Chromium: private publication consent, platform activation, digital notebook live goal, official public results, federation-only report and immediate withdrawal');
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
