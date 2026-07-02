import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, writeFileSync } from "node:fs";

const backendHealthUrl = "http://127.0.0.1:4000/api/health";
const webUrl = "http://127.0.0.1:3000";
const pidFile = "/tmp/refcheckid-dev.pid";
const logFile = "/tmp/refcheckid-dev.log";

async function isHttpReady(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readExistingPid() {
  if (!existsSync(pidFile)) return null;
  const parsed = Number(readFileSync(pidFile, "utf8"));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

const [backendReady, webReady] = await Promise.all([
  isHttpReady(backendHealthUrl),
  isHttpReady(webUrl),
]);

if (backendReady && webReady) {
  console.log("[RefCheckID][codespace] Porte 3000/4000 già attive.");
  process.exit(0);
}

const existingPid = readExistingPid();
if (existingPid !== null && isProcessAlive(existingPid)) {
  console.log(
    `[RefCheckID][codespace] Dev server già in avvio (pid ${existingPid}). Log: ${logFile}`,
  );
  process.exit(0);
}

const out = openSync(logFile, "a");
const child = spawn("pnpm", ["dev"], {
  detached: true,
  shell: process.platform === "win32",
  stdio: ["ignore", out, out],
});
child.unref();
closeSync(out);
writeFileSync(pidFile, String(child.pid));
console.log(
  `[RefCheckID][codespace] Avvio RefCheckID in background (pid ${child.pid}). Log: ${logFile}`,
);
console.log("[RefCheckID][codespace] Apri le porte 3000 e 4000 dopo pochi secondi.");
