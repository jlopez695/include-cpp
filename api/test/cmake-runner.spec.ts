import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runCmake, mirrorDir } from '../src/execution/cmake-runner.js';
import { PROBLEMS_DIR, BUILD_ROOT } from '../src/common/paths.js';
import type { StreamEvent } from '../src/execution/event-emitter.js';

/**
 * Recursively collect every regular file under `root`, returning a map of
 * relative path → byte buffer. Symlinks are dereferenced as fs.readFile would.
 */
async function snapshotTree(root: string): Promise<Map<string, Buffer>> {
  const snap = new Map<string, Buffer>();
  async function walk(dir: string, prefix: string): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = prefix ? path.join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) {
        await walk(abs, rel);
      } else if (entry.isFile()) {
        snap.set(rel, await fs.promises.readFile(abs));
      }
    }
  }
  await walk(root, '');
  return snap;
}

function assertSameTree(before: Map<string, Buffer>, after: Map<string, Buffer>, ctx: string): void {
  const extras = [...after.keys()].filter(k => !before.has(k));
  const missing = [...before.keys()].filter(k => !after.has(k));
  assert.deepEqual(extras, [], `${ctx}: unexpected files appeared in canonical dir: ${extras.join(', ')}`);
  assert.deepEqual(missing, [], `${ctx}: canonical files vanished: ${missing.join(', ')}`);
  for (const [rel, beforeBuf] of before) {
    const afterBuf = after.get(rel)!;
    assert.ok(
      beforeBuf.equals(afterBuf),
      `${ctx}: canonical file ${rel} was mutated by runCmake`,
    );
  }
}

const BROKEN_FINAL = `// this file should never reach the canonical problems/ dir
#include <iostream>
void final() { this is deliberately not valid C++; }
`;

test('runCmake: canonical problems/<id>/ is byte-identical after a (failing) run', async () => {
  const problemDir = path.join(PROBLEMS_DIR, 'POTD64');
  const before = await snapshotTree(problemDir);

  const events: StreamEvent[] = [];
  const ctrl = new AbortController();
  await runCmake(
    'POTD64',
    { 'src/final.cpp': BROKEN_FINAL },
    'test',
    e => events.push(e),
    ctrl.signal,
    'regression-canonical-immutable',
  );

  const after = await snapshotTree(problemDir);
  assertSameTree(before, after, 'after single broken run');

  // Sanity: staging dir was the actual write target.
  const stagingFinal = path.join(BUILD_ROOT, 'regression-canonical-immutable', 'POTD64', 'src', 'src', 'final.cpp');
  if (fs.existsSync(stagingFinal)) {
    const staged = await fs.promises.readFile(stagingFinal, 'utf8');
    assert.equal(staged, BROKEN_FINAL, 'user code should be staged into per-user src tree');
  }
});

test('runCmake: two concurrent users on the same problem do not corrupt canonical files', async () => {
  const problemDir = path.join(PROBLEMS_DIR, 'POTD64');
  const before = await snapshotTree(problemDir);

  const aCode = `// user A\n#include <iostream>\nvoid final() { still broken A; }\n`;
  const bCode = `// user B\n#include <iostream>\nvoid final() { still broken B; }\n`;

  const ctrlA = new AbortController();
  const ctrlB = new AbortController();
  const [, ] = await Promise.all([
    runCmake('POTD64', { 'src/final.cpp': aCode }, 'test', () => {}, ctrlA.signal, 'race-user-a'),
    runCmake('POTD64', { 'src/final.cpp': bCode }, 'test', () => {}, ctrlB.signal, 'race-user-b'),
  ]);

  const after = await snapshotTree(problemDir);
  assertSameTree(before, after, 'after concurrent runs');

  // Each user's staging tree should hold *their own* code, not the other's.
  const aStaged = path.join(BUILD_ROOT, 'race-user-a', 'POTD64', 'src', 'src', 'final.cpp');
  const bStaged = path.join(BUILD_ROOT, 'race-user-b', 'POTD64', 'src', 'src', 'final.cpp');
  if (fs.existsSync(aStaged)) {
    assert.equal(await fs.promises.readFile(aStaged, 'utf8'), aCode, "user A's staging dir must hold A's code");
  }
  if (fs.existsSync(bStaged)) {
    assert.equal(await fs.promises.readFile(bStaged, 'utf8'), bCode, "user B's staging dir must hold B's code");
  }
});

test('mirrorDir: makes dest content-identical to src, prunes extras, preserves mtime when bytes match', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mirror-test-'));
  const src = path.join(root, 'src');
  const dest = path.join(root, 'dest');
  await fs.promises.mkdir(path.join(src, 'sub'), { recursive: true });
  await fs.promises.writeFile(path.join(src, 'a.txt'), 'AAA');
  await fs.promises.writeFile(path.join(src, 'sub', 'b.txt'), 'BBB');

  // Pre-populate dest with: an identical file (mtime must survive),
  // a divergent file (must be overwritten), and a stale extra (must be pruned).
  await fs.promises.mkdir(path.join(dest, 'sub'), { recursive: true });
  await fs.promises.writeFile(path.join(dest, 'a.txt'), 'AAA');
  await fs.promises.writeFile(path.join(dest, 'sub', 'b.txt'), 'OLD');
  await fs.promises.writeFile(path.join(dest, 'stale.txt'), 'should-be-gone');
  await fs.promises.mkdir(path.join(dest, 'stale-dir'), { recursive: true });
  await fs.promises.writeFile(path.join(dest, 'stale-dir', 'x'), 'x');

  const mtimeBefore = (await fs.promises.stat(path.join(dest, 'a.txt'))).mtimeMs;
  // Force a small delay so any rewrite would visibly change mtime.
  await new Promise(r => setTimeout(r, 10));

  await mirrorDir(src, dest);

  assert.equal(await fs.promises.readFile(path.join(dest, 'a.txt'), 'utf8'), 'AAA');
  assert.equal(await fs.promises.readFile(path.join(dest, 'sub', 'b.txt'), 'utf8'), 'BBB');
  assert.equal(fs.existsSync(path.join(dest, 'stale.txt')), false, 'stale file must be pruned');
  assert.equal(fs.existsSync(path.join(dest, 'stale-dir')), false, 'stale dir must be pruned');

  const mtimeAfter = (await fs.promises.stat(path.join(dest, 'a.txt'))).mtimeMs;
  assert.equal(mtimeAfter, mtimeBefore, 'identical-content file must keep its mtime so incremental builds stay valid');

  await fs.promises.rm(root, { recursive: true, force: true });
});

test('mirrorDir: dest does not exist yet → creates a full copy', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mirror-fresh-'));
  const src = path.join(root, 'src');
  const dest = path.join(root, 'dest');
  await fs.promises.mkdir(path.join(src, 'nested'), { recursive: true });
  await fs.promises.writeFile(path.join(src, 'a.txt'), 'A');
  await fs.promises.writeFile(path.join(src, 'nested', 'b.txt'), 'B');

  await mirrorDir(src, dest);

  assert.equal(await fs.promises.readFile(path.join(dest, 'a.txt'), 'utf8'), 'A');
  assert.equal(await fs.promises.readFile(path.join(dest, 'nested', 'b.txt'), 'utf8'), 'B');

  await fs.promises.rm(root, { recursive: true, force: true });
});
