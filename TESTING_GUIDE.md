# RefCheckID Testing Guide

## Quality gate

Run from the repository root:

```bash
pnpm lint
pnpm test
pnpm build
```

## Suites

- `pnpm test:unit` covers backend services, repositories, middleware, event engine, controllers, DTO validation, and frontend client logic.
- `pnpm test:integration` covers frontend contracts and REST API to backend repository flows.
- `pnpm test:e2e` covers the happy path: manager lineup, referee recognition, match report, and federation receipt.
- `pnpm test:regression` runs table-driven REG cases so fixed bugs can be added with a new case entry.
- `pnpm test:security` automates JWT-style actor context, role headers, permissions, RLS/storage-facing route gates, and API auditability checks.
- `pnpm test:performance` validates the load, stress, and spike profile definitions without running load against CI.
- `pnpm coverage` produces backend, frontend, and workspace coverage output.

## Adding regression cases

Add a case object to `refcheckid-backend/tests/regression/master-regression-suite.test.ts` with:

- `id`: the Master Test Plan REG identifier.
- `title`: a clear behavior statement.
- `run`: the executable reproduction and assertion.

## Performance profiles

The k6-ready profile scaffold lives in `refcheckid-backend/tests/performance/profiles/refcheckid.k6.js`. It is not executed in CI until a stable deployed test target is available.
