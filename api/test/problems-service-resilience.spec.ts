import 'reflect-metadata';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProblemsService } from '../src/problems/problems.service.js';

/**
 * Regression tests for ProblemsService boot-time resilience.
 *
 * Before the guards landed, any malformed `meta.json` or any
 * `editableFiles` entry pointing at a file that wasn't on disk would
 * throw synchronously inside `populateCache()`. That ran in Nest's
 * `onModuleInit`, so a single broken problem took the entire API process
 * down at boot with an opaque stack (no problem id in the message). One
 * mis-typed manifest entry on a freshly-added problem could brick deploy
 * for every other problem in the corpus.
 *
 * The fixed behavior: per-problem failures are caught, logged with the
 * id, and the broken problem is omitted from list/detail caches. The
 * server boots; the broken problem returns 404 at request time.
 */

const VALID_META = JSON.stringify({
  title: 'Good Problem',
  buildType: 'makefile',
  editableFiles: ['main.cpp'],
  readOnlyFiles: [],
  entrypoint: 'main',
});

function writeProblem(root: string, id: string, files: Record<string, string>): void {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
}

describe('ProblemsService boot-time resilience', () => {
  let tmpRoot: string;

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cpp-svc-resilience-'));

    // GOOD: well-formed problem, all files present.
    writeProblem(tmpRoot, 'AAA_GOOD', {
      'meta.json': VALID_META,
      'problem.md': '# Good',
      'main.cpp': 'int main(){}',
    });

    // BAD #1: meta.json is not valid JSON.
    writeProblem(tmpRoot, 'BBB_BAD_JSON', {
      'meta.json': '{ this is not valid JSON',
      'problem.md': '# x',
      'main.cpp': 'int main(){}',
    });

    // BAD #2: meta.json references main.cpp but the file is absent.
    writeProblem(tmpRoot, 'CCC_MISSING_FILE', {
      'meta.json': VALID_META,
      'problem.md': '# x',
      // main.cpp intentionally absent
    });

    // BAD #3: meta.json + main.cpp present, but problem.md is absent.
    writeProblem(tmpRoot, 'DDD_MISSING_MD', {
      'meta.json': VALID_META,
      'main.cpp': 'int main(){}',
      // problem.md intentionally absent
    });

    // GOOD: a second well-formed problem so we can assert the cache
    // wasn't truncated by the failures (i.e. the loop didn't break on
    // the first throw).
    writeProblem(tmpRoot, 'EEE_GOOD', {
      'meta.json': VALID_META,
      'problem.md': '# Also good',
      'main.cpp': 'int main(){}',
    });
  });

  after(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('populateCache does not throw when a problem has malformed meta.json', () => {
    const svc = new ProblemsService();
    svc.setProblemsDirForTesting(tmpRoot);
    assert.doesNotThrow(() => svc.onModuleInit());
  });

  it('list() includes only the well-formed problems', () => {
    const svc = new ProblemsService();
    svc.setProblemsDirForTesting(tmpRoot);
    svc.onModuleInit();
    const ids = svc.list().map(p => p.id).sort();
    assert.deepEqual(ids, ['AAA_GOOD', 'EEE_GOOD']);
  });

  it('detail() throws NotFound for problems that failed to load', () => {
    const svc = new ProblemsService();
    svc.setProblemsDirForTesting(tmpRoot);
    svc.onModuleInit();
    // BBB_BAD_JSON, CCC_MISSING_FILE, DDD_MISSING_MD all failed → not in
    // detailCache → falls through to readDetailFromDisk, which re-raises
    // a descriptive error.
    assert.throws(() => svc.detail('BBB_BAD_JSON'), /BBB_BAD_JSON/);
    assert.throws(() => svc.detail('CCC_MISSING_FILE'), /main\.cpp/);
    assert.throws(() => svc.detail('DDD_MISSING_MD'), /problem\.md/);
  });

  it('detail() returns the good problems intact', () => {
    const svc = new ProblemsService();
    svc.setProblemsDirForTesting(tmpRoot);
    svc.onModuleInit();
    const good = svc.detail('AAA_GOOD');
    assert.equal(good.title, 'Good Problem');
    assert.equal(good.files['main.cpp'], 'int main(){}');
  });

  it('descriptive error names the offending problem and file', () => {
    const svc = new ProblemsService();
    svc.setProblemsDirForTesting(tmpRoot);
    svc.onModuleInit();
    // Direct, cache-bypassing assertion: a fresh service with no
    // populateCache (cache miss path) surfaces the same descriptive
    // message that the boot-time log saw.
    const fresh = new ProblemsService();
    fresh.setProblemsDirForTesting(tmpRoot);
    assert.throws(
      () => fresh.detail('CCC_MISSING_FILE'),
      err => err instanceof Error && /CCC_MISSING_FILE/.test(err.message) && /main\.cpp/.test(err.message),
    );
  });
});
