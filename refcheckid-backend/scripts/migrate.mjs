#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const migrationsDir = join(repoRoot, 'database', 'migrations');
const workDir = join(repoRoot, '.tmp', 'supabase-migrations');
const supabaseWorkDir = join(workDir, 'supabase');
const supabaseMigrationsDir = join(supabaseWorkDir, 'migrations');
const migrationFilePattern = /^\d{4}_[a-z0-9_]+\.sql$/;

const command = process.argv[2] ?? 'status';
const flags = new Set(process.argv.slice(3));

try {
  if (command === 'prepare') {
    const migrations = listMigrationFiles();
    await prepareSupabaseWorkDir(migrations);
  } else if (command === 'status') {
    printStatus();
  } else if (command === 'migrate') {
    migrate({ dryRun: flags.has('--dry-run') });
  } else if (command === 'rollback') {
    rollback();
  } else {
    fail(`Unknown migration command "${command}". Use status, migrate, or rollback.`);
  }
} catch (error) {
  if (error instanceof Error) {
    fail(error.message);
  }
  fail('Unexpected migration runner error.');
}

function listMigrationFiles() {
  if (!existsSync(migrationsDir)) {
    throw new Error(`Migration directory does not exist: ${migrationsDir}`);
  }

  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  for (const file of files) {
    if (!migrationFilePattern.test(file)) {
      throw new Error(
        `Invalid migration filename "${file}". Expected format: 0001_descriptive_name.sql`,
      );
    }
  }

  const versions = new Set();
  for (const file of files) {
    const version = file.slice(0, 4);
    if (versions.has(version)) {
      throw new Error(`Duplicate migration version ${version}.`);
    }
    versions.add(version);
  }

  return files.map((file) => {
    const absolutePath = join(migrationsDir, file);
    const sql = readFileSync(absolutePath, 'utf8');
    return {
      file,
      absolutePath,
      checksum: createHash('sha256').update(sql).digest('hex'),
    };
  });
}

function printStatus() {
  const migrations = listMigrationFiles();
  console.log(`Migration source: ${migrationsDir}`);
  console.log(`Migration count: ${migrations.length}`);
  for (const migration of migrations) {
    console.log(`${migration.file} ${migration.checksum}`);
  }
}

async function prepareSupabaseWorkDir(migrations) {
  rmSync(workDir, { force: true, recursive: true });
  mkdirSync(supabaseMigrationsDir, { recursive: true });
  writeFileSync(join(supabaseWorkDir, 'config.toml'), 'project_id = "refcheckid"\n');

  for (const migration of migrations) {
    await copyFile(migration.absolutePath, join(supabaseMigrationsDir, migration.file));
  }
}

function migrate({ dryRun }) {
  const migrations = listMigrationFiles();
  if (dryRun) {
    console.log(`Dry run: ${migrations.length} migrations are valid and ready for Supabase CLI.`);
    return;
  }

  const databaseUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('Set SUPABASE_DB_URL or DATABASE_URL before running pnpm migrate.');
  }

  const supabase = findExecutable('supabase');
  if (supabase === null) {
    throw new Error('Supabase CLI is required for pnpm migrate but was not found in PATH.');
  }

  const prepare = spawnSync(process.execPath, [new URL(import.meta.url).pathname, 'prepare'], {
    encoding: 'utf8',
  });
  if (prepare.status !== 0) {
    throw new Error(
      prepare.stderr || prepare.stdout || 'Failed to prepare Supabase migration workdir.',
    );
  }

  const result = spawnSync(supabase, ['db', 'push', '--db-url', databaseUrl, '--include-all'], {
    cwd: workDir,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function rollback() {
  throw new Error(
    'Rollback is intentionally not automated. RefCheckID migrations are forward-only; create a new corrective migration instead.',
  );
}

function findExecutable(name) {
  const pathValue = process.env.PATH ?? '';
  const pathExt =
    process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM') : '';
  const extensions = process.platform === 'win32' ? pathExt.split(';') : [''];

  for (const directory of pathValue.split(process.platform === 'win32' ? ';' : ':')) {
    if (directory === '') continue;
    for (const extension of extensions) {
      const candidate = join(directory, `${name}${extension.toLowerCase()}`);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Keep searching PATH.
      }
    }
  }

  return null;
}

function fail(message) {
  console.error(`[refcheckid:migrate] ${message}`);
  process.exit(1);
}
