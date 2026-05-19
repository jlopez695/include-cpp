/**
 * Regression test for "POTD64 src/CMakeLists.txt add_library(src) lacks
 * the explicit STATIC keyword, so a global -DBUILD_SHARED_LIBS=ON flips
 * libsrc to SHARED and the run-time link silently breaks".
 *
 * CMake's `add_library(<name> <sources>)` resolves to STATIC when
 * BUILD_SHARED_LIBS is unset and SHARED when set. The parent
 * problems/POTD64/CMakeLists.txt does NOT set BUILD_SHARED_LIBS today,
 * so the bare form works. But:
 *   - A developer or CI invocation that adds `-DBUILD_SHARED_LIBS=ON`
 *     to test ABI behavior of *other* targets would silently switch
 *     libsrc to SHARED. Under SHARED the entry executables and the
 *     Catch2 test executable need an rpath into the build directory to
 *     resolve libsrc.so at run time. The cmake-runner harness spawns
 *     those executables under spawnLimited / `bash -c 'ulimit ...; exec
 *     <cmd>'` with no rpath inheritance — the load-time linker can't
 *     find libsrc.so and the run dies with an opaque dyld/ld.so error
 *     immediately after a clean `[100%] Built target` line.
 *   - The fix is to pin STATIC explicitly so this problem's link
 *     layout is invariant of any global BUILD_SHARED_LIBS toggle.
 *
 * Structural pin: assert the explicit STATIC keyword is present in
 * problems/POTD64/src/CMakeLists.txt. Cheap, catches a future "clean
 * up the CMakeLists, the keyword is implicit anyway" PR that strips
 * it back.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PROBLEMS_DIR } from '../src/common/paths.js';

describe('POTD64 src/CMakeLists.txt pins add_library(src) to STATIC', () => {
  let source: string;
  let srcCmakePath: string;
  before(() => {
    srcCmakePath = path.join(PROBLEMS_DIR, 'POTD64', 'src', 'CMakeLists.txt');
    source = fs.readFileSync(srcCmakePath, 'utf8');
  });

  it('add_library(src ...) declares the STATIC keyword explicitly', () => {
    // The keyword must appear between the `src` target name and the
    // sources variable. Allow any whitespace between them and any
    // sources expression (today the file globs into ${src_sources}).
    // Anchor on the open-paren + target name + STATIC so a stray
    // STATIC elsewhere in the file (e.g., a future comment block)
    // doesn't satisfy the assertion.
    assert.match(
      source,
      /add_library\(\s*src\s+STATIC\b/,
      `${path.relative(PROBLEMS_DIR, srcCmakePath)} must declare add_library(src STATIC ...) explicitly. The bare add_library(src ...) form silently flips to SHARED under a global -DBUILD_SHARED_LIBS=ON, which breaks the run-time link inside the cmake-runner harness (no rpath inheritance through spawnLimited).`,
    );
  });

  it('does NOT use the pre-fix bare `add_library(src ${...})` shape that defaults to BUILD_SHARED_LIBS', () => {
    // Reject any add_library(src ...) where the second token is NOT
    // STATIC/SHARED/MODULE/OBJECT/INTERFACE. The fix is specifically
    // about pinning the link type; the regression to guard against is
    // a refactor that drops the explicit keyword "because the default
    // works".
    const bareForm =
      /add_library\(\s*src\s+(?!STATIC\b|SHARED\b|MODULE\b|OBJECT\b|INTERFACE\b)\$\{/;
    assert.doesNotMatch(
      source,
      bareForm,
      'add_library(src ${...}) without an explicit link-type keyword silently inherits BUILD_SHARED_LIBS. Use add_library(src STATIC ${src_sources}) instead.',
    );
  });
});
