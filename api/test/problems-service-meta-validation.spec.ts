import 'reflect-metadata';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProblemsService } from '../src/problems/problems.service.js';

/**
 * Regression tests for ProblemsService meta-shape validation.
 *
 * The boot-time resilience suite covers the "meta.json is not valid JSON"
 * case — JSON.parse throws, the per-problem try/catch in populateCache
 * catches it, the problem is skipped. But there was a second class of
 * corruption that *parsed* successfully and slipped past the cast: a
 * meta.json with the wrong shape. `JSON.parse(raw) as Meta` is a
 * compile-time lie, so a stored editableFiles: "main.cpp" (string
 * instead of string[]) flowed straight into readDetailFromDisk's
 * `for (const filename of meta.editableFiles)` loop, which iterates a
 * string character-by-character ("m", "a", "i", "n", ".", ...) and
 * fired readProblemFile with each character as a filename.
 *
 * The user-visible failure mode: an opaque 500 with `ENOENT 'm'` on
 * the detail() cache-miss path, no problem id in the message. With
 * buildType wrong or missing, the failure surfaced later in
 * execution.service.ts at run time, even further from the cause.
 *
 * Fix: validateMetaShape runs *inside* readMetaFromDisk after
 * JSON.parse, so every code path that calls readMetaFromDisk (boot
 * populateCache, list cache miss, detail cache miss, readMeta cache
 * miss) gets the same coherent error message naming the problem id
 * and the offending field.
 */

function writeProblem(root: string, id: string, files: Record<string, string>): void {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
}

describe('ProblemsService meta.json shape validation', () => {
  let tmpRoot: string;

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cpp-svc-meta-validation-'));

    // GOOD baseline — kept in the set so we can prove the bad ones are
    // skipped while the good one survives.
    writeProblem(tmpRoot, 'AAA_GOOD', {
      'meta.json': JSON.stringify({
        title: 'Good Problem',
        buildType: 'makefile',
        editableFiles: ['main.cpp'],
        readOnlyFiles: [],
        entrypoint: 'main',
      }),
      'problem.md': '# Good',
      'main.cpp': 'int main(){}',
    });

    // BAD: editableFiles is a string. Old behavior iterated character-
    // by-character and threw ENOENT 'm' on the cache-miss path.
    writeProblem(tmpRoot, 'BBB_EDITABLES_STRING', {
      'meta.json': JSON.stringify({
        title: 'X',
        buildType: 'makefile',
        editableFiles: 'main.cpp',
        readOnlyFiles: [],
        entrypoint: 'main',
      }),
      'problem.md': '# x',
      'main.cpp': 'int main(){}',
    });

    // BAD: missing buildType. Old behavior carried `undefined` into
    // execution.service.ts where the build-dispatch fell through to an
    // opaque error far from the root cause.
    writeProblem(tmpRoot, 'CCC_NO_BUILDTYPE', {
      'meta.json': JSON.stringify({
        title: 'X',
        editableFiles: ['main.cpp'],
        readOnlyFiles: [],
        entrypoint: 'main',
      }),
      'problem.md': '# x',
      'main.cpp': 'int main(){}',
    });

    // BAD: buildType is a value not in the BuildType union.
    writeProblem(tmpRoot, 'DDD_BAD_BUILDTYPE', {
      'meta.json': JSON.stringify({
        title: 'X',
        buildType: 'invalid',
        editableFiles: ['main.cpp'],
        readOnlyFiles: [],
        entrypoint: 'main',
      }),
      'problem.md': '# x',
      'main.cpp': 'int main(){}',
    });

    // BAD: editableFiles is an array but contains a non-string.
    // The downstream loop's `for (const filename of meta.editableFiles)`
    // would land 42 in filename and readFileSync would throw on the
    // path concatenation.
    writeProblem(tmpRoot, 'EEE_EDITABLE_NUMBER', {
      'meta.json': JSON.stringify({
        title: 'X',
        buildType: 'cmake',
        editableFiles: ['main.cpp', 42],
        readOnlyFiles: [],
        entrypoint: 'main',
      }),
      'problem.md': '# x',
      'main.cpp': 'int main(){}',
    });

    // BAD: title is missing.
    writeProblem(tmpRoot, 'FFF_NO_TITLE', {
      'meta.json': JSON.stringify({
        buildType: 'makefile',
        editableFiles: ['main.cpp'],
        readOnlyFiles: [],
        entrypoint: 'main',
      }),
      'problem.md': '# x',
      'main.cpp': 'int main(){}',
    });

    // BAD: entrypoint is missing.
    writeProblem(tmpRoot, 'GGG_NO_ENTRYPOINT', {
      'meta.json': JSON.stringify({
        title: 'X',
        buildType: 'makefile',
        editableFiles: ['main.cpp'],
        readOnlyFiles: [],
      }),
      'problem.md': '# x',
      'main.cpp': 'int main(){}',
    });

    // GOOD: readOnlyFiles omitted (the runtime treats it as optional via
    // `meta.readOnlyFiles ?? []` even though the type marks it required).
    // Preserve the existing tolerance — if we tightened this here, we'd
    // break the existing AAA_GOOD-equivalent shape that some real
    // problems on disk use.
    writeProblem(tmpRoot, 'HHH_NO_READONLY', {
      'meta.json': JSON.stringify({
        title: 'Optional readOnly',
        buildType: 'cmake',
        editableFiles: ['main.cpp'],
        entrypoint: 'main',
      }),
      'problem.md': '# x',
      'main.cpp': 'int main(){}',
    });
  });

  after(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('populateCache does not throw on shape-mismatched meta.json', () => {
    const svc = new ProblemsService();
    svc.setProblemsDirForTesting(tmpRoot);
    assert.doesNotThrow(() => svc.onModuleInit());
  });

  it('list() omits problems with shape-mismatched meta.json', () => {
    const svc = new ProblemsService();
    svc.setProblemsDirForTesting(tmpRoot);
    svc.onModuleInit();
    const ids = svc.list().map(p => p.id).sort();
    assert.deepEqual(ids, ['AAA_GOOD', 'HHH_NO_READONLY']);
  });

  it('detail() on a cache-miss for editableFiles-as-string surfaces a clear, problem-named error (not ENOENT on a single character)', () => {
    // Use a fresh, unpopulated service so detail() goes straight to
    // readDetailFromDisk → readMetaFromDisk → validateMetaShape. This
    // mirrors what an HTTP request to /problems/:id would hit if the
    // problem wasn't in the boot cache.
    const fresh = new ProblemsService();
    fresh.setProblemsDirForTesting(tmpRoot);
    assert.throws(
      () => fresh.detail('BBB_EDITABLES_STRING'),
      err => err instanceof Error
        && /BBB_EDITABLES_STRING/.test(err.message)
        && /editableFiles/.test(err.message)
        // The pre-fix bug would have surfaced as ENOENT on 'm' (the
        // first character of 'main.cpp'). Pin against regressing to
        // that confusing message.
        && !/ENOENT/.test(err.message),
    );
  });

  it('detail() on a cache-miss for missing buildType names the field', () => {
    const fresh = new ProblemsService();
    fresh.setProblemsDirForTesting(tmpRoot);
    assert.throws(
      () => fresh.detail('CCC_NO_BUILDTYPE'),
      err => err instanceof Error
        && /CCC_NO_BUILDTYPE/.test(err.message)
        && /buildType/.test(err.message),
    );
  });

  it('detail() on a cache-miss for invalid buildType names the field', () => {
    const fresh = new ProblemsService();
    fresh.setProblemsDirForTesting(tmpRoot);
    assert.throws(
      () => fresh.detail('DDD_BAD_BUILDTYPE'),
      err => err instanceof Error
        && /DDD_BAD_BUILDTYPE/.test(err.message)
        && /buildType/.test(err.message),
    );
  });

  it('detail() on a cache-miss for editableFiles containing a non-string names the field', () => {
    const fresh = new ProblemsService();
    fresh.setProblemsDirForTesting(tmpRoot);
    assert.throws(
      () => fresh.detail('EEE_EDITABLE_NUMBER'),
      err => err instanceof Error
        && /EEE_EDITABLE_NUMBER/.test(err.message)
        && /editableFiles/.test(err.message),
    );
  });

  it('detail() on a cache-miss for missing title names the field', () => {
    const fresh = new ProblemsService();
    fresh.setProblemsDirForTesting(tmpRoot);
    assert.throws(
      () => fresh.detail('FFF_NO_TITLE'),
      err => err instanceof Error
        && /FFF_NO_TITLE/.test(err.message)
        && /title/.test(err.message),
    );
  });

  it('detail() on a cache-miss for missing entrypoint names the field', () => {
    const fresh = new ProblemsService();
    fresh.setProblemsDirForTesting(tmpRoot);
    assert.throws(
      () => fresh.detail('GGG_NO_ENTRYPOINT'),
      err => err instanceof Error
        && /GGG_NO_ENTRYPOINT/.test(err.message)
        && /entrypoint/.test(err.message),
    );
  });

  it('readOnlyFiles is treated as optional (omission is OK)', () => {
    const svc = new ProblemsService();
    svc.setProblemsDirForTesting(tmpRoot);
    svc.onModuleInit();
    const d = svc.detail('HHH_NO_READONLY');
    assert.equal(d.title, 'Optional readOnly');
    assert.deepEqual(d.readOnlyFiles_content, {});
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
