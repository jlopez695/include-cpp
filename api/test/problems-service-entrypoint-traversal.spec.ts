/**
 * Regression test for "validateMetaShape doesn't check meta.json path
 * fields for traversal, so a hostile-contributor PR could land a
 * poisoned meta.json that escapes the problem directory at boot".
 *
 * Pre-fix validateMetaShape (api/src/problems/problems.service.ts)
 * type-checked `entrypoint`, `editableFiles`, and `readOnlyFiles` but
 * did not validate the *content* of the strings. Three downstream
 * sinks were reachable from a poisoned meta.json:
 *
 *   1. `entrypoint` → cmake-runner.findRunnableBinary does
 *      path.join(buildDir, entrypoint) and then stat + access(X_OK).
 *      `entrypoint: "../../bin/sh"` joins upward to /bin/sh, passes
 *      both checks, and runExecutable spawns it under ulimit with
 *      cwd=buildDir.
 *   2. `editableFiles` entries → readDetailFromDisk does
 *      fs.readFileSync(path.join(problemDir, filename), 'utf8') at
 *      boot. `editableFiles: ["../../etc/passwd"]` reads host files
 *      into the detail cache and surfaces them via /problems/:id.
 *   3. `readOnlyFiles` entries → same readProblemFile call via
 *      readOnlyFiles_content. Same exfiltration vector.
 *
 * Threat model: a hostile-contributor PR (not a user request — the
 * /run path is gated by validateRunRequest's editableFiles allowlist).
 * Realistic for a community-contributed POTD corpus that takes PRs
 * from students.
 *
 * Fix: assertBareFilename rejects leading '/', any '..' substring, and
 * NUL bytes. Applied to entrypoint plus every editableFiles /
 * readOnlyFiles entry inside validateMetaShape, so every cache-miss
 * path (boot populateCache, list, detail, readMeta) gets the same
 * descriptive throw naming the problem id, the field, and the bad
 * value.
 */
import 'reflect-metadata';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProblemsService } from '../src/problems/problems.service.js';

function writeProblem(root: string, id: string, files: Record<string, string>): void {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
}

describe('ProblemsService meta.json path-traversal rejection', () => {
  let tmpRoot: string;

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cpp-svc-traversal-'));

    // GOOD baseline. Used to prove the validator still accepts well-
    // formed meta.json after the new checks land. Mirrors a real
    // makefile-shaped problem.
    writeProblem(tmpRoot, 'AAA_GOOD', {
      'meta.json': JSON.stringify({
        title: 'Good Problem',
        buildType: 'makefile',
        editableFiles: ['main.cpp'],
        readOnlyFiles: ['helper.h'],
        entrypoint: 'main',
      }),
      'problem.md': '# Good',
      'main.cpp': 'int main(){}',
      'helper.h': '// helper',
    });

    // GOOD baseline #2: a subdirectory-scoped editableFile (legitimate;
    // POTD64 uses src/final.cpp). The check rejects '..' substrings,
    // NOT forward slashes — pin that intentional distinction.
    writeProblem(tmpRoot, 'AAB_SUBDIR_OK', {
      'meta.json': JSON.stringify({
        title: 'Subdir OK',
        buildType: 'cmake',
        editableFiles: ['src/final.cpp'],
        readOnlyFiles: ['entry/main.cpp'],
        entrypoint: 'main',
      }),
      'problem.md': '# subdir',
    });
    fs.mkdirSync(path.join(tmpRoot, 'AAB_SUBDIR_OK', 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'AAB_SUBDIR_OK', 'entry'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'AAB_SUBDIR_OK', 'src', 'final.cpp'), '// ok');
    fs.writeFileSync(path.join(tmpRoot, 'AAB_SUBDIR_OK', 'entry', 'main.cpp'), '// ok');

    // BAD: absolute-path entrypoint. Pre-fix path.join(buildDir, "/bin/sh")
    // returned "/bin/sh" verbatim and findRunnableBinary stat+access'd
    // /bin/sh successfully.
    writeProblem(tmpRoot, 'BBB_ENTRY_ABSOLUTE', {
      'meta.json': JSON.stringify({
        title: 'Abs entry',
        buildType: 'makefile',
        editableFiles: ['main.cpp'],
        readOnlyFiles: [],
        entrypoint: '/bin/sh',
      }),
      'problem.md': '# x',
      'main.cpp': 'int main(){}',
    });

    // BAD: parent-traversal entrypoint. Pre-fix path.join(buildDir,
    // "../../bin/sh") resolved to /bin/sh (or wherever the relative
    // climb landed) and the spawn succeeded.
    writeProblem(tmpRoot, 'CCC_ENTRY_PARENT', {
      'meta.json': JSON.stringify({
        title: 'Parent entry',
        buildType: 'makefile',
        editableFiles: ['main.cpp'],
        readOnlyFiles: [],
        entrypoint: '../../bin/sh',
      }),
      'problem.md': '# x',
      'main.cpp': 'int main(){}',
    });

    // BAD: NUL byte in entrypoint. Most downstream C path consumers
    // truncate at the first NUL, so "main\0../../sh" would stat as
    // "main" (passing the access check) and then exec something else
    // depending on the kernel/libc path-handling shape. Reject early.
    writeProblem(tmpRoot, 'DDD_ENTRY_NUL', {
      'meta.json': JSON.stringify({
        title: 'NUL entry',
        buildType: 'makefile',
        editableFiles: ['main.cpp'],
        readOnlyFiles: [],
        entrypoint: 'main\0../../sh',
      }),
      'problem.md': '# x',
      'main.cpp': 'int main(){}',
    });

    // BAD: editableFiles entry escapes upward. The boot-time
    // readProblemFile would have read /etc/passwd-equivalent content
    // into the detail cache.
    writeProblem(tmpRoot, 'EEE_EDITABLE_PARENT', {
      'meta.json': JSON.stringify({
        title: 'Editable parent',
        buildType: 'makefile',
        editableFiles: ['../../../etc/passwd'],
        readOnlyFiles: [],
        entrypoint: 'main',
      }),
      'problem.md': '# x',
    });

    // BAD: absolute-path editableFiles entry. path.join(problemDir,
    // "/etc/passwd") returns "/etc/passwd" verbatim, so readFileSync
    // would have hit the host file.
    writeProblem(tmpRoot, 'FFF_EDITABLE_ABSOLUTE', {
      'meta.json': JSON.stringify({
        title: 'Editable absolute',
        buildType: 'makefile',
        editableFiles: ['/etc/passwd'],
        readOnlyFiles: [],
        entrypoint: 'main',
      }),
      'problem.md': '# x',
    });

    // BAD: readOnlyFiles entry with parent traversal — same vector as
    // editableFiles, different field.
    writeProblem(tmpRoot, 'GGG_READONLY_PARENT', {
      'meta.json': JSON.stringify({
        title: 'ReadOnly parent',
        buildType: 'makefile',
        editableFiles: ['main.cpp'],
        readOnlyFiles: ['../../../etc/passwd'],
        entrypoint: 'main',
      }),
      'problem.md': '# x',
      'main.cpp': 'int main(){}',
    });
  });

  after(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('populateCache does not throw on meta.json with traversal fields — they get logged and skipped', () => {
    // Same coherence guarantee the rest of validateMetaShape provides:
    // a single bad problem must not crash boot.
    const svc = new ProblemsService();
    svc.setProblemsDirForTesting(tmpRoot);
    assert.doesNotThrow(() => svc.onModuleInit());
  });

  it('list() keeps only the two safe problems; the five bad ones are skipped', () => {
    const svc = new ProblemsService();
    svc.setProblemsDirForTesting(tmpRoot);
    svc.onModuleInit();
    const ids = svc.list().map(p => p.id).sort();
    assert.deepEqual(ids, ['AAA_GOOD', 'AAB_SUBDIR_OK']);
  });

  it('detail() on a cache-miss for absolute-path entrypoint throws naming the problem id, the field, and the value', () => {
    const fresh = new ProblemsService();
    fresh.setProblemsDirForTesting(tmpRoot);
    assert.throws(
      () => fresh.detail('BBB_ENTRY_ABSOLUTE'),
      err =>
        err instanceof Error
        && /BBB_ENTRY_ABSOLUTE/.test(err.message)
        && /entrypoint/.test(err.message)
        && /\/bin\/sh/.test(err.message),
    );
  });

  it('detail() on a cache-miss for parent-traversal entrypoint throws naming the field', () => {
    const fresh = new ProblemsService();
    fresh.setProblemsDirForTesting(tmpRoot);
    assert.throws(
      () => fresh.detail('CCC_ENTRY_PARENT'),
      err =>
        err instanceof Error
        && /CCC_ENTRY_PARENT/.test(err.message)
        && /entrypoint/.test(err.message)
        && /\.\.\/\.\.\/bin\/sh/.test(err.message),
    );
  });

  it('detail() on a cache-miss for NUL-byte entrypoint throws naming the field', () => {
    const fresh = new ProblemsService();
    fresh.setProblemsDirForTesting(tmpRoot);
    assert.throws(
      () => fresh.detail('DDD_ENTRY_NUL'),
      err =>
        err instanceof Error
        && /DDD_ENTRY_NUL/.test(err.message)
        && /entrypoint/.test(err.message),
    );
  });

  it('detail() on a cache-miss for parent-traversal editableFiles throws naming the field', () => {
    const fresh = new ProblemsService();
    fresh.setProblemsDirForTesting(tmpRoot);
    assert.throws(
      () => fresh.detail('EEE_EDITABLE_PARENT'),
      err =>
        err instanceof Error
        && /EEE_EDITABLE_PARENT/.test(err.message)
        && /editableFiles/.test(err.message),
    );
  });

  it('detail() on a cache-miss for absolute-path editableFiles throws naming the field', () => {
    const fresh = new ProblemsService();
    fresh.setProblemsDirForTesting(tmpRoot);
    assert.throws(
      () => fresh.detail('FFF_EDITABLE_ABSOLUTE'),
      err =>
        err instanceof Error
        && /FFF_EDITABLE_ABSOLUTE/.test(err.message)
        && /editableFiles/.test(err.message)
        && /\/etc\/passwd/.test(err.message),
    );
  });

  it('detail() on a cache-miss for parent-traversal readOnlyFiles throws naming the field', () => {
    const fresh = new ProblemsService();
    fresh.setProblemsDirForTesting(tmpRoot);
    assert.throws(
      () => fresh.detail('GGG_READONLY_PARENT'),
      err =>
        err instanceof Error
        && /GGG_READONLY_PARENT/.test(err.message)
        && /readOnlyFiles/.test(err.message),
    );
  });

  it('subdirectory-scoped entries (POTD64-style "src/final.cpp") are still accepted', () => {
    // Pin the intentional distinction: forward slashes inside a relative
    // path are fine. The check only rejects leading '/', '..', and NUL.
    const svc = new ProblemsService();
    svc.setProblemsDirForTesting(tmpRoot);
    svc.onModuleInit();
    const d = svc.detail('AAB_SUBDIR_OK');
    assert.equal(d.title, 'Subdir OK');
    assert.deepEqual(d.editableFiles, ['src/final.cpp']);
  });

  it('happy path is unaffected', () => {
    const svc = new ProblemsService();
    svc.setProblemsDirForTesting(tmpRoot);
    svc.onModuleInit();
    const d = svc.detail('AAA_GOOD');
    assert.equal(d.title, 'Good Problem');
    assert.deepEqual(d.editableFiles, ['main.cpp']);
  });
});
