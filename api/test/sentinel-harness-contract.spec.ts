/**
 * The sentinel token is a contract between two files in different
 * languages: problems/_shared/grader_harness.h prints it from C++, and
 * api/src/execution/sentinel.ts matches it with a regex. Nothing makes
 * them agree except that both spell it the same way.
 *
 * Renaming one side only is silent and total: the harness still runs and
 * the student still sees their own stdout, but no line matches, so the
 * API reports 0/0 passed for a fully correct solution and the raw
 * sentinel text leaks into the output panel. No existing test catches
 * that, because the parser tests feed the parser strings written in the
 * test file rather than anything the harness produced.
 *
 * This pins the token itself across both files.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(import.meta.dirname, '..', '..');
const harness = fs.readFileSync(
  path.join(repoRoot, 'problems', '_shared', 'grader_harness.h'),
  'utf8',
);
const parser = fs.readFileSync(
  path.join(repoRoot, 'api', 'src', 'execution', 'sentinel.ts'),
  'utf8',
);

test('harness printf tokens and parser regex token are the same string', () => {
  // What the harness actually prints, from its printf format strings.
  const emitted = new Set(
    [...harness.matchAll(/std::printf\("<<<([A-Z-]+?)-(TEST|RESULT)\s/g)].map(m => m[1]),
  );
  assert.ok(emitted.size > 0, 'could not find any sentinel printf in grader_harness.h');
  assert.equal(
    emitted.size,
    1,
    `grader_harness.h prints more than one sentinel prefix: ${[...emitted].join(', ')}`,
  );
  const harnessToken = [...emitted][0]!;

  // What the parser matches.
  const parsed = new Set([...parser.matchAll(/<<<([A-Z-]+?)-\(\?:?\(?TEST/g)].map(m => m[1]));
  assert.ok(parsed.size > 0, 'could not find the sentinel regex in sentinel.ts');
  assert.equal(
    parsed.size,
    1,
    `sentinel.ts matches more than one sentinel prefix: ${[...parsed].join(', ')}`,
  );
  const parserToken = [...parsed][0]!;

  assert.equal(
    parserToken,
    harnessToken,
    `grader_harness.h prints <<<${harnessToken}-...>>> but sentinel.ts matches <<<${parserToken}-...>>>. Nothing else enforces this, so a one-sided rename makes every run report 0/0 passed and leaks the raw sentinel into user output.`,
  );
});
