import { spawn } from "node:child_process";

export const defaultDemoApiBaseUrl = "http://localhost:4000/api/v1";
export const localDemoApiBaseUrl = "http://127.0.0.1:4000/api/v1";
export const demoManagerClubId = "70000000-0000-4000-8000-000000000003";

const demoManagerCredentials = {
  email: "dirigente@refcheckid.local",
  password: "Password123!",
};

export function getConfiguredDemoApiBaseUrl(fallback = defaultDemoApiBaseUrl) {
  return (process.env.REFCHECKID_API_BASE_URL ?? fallback).replace(/\/$/, "");
}

export async function checkDemoInitialization(apiBaseUrl) {
  const session = await postJson(
    `${apiBaseUrl}/auth/login`,
    demoManagerCredentials,
  );
  const authHeaders = { authorization: `Bearer ${session.accessToken}` };
  const [
    players,
    staff,
    playerRegistrations,
    staffRegistrations,
    matches,
    matchSheets,
  ] = await Promise.all([
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

export async function runDemoInit(apiBaseUrl) {
  await runPnpm("demo:init", ["demo:init", "--", "--api-base-url", apiBaseUrl]);
}

export async function runDemoBootstrap(apiBaseUrl) {
  await runPnpm("demo:bootstrap", [
    "-C",
    "refcheckid-backend",
    "demo:bootstrap",
    "--",
    "--api-base-url",
    apiBaseUrl,
  ]);
}

export async function runDemoVerify(apiBaseUrl) {
  await runPnpm("demo:verify", [
    "-C",
    "refcheckid-backend",
    "demo:verify",
    "--",
    "--api-base-url",
    apiBaseUrl,
  ]);
}

export function runPnpm(label, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, {
      shell: process.platform === "win32",
      stdio: "inherit",
      ...options,
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
