import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'scripts/demo-bootstrap.ts'), 'utf8');

describe('demo bootstrap photo preservation', () => {
  it('reuses an existing registration photo instead of replacing it with a generated placeholder', () => {
    const uploadFlow = source.slice(
      source.indexOf('async function uploadAndApproveDemoPhotos'),
      source.indexOf('async function completeMatchWorkflow'),
    );

    expect(uploadFlow).toContain('await registrationHasPhoto(');
    expect(uploadFlow).toContain('continue;');
    expect(uploadFlow.indexOf('await registrationHasPhoto(')).toBeLessThan(
      uploadFlow.indexOf('generateDemoPng('),
    );
    expect(source).toContain('reusedPhotos: dataset.photoPlan.length - uploadedPhotos');
  });
});
