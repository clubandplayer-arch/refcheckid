import { spawn } from "node:child_process";

const backendHealthUrl = "http://127.0.0.1:4000/api/health";
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

console.log("[RefCheckID][dev] Backend pronto. Avvio frontend sulla porta 3000...");
spawnPnpm("web", ["dev:web"]);

await new Promise(() => {
  // Keep the orchestrator alive so Ctrl+C can stop both package dev servers.
});
