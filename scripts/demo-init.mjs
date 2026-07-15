import { spawn } from "node:child_process";

const defaultApiBaseUrl = "http://localhost:4000/api/v1";
const demoManagerClubId = "70000000-0000-4000-8000-000000000003";
const demoManagerCredentials = {
  email: "dirigente@refcheckid.local",
  password: "Password123!",
};

const options = parseArgs(process.argv.slice(2));
const status = await checkDemoInitialization(options.apiBaseUrl);
if (status.initialized) {
  console.log(
    "[RefCheckID][demo:init] Ambiente demo già inizializzato: salto bootstrap.",
    status.counts,
  );
} else {
  console.log(
    "[RefCheckID][demo:init] Ambiente demo non inizializzato: eseguo bootstrap.",
    status.counts,
  );
  await runPnpm("demo:bootstrap", [
    "-C",
    "refcheckid-backend",
    "demo:bootstrap",
    "--",
    "--api-base-url",
    options.apiBaseUrl,
  ]);
}
await runPnpm("demo:verify", [
  "-C",
  "refcheckid-backend",
  "demo:verify",
  "--",
  "--api-base-url",
  options.apiBaseUrl,
]);

async function checkDemoInitialization(apiBaseUrl) {
  const session = await postJson(
    `${apiBaseUrl}/auth/login`,
    demoManagerCredentials,
  );
  const authHeaders = { authorization: `Bearer ${session.accessToken}` };
  const [players, staff, playerRegistrations, staffRegistrations, matches, matchSheets] =
    await Promise.all([
      getJson(`${apiBaseUrl}/players`, authHeaders),
      getJson(`${apiBaseUrl}/staff-members`, authHeaders),
      getJson(
        `${apiBaseUrl}/player-registrations?clubId=${encodeURIComponent(demoManagerClubId)}`,
        authHeaders,
      ),
      getJson(
        `${apiBaseUrl}/staff-registrations?clubId=${encodeURIComponent(demoManagerClubId)}`,
        authHeaders,
      ),
      getJson(
        `${apiBaseUrl}/matches?clubId=${encodeURIComponent(demoManagerClubId)}`,
        authHeaders,
      ),
      getJson(
        `${apiBaseUrl}/match-sheets?clubId=${encodeURIComponent(demoManagerClubId)}`,
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

function parseArgs(args) {
  let apiBaseUrl = process.env.REFCHECKID_API_BASE_URL ?? defaultApiBaseUrl;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--api-base-url") {
      apiBaseUrl = requireValue(args[index + 1], arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown demo init argument: ${arg}`);
  }

  return { apiBaseUrl: apiBaseUrl.replace(/\/$/, "") };
}

function requireValue(value, optionName) {
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${optionName}.`);
  }
  return value;
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
