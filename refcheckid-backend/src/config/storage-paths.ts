import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let root = dirname(fileURLToPath(import.meta.url));
while (root !== dirname(root)) {
  const manifest = join(root, 'package.json');
  if (existsSync(manifest) && (JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string }).name === 'refcheckid-backend') break;
  root = dirname(root);
}
export const backendRoot = root;
export const storagePath = (name: string) => join(backendRoot, 'storage', name);
