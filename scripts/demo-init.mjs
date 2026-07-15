import {
  checkDemoInitialization,
  getConfiguredDemoApiBaseUrl,
  runDemoBootstrap,
  runDemoVerify,
} from "./demo-environment.mjs";

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
  await runDemoBootstrap(options.apiBaseUrl);
}
await runDemoVerify(options.apiBaseUrl);

function parseArgs(args) {
  let apiBaseUrl = getConfiguredDemoApiBaseUrl();

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
