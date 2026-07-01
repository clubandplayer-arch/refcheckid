const defaultBackendPort = "4000";

export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }

  if (typeof window !== "undefined") {
    return "/api/v1";
  }

  return `http://localhost:${defaultBackendPort}/api/v1`;
}
