/**
 * Regression test for "ensureCTestFile writes absolute paths into the
 * generated CTestTestfile.cmake".
 *
 * CTest resolves include() relative to the including file's directory.
 * The generated CTestTestfile.cmake lives in buildDir and so do the
 * `*_include.cmake` files it references, so a bare filename is the
 * canonical form. The earlier implementation embedded the absolute path
 * via `path.join(buildDir, f)`; that coupled the generated file to its
 * own location and would break if buildDir ever moved or contained
 * shell-metacharacter unsafe chars. This pins the fix so a refactor
 * doesn't reintroduce the absolute-path form.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ensureCTestFile } from '../src/execution/cmake-runner.js';

describe('ensureCTestFile', () => {
  let buildDir: string;
  before(async () => {
    buildDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ensure-ctest-'));
  });
  after(async () => {
    await fs.promises.rm(buildDir, { recursive: true, force: true });
  });

  it('writes bare-filename include() lines, not absolute paths', async () => {
    // Stage two synthetic catch_discover_tests output files. ensureCTestFile
    // should pick them up via the `*_include.cmake` suffix filter.
    await fs.promises.writeFile(path.join(buildDir, 'foo_include.cmake'), '# stub');
    await fs.promises.writeFile(path.join(buildDir, 'bar_include.cmake'), '# stub');

    await ensureCTestFile(buildDir);

    const contents = await fs.promises.readFile(
      path.join(buildDir, 'CTestTestfile.cmake'),
      'utf8',
    );

    // Each include must be a bare filename — no absolute path, no leading
    // slash, no buildDir prefix.
    assert.match(contents, /include\("foo_include\.cmake"\)/);
    assert.match(contents, /include\("bar_include\.cmake"\)/);
    assert.doesNotMatch(
      contents,
      new RegExp(`include\\("${buildDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`),
      'CTestTestfile.cmake must not contain absolute include() paths rooted at buildDir',
    );
    assert.doesNotMatch(
      contents,
      /include\("\/[^"]+_include\.cmake"\)/,
      'CTestTestfile.cmake must not contain include() paths starting with /',
    );
  });

  it('is a no-op when CTestTestfile.cmake already exists', async () => {
    const existing = path.join(buildDir, 'CTestTestfile.cmake');
    const existingContents = await fs.promises.readFile(existing, 'utf8');

    // Add another *_include.cmake to see whether a re-run rewrites the file.
    await fs.promises.writeFile(path.join(buildDir, 'baz_include.cmake'), '# stub');
    await ensureCTestFile(buildDir);

    const after = await fs.promises.readFile(existing, 'utf8');
    assert.equal(after, existingContents, 'must not overwrite an existing CTestTestfile.cmake');
  });

  it('is a no-op when no *_include.cmake files exist', async () => {
    const isolated = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ensure-ctest-empty-'));
    try {
      await ensureCTestFile(isolated);
      assert.equal(
        fs.existsSync(path.join(isolated, 'CTestTestfile.cmake')),
        false,
        'must not write CTestTestfile.cmake when there is nothing to include',
      );
    } finally {
      await fs.promises.rm(isolated, { recursive: true, force: true });
    }
  });
});
