import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regression test for the "editor goes blank on tab switch" bug.
 *
 * useMonacoModels declares `disposeAll` as a fresh inner function each render.
 * If that function is added to the dep array of the unmount cleanup useEffect,
 * its identity changes every render → cleanup runs every render → every Monaco
 * model is disposed → the editor appears blank after any state change (like
 * switching tabs). This test pins the dep array to empty so the cleanup only
 * fires on unmount.
 */
describe('useMonacoModels lifecycle', () => {
  let source: string;

  before(() => {
    source = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'hooks', 'useMonacoModels.ts'),
      'utf8',
    );
  });

  it('disposeAll cleanup useEffect uses an empty dependency array', () => {
    // Match: useEffect(() => () => disposeAll(), [<deps>]);
    const match = source.match(
      /useEffect\(\s*\(\)\s*=>\s*\(\)\s*=>\s*disposeAll\(\),\s*\[([^\]]*)\]\s*\)/,
    );
    assert.ok(
      match,
      'Expected a useEffect(() => () => disposeAll(), [...]) call in useMonacoModels',
    );
    const deps = match![1].trim();
    assert.equal(
      deps,
      '',
      `disposeAll cleanup must use [] deps — got [${deps}]. ` +
        `A non-empty dep array disposes all Monaco models on every re-render, ` +
        `blanking the editor when switching tabs.`,
    );
  });

  it('does not list disposeAll in any useEffect dependency array', () => {
    // Catch refactors that move disposeAll into another effect's deps.
    const effectDeps = [...source.matchAll(/useEffect\([\s\S]*?,\s*\[([^\]]*)\]\s*\)/g)];
    for (const m of effectDeps) {
      const deps = m[1];
      assert.ok(
        !/\bdisposeAll\b/.test(deps),
        `disposeAll appears in a useEffect dep array; it is recreated each ` +
          `render and will cause runaway cleanup-then-rerun cycles. Use refs ` +
          `instead.`,
      );
    }
  });
});
