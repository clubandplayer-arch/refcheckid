# RefCheckID Backend Migration Workflow

## Decision

RefCheckID uses the **Supabase CLI** as the official PostgreSQL/Supabase migration executor.

Rationale:

- the product targets PostgreSQL/Supabase;
- migrations are already maintained as plain SQL files under `database/migrations`;
- Supabase CLI can apply SQL migrations to local or remote Supabase/PostgreSQL databases without introducing a second ORM-owned schema source;
- Drizzle remains available for application/repository contracts, but Drizzle Kit is not the source of truth for migrations in this repository.

## Canonical migration source

The canonical source remains:

```text
refcheckid-backend/database/migrations/*.sql
```

The project migration runner mirrors those files into a temporary Supabase workdir before calling `supabase db push`. Do not manually copy files into `supabase/migrations`.

## Commands

From the repository root:

```bash
pnpm migrate:status
pnpm migrate
pnpm migrate:rollback
```

From `refcheckid-backend/`:

```bash
pnpm migrate:status
pnpm migrate
pnpm migrate:dry-run
pnpm migrate:rollback
```

## Required environment

`pnpm migrate` requires:

- Supabase CLI available in `PATH`;
- `SUPABASE_DB_URL` or `DATABASE_URL` set to the target development database connection string.

`SUPABASE_DB_URL` takes precedence over `DATABASE_URL`.

## Rollback policy

Rollback is intentionally not automated. RefCheckID backend migrations are **forward-only**: to undo a deployed change, create a new corrective migration.

The `pnpm migrate:rollback` command exists to make this policy explicit and to prevent accidental manual rollback procedures.

## Validation

Use:

```bash
pnpm -C refcheckid-backend migrate:dry-run
pnpm -C refcheckid-backend test -- tests/migration-runner.test.ts
```

The dry run validates migration naming, ordering and duplicate versions without connecting to the database.

## Codespaces

Codespaces installs Supabase CLI during devcontainer creation through `.devcontainer/install-supabase-cli.sh`.

After creating or rebuilding the Codespace, verify:

```bash
supabase --version
```

If the command is missing in an already-running Codespace, rebuild the container so `postCreateCommand` runs again.
