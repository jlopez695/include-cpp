/**
 * Regression test for "dev server 500s with Module not found: Can't
 * resolve './markdown-pipeline.js'".
 *
 * web/lib/markdown-server.ts re-exported the pipeline as:
 *
 *   export { renderMarkdown } from './markdown-pipeline.js';
 *
 * The file on disk is markdown-pipeline.ts. TypeScript accepts the .js
 * spelling (tsconfig sets moduleResolution "bundler", which maps .js to
 * the .ts source), and node --test accepts it too because swc-node's
 * loader does the same substitution — which is why every test kept
 * passing while the app itself would not build. Turbopack resolves the
 * specifier literally, finds no markdown-pipeline.js, and fails the
 * whole route: every problem page returned a 500.
 *
 * Only app source is checked. test/ deliberately uses the .js spelling
 * throughout and is excluded from tsconfig — those files are run by
 * node --test and never enter a Turbopack graph.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const SOURCE_DIRS = ['lib', 'components', 'hooks', 'app'];

function sourceFiles(dir: string): string[] {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap(entry => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(entry.name) ? [rel] : [];
  });
}

test('app source has no relative .js imports that resolve to a .ts file', () => {
  const offenders: string[] = [];

  for (const rel of SOURCE_DIRS.flatMap(sourceFiles)) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const [, specifier] of src.matchAll(/from '(\.\.?\/[^']*\.js)'/g)) {
      const target = path.resolve(path.dirname(path.join(root, rel)), specifier);
      // A real .js file on disk is fine — Turbopack resolves it. The bug
      // is the .js spelling pointing at a .ts source.
      if (!fs.existsSync(target)) {
        offenders.push(`${rel} imports '${specifier}' (no such .js file)`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Turbopack resolves import specifiers literally, so a .js extension ` +
      `pointing at a .ts source breaks the build even though tsc and ` +
      `node --test both accept it. Drop the extension:\n${offenders.join('\n')}`,
  );
});
