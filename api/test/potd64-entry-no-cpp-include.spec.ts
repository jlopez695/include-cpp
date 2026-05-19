/**
 * Regression test for "POTD64/entry/main.cpp includes final.cpp as a
 * header, surviving only by accident of static-archive symbol
 * resolution".
 *
 * Pre-fix entry/main.cpp had `#include "final.cpp"`. The CMakeLists
 * compiles src/final.cpp into a static library `src` that the `main`
 * entry target links against, AND the textual include in main.cpp
 * defines final() inside main.o. The link only succeeds because GNU
 * ld pulls archive members lazily — main.o already provides final(),
 * so libsrc.a's final.o is skipped. Add any free function to
 * src/final.cpp and the next link breaks with a multiple-definition
 * error, blocking every student of POTD64.
 *
 * The fix replaces the include with a forward declaration. This
 * test pins the contract: an entry/*.cpp file in any POTD problem
 * (POTD64 today, future CMake problems tomorrow) must NEVER
 * `#include "..."` a sibling .cpp implementation file. System
 * headers (<...>) and real headers (.h/.hpp) stay legal.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PROBLEMS_DIR } from '../src/common/paths.js';

describe('entry/*.cpp files never include a sibling .cpp implementation file', () => {
  // Find every entry/*.cpp across the problem corpus.
  const entryFiles: { problem: string; filePath: string }[] = [];
  for (const id of fs.readdirSync(PROBLEMS_DIR)) {
    if (id.startsWith('_') || id.startsWith('.')) continue;
    const entryDir = path.join(PROBLEMS_DIR, id, 'entry');
    if (!fs.existsSync(entryDir)) continue;
    for (const file of fs.readdirSync(entryDir)) {
      if (file.endsWith('.cpp')) {
        entryFiles.push({ problem: id, filePath: path.join(entryDir, file) });
      }
    }
  }

  // Sanity: POTD64 has an entry/main.cpp today, so the audit set must
  // include it. A wrong PROBLEMS_DIR override would silently produce
  // zero entries and pass with no assertions — pin a floor.
  it('finds at least one entry/*.cpp file to audit (sanity floor)', () => {
    assert.ok(
      entryFiles.length >= 1,
      `expected ≥1 entry/*.cpp file under PROBLEMS_DIR (${PROBLEMS_DIR}); got 0`,
    );
    assert.ok(
      entryFiles.some(e => e.problem === 'POTD64'),
      'POTD64 must appear in the entry/*.cpp audit set (the original site of this bug)',
    );
  });

  for (const { problem, filePath } of entryFiles) {
    const rel = path.relative(PROBLEMS_DIR, filePath);
    const source = fs.readFileSync(filePath, 'utf8');

    it(`${rel}: no #include "*.cpp" lines`, () => {
      // Match `#include "...cpp"` ignoring leading whitespace. Allow
      // angle-bracket system headers (<...>) and quoted headers ending
      // in .h or .hpp. The bug we're guarding against is specifically a
      // quoted include whose path ends in .cpp.
      const cppIncludeRe = /^[ \t]*#\s*include\s*"[^"]*\.cpp"/m;
      assert.doesNotMatch(
        source,
        cppIncludeRe,
        `${rel} must not #include a .cpp file. Use a forward declaration (or a proper header) and let the linker resolve the symbol from the src library. See problems/POTD64/entry/main.cpp for the canonical shape.`,
      );
    });
  }
});
