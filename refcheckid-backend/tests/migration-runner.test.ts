import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const runner = join(process.cwd(), 'scripts/migrate.mjs');

describe('database migration runner', () => {
  it('lists canonical SQL migrations from database/migrations with checksums', () => {
    const output = execFileSync(process.execPath, [runner, 'status'], { encoding: 'utf8' });

    expect(output).toContain('Migration source:');
    expect(output).toContain('Migration count: 18');
    expect(output).toContain('0018_create_arch1_photo_model.sql');
  });

  it('validates migrations in dry-run mode without requiring database credentials', () => {
    const output = execFileSync(process.execPath, [runner, 'migrate', '--dry-run'], {
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: '', SUPABASE_DB_URL: '' },
    });

    expect(output).toContain('Dry run: 18 migrations are valid and ready for Supabase CLI.');
  });

  it('prepares a temporary Supabase CLI workdir from canonical migrations', () => {
    execFileSync(process.execPath, [runner, 'prepare'], { encoding: 'utf8' });

    const mirroredMigration = join(
      process.cwd(),
      '.tmp/supabase-migrations/supabase/migrations/0018_create_arch1_photo_model.sql',
    );
    expect(existsSync(mirroredMigration)).toBe(true);
    expect(readFileSync(mirroredMigration, 'utf8')).toContain('CREATE TABLE photo_subjects');
  });

  it('makes rollback policy explicit and non-destructive', () => {
    const result = spawnSync(process.execPath, [runner, 'rollback'], { encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Rollback is intentionally not automated');
  });
});
