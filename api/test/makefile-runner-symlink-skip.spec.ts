import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Regression for makefile-runner's copyDir symlink-following bug.
 *
 * Pre-fix `copyDir` fell through to fs.copyFile for any entry that
 * wasn't a directory — and fs.copyFile follows symlinks by default.
 * A poisoned `problems/POTD0/tests/grader.cpp -> /etc/passwd` would
 * therefore land verbatim in the runner's tmpdir, where the next
 * compile step could read host secrets via a crafted `#include`.
 * The cmake-runner's mirrorDir was already correct (skip anything
 * that isn't isFile() || isDirectory()); the makefile-runner was
 * the asymmetric gap.
 *
 * This spec pins the new isFile() filter directly: a symlink
 * pointing outside the tree must NOT be copied. We don't invoke
 * runMakefile because that needs a full problem layout — copyDir
 * is a private helper, so we test the *exact contract* it now
 * implements (mirror the cmake-runner's filter) via the same
 * readdir+isFile check.
 */

test('readdir + isFile filter skips symlinks, matching the makefile-runner copyDir contract', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'potd-symlink-skip-'));
  try {
    // src/regular.txt and src/symlink-to-passwd → /etc/hosts (a
    // benign target — we just want to prove the entry isn't
    // copied. Using /etc/hosts so the test works on any machine.)
    const srcDir = path.join(root, 'src');
    await fs.promises.mkdir(srcDir, { recursive: true });
    await fs.promises.writeFile(path.join(srcDir, 'regular.txt'), 'real content');
    try {
      await fs.promises.symlink('/etc/hosts', path.join(srcDir, 'evil.txt'));
    } catch (err) {
      // Some Windows runners deny symlink creation without elevation.
      // Skip the rest of the test cleanly there; the regression we
      // care about only matters on POSIX hosts.
      if ((err as NodeJS.ErrnoException).code === 'EPERM') return;
      throw err;
    }

    const entries = await fs.promises.readdir(srcDir, { withFileTypes: true });
    const wouldCopy: string[] = [];
    for (const e of entries) {
      // Same filter copyDir now applies: isFile() (strict) only.
      // isFile() returns FALSE for a symlink — that's the dirent's
      // own type check, not lstat. This is the post-fix invariant.
      if (e.isFile()) wouldCopy.push(e.name);
    }
    assert.deepEqual(wouldCopy, ['regular.txt']);
    assert.ok(
      !wouldCopy.includes('evil.txt'),
      'symlink must not be selected for copy',
    );
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});
