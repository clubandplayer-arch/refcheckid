# RefCheckID

RefCheckID is a pnpm workspace with a lightweight Node.js backend runtime and a Next.js frontend.

## Requirements

- Node.js 20+
- pnpm 9.15+

## Install

Install dependencies for both apps:

```bash
pnpm -C refcheckid-backend install --frozen-lockfile
pnpm -C refcheckid-web install --frozen-lockfile
```

## Environment

Backend defaults are documented in `refcheckid-backend/.env.example`:

```bash
PORT=4000
HOST=0.0.0.0
CORS_ORIGIN=*
AUTH_SECRET=change-me-in-production
```

Frontend defaults are documented in `refcheckid-web/.env.example`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
```

In Codespaces, set `NEXT_PUBLIC_API_BASE_URL` to the forwarded backend URL ending in `/api/v1` when browser-to-backend calls must use the public forwarded URL.

## Ports

- Backend: `4000`
- Frontend: `3000`

## Demo pilot users

Use these local MVP credentials to verify role-based redirects without manually entering actor IDs or roles:

- Dirigente: `dirigente@refcheckid.local` / `Password123!`
- Arbitro: `arbitro@refcheckid.local` / `Password123!`
- Federazione: `federazione@refcheckid.local` / `Password123!`

## Run the backend

```bash
pnpm dev:backend
```

The backend exposes:

- `http://localhost:4000/api/health`
- `http://localhost:4000/api/v1/openapi.json`
- `http://localhost:4000/api/v1/swagger`
- API routes under `http://localhost:4000/api/v1/*`

## Run the frontend

```bash
pnpm dev:web
```

Open `http://localhost:3000` in the browser.

## Run the full application

```bash
pnpm dev
```

This starts the backend on port `4000` and the frontend on port `3000` from the repository root.

## Quality gate

```bash
pnpm lint
pnpm test
pnpm build
pnpm coverage
```

## Smoke test

After a build, run:

```bash
pnpm smoke
```

The smoke test verifies backend health, the frontend build artifact, and the versioned OpenAPI endpoint.
