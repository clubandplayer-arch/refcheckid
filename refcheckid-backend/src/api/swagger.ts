import { createOpenApiDocument } from './openapi.js';

export function createSwaggerHtml(): string {
  const spec = JSON.stringify(createOpenApiDocument());
  return `<!doctype html><html><head><title>RefCheckID API</title></head><body><script type="application/json" id="openapi-spec">${spec}</script><h1>RefCheckID API</h1><p>OpenAPI specification is embedded in this page.</p></body></html>`;
}
