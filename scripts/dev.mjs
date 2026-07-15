import { spawn } from "node:child_process";

const backendHealthUrl = "http://127.0.0.1:4000/api/health";
const demoApiBaseUrl =
  process.env.REFCHECKID_API_BASE_URL ?? "http://127.0.0.1:4000/api/v1";
const demoManagerClubId = "70000000-0000-4000-8000-000000000003";
const demoManagerCredentials = {
  email: "dirigente@refcheckid.local",
  password: "Password123!",
};
const startupTimeoutMs = 60_000;
const pollIntervalMs = 1_000;

let shuttingDown = false;
const childProcesses = [];

function spawnPnpm(label, args) {
  const child = spawn("pnpm", args, {
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  childProcesses.push(child);
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    if (code === 0 || signal) return;
    console.error(`[RefCheckID][dev] ${label} exited with code ${code}.`);
    shutdown(code ?? 1);
  });
  return child;
}

function runPnpm(label, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, {
      shell: process.platform === "win32",
      stdio: "inherit",
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${label} terminated with signal ${signal}.`));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} exited with code ${code}.`));
    });
  });
}

async function isBackendHealthy() {
  try {
    const response = await fetch(backendHealthUrl, {
      signal: AbortSignal.timeout(1_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForBackend() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < startupTimeoutMs) {
    if (await isBackendHealthy()) return;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(
    `Backend non pronto dopo ${startupTimeoutMs / 1_000}s: ${backendHealthUrl}`,
  );
}

async function checkDemoInitialization() {
  const session = await postJson(
    `${demoApiBaseUrl}/auth/login`,
    demoManagerCredentials,
  );
  const authHeaders = { authorization: `Bearer ${session.accessToken}` };
  const [players, staff, playerRegistrations, staffRegistrations, matches, matchSheets] =
    await Promise.all([
      getJson(`${demoApiBaseUrl}/players`, authHeaders),
      getJson(`${demoApiBaseUrl}/staff-members`, authHeaders),
      getJson(
        `${demoApiBaseUrl}/player-registrations?clubId=${encodeURIComponent(demoManagerClubId)}`,
        authHeaders,
      ),
      getJson(
        `${demoApiBaseUrl}/staff-registrations?clubId=${encodeURIComponent(demoManagerClubId)}`,
        authHeaders,
      ),
      getJson(
        `${demoApiBaseUrl}/matches?clubId=${encodeURIComponent(demoManagerClubId)}`,
        authHeaders,
      ),
      getJson(
        `${demoApiBaseUrl}/match-sheets?clubId=${encodeURIComponent(demoManagerClubId)}`,
        authHeaders,
      ),
    ]);

  const counts = {
    matchSheets: countItems(matchSheets),
    matches: countItems(matches),
    playerRegistrations: countItems(playerRegistrations),
    players: countItems(players),
    staff: countItems(staff),
    staffRegistrations: countItems(staffRegistrations),
  };
  return {
    counts,
    initialized:
      counts.players > 0 &&
      counts.staff > 0 &&
      counts.playerRegistrations > 0 &&
      counts.staffRegistrations > 0 &&
      counts.matches > 0 &&
      counts.matchSheets > 0,
  };
}

async function ensureDemoInitialized() {
  let status;
  try {
    status = await checkDemoInitialization();
  } catch (error) {
    console.warn(
      "[RefCheckID][dev] Verifica inizializzazione demo non riuscita.",
      error,
    );
    return;
  }

  if (status.initialized) {
    console.log(
      "[RefCheckID][dev] Ambiente demo già inizializzato.",
      status.counts,
    );
    return;
  }

  console.warn(
    "[RefCheckID][dev] Ambiente demo non inizializzato.",
    status.counts,
  );
  const command = `REFCHECKID_API_BASE_URL=${demoApiBaseUrl} pnpm demo:init`;
  if (process.env.REFCHECKID_DEMO_AUTO_BOOTSTRAP !== "true") {
    console.warn(`[RefCheckID][dev] Esegui '${command}' per popolare il demo.`);
    return;
  }

  console.log(
    "[RefCheckID][dev] REFCHECKID_DEMO_AUTO_BOOTSTRAP=true: avvio demo:init prima del Web...",
  );
  await runPnpm("demo:init", [
    "demo:init",
    "--",
    "--api-base-url",
    demoApiBaseUrl,
  ]);
}

async function getJson(url, headers) {
  const response = await fetch(url, { headers });
  return parseJsonResponse(response, "GET", url);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  return parseJsonResponse(response, "POST", url);
}

async function parseJsonResponse(response, method, url) {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      `${method} ${url} failed with ${response.status}: ${JSON.stringify(body)}`,
    );
  }
  return body;
}

function countItems(value) {
  return Array.isArray(value) ? value.length : 0;
}

function shutdown(exitCode = 0) {
  shuttingDown = true;
  for (const child of childProcesses) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(exitCode), 500).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

if (await isBackendHealthy()) {
  console.log(`[RefCheckID][dev] Backend già disponibile: ${backendHealthUrl}`);
} else {
  console.log("[RefCheckID][dev] Avvio backend sulla porta 4000...");
  spawnPnpm("backend", ["dev:backend"]);
  await waitForBackend();
}

await ensureDemoInitialized();

console.log("[RefCheckID][dev] Backend pronto. Avvio frontend sulla porta 3000...");
spawnPnpm("web", ["dev:web"]);

await new Promise(() => {
  // Keep the orchestrator alive so Ctrl+C can stop both package dev servers.
});
