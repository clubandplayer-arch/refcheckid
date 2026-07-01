const defaultBackendPort = "4000";
const frontendPort = "3000";

export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }

  if (typeof window === "undefined") {
    return `http://localhost:${defaultBackendPort}/api/v1`;
  }

  const { hostname, protocol } = window.location;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${hostname}:${defaultBackendPort}/api/v1`;
  }

  if (hostname.includes(`-${frontendPort}.app.github.dev`)) {
    return `${protocol}//${hostname.replace(`-${frontendPort}.app.github.dev`, `-${defaultBackendPort}.app.github.dev`)}/api/v1`;
  }

  if (hostname.includes(`-${frontendPort}.githubpreview.dev`)) {
    return `${protocol}//${hostname.replace(`-${frontendPort}.githubpreview.dev`, `-${defaultBackendPort}.githubpreview.dev`)}/api/v1`;
  }

  return `${protocol}//${hostname}/api/v1`;
}
