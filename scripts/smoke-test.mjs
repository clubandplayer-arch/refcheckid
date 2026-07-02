import { access, constants } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000/api/v1';
const healthUrl = backendUrl.replace(/\/api\/v1\/?$/, '/api/health');
const openApiUrl = `${backendUrl.replace(/\/$/, '')}/openapi.json`;

await ensureFrontendBuild();
await ensureBackendBuild();

const backend = spawn(process.execPath, ['refcheckid-backend/dist/src/server.js'], {
  env: { ...process.env, PORT: '4000', HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  await waitForOk(healthUrl, 'backend health');
  const openApi = await waitForJson(openApiUrl, 'OpenAPI document');
  if (openApi.openapi !== '3.1.0') {
    throw new Error(`Unexpected OpenAPI version: ${String(openApi.openapi)}`);
  }
  console.log('Smoke test passed: backend health, frontend build, and OpenAPI are available.');
} finally {
  backend.kill('SIGTERM');
}

async function ensureFrontendBuild() {
  try {
    await access('refcheckid-web/.next/BUILD_ID', constants.R_OK);
  } catch {
    await run('pnpm', ['-C', 'refcheckid-web', 'build']);
  }
}

async function ensureBackendBuild() {
  try {
    await access('refcheckid-backend/dist/src/server.js', constants.R_OK);
  } catch {
    await run('pnpm', ['-C', 'refcheckid-backend', 'build']);
  }
}

async function waitForOk(url, label) {
  const response = await waitForResponse(url, label);
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}.`);
  }
}

async function waitForJson(url, label) {
  const response = await waitForResponse(url, label);
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}.`);
  }
  return response.json();
}

async function waitForResponse(url, label) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw new Error(`${label} was not reachable at ${url}: ${String(lastError)}`);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? 'unknown'}.`));
      }
    });
    child.on('error', reject);
  });
}
