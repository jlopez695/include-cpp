/**
 * Regression test for "useResizable rebinds its global mousemove/mouseup
 * listeners on every parent render".
 *
 * Both callers pass useResizable two arguments that are fresh values
 * every render:
 *
 *   const horizontal = useResizable(
 *     'split-h',
 *     38,
 *     'horizontal',
 *     () => bodyRef.current,   // arrow → new ref every render
 *     [20, 70],                // array literal → new ref every render
 *   );
 *
 * Pre-fix the hook listed those as effect deps:
 *
 *   useEffect(() => { ...add mousemove/mouseup... },
 *             [direction, getContainer, bounds, storageKey]);
 *
 * So React saw both deps change every render and re-ran the cleanup +
 * setup. That meant the GLOBAL window mousemove/mouseup listeners got
 * removed and re-added on every parent re-render. ProblemWorkspace
 * re-renders constantly while a test run is in flight (one render per
 * output line, sentinel, cursor move), so the listeners were churning
 * dozens-to-hundreds of times during a single run.
 *
 * The worse symptom: if the user happens to be dragging the resizer
 * AT THE SAME TIME as a streaming test run, every output line opens a
 * microtask window where the listeners are detached. A mousemove that
 * lands in that window is silently dropped (the size doesn't follow
 * the cursor for a frame); worse, a mouseup that lands in that window
 * leaves `dragging.current = true` stuck, so subsequent mousemoves
 * (after the next re-render re-binds the listeners) continue treating
 * the cursor as held down — the panel "follows" the cursor without a
 * button pressed until the next mouseup.
 *
 * The fix mirrors getContainer and bounds into refs and reads them
 * from inside the listener closures. The effect now only depends on
 * `[direction, storageKey]` — both string primitives that are stable
 * in practice — so the listeners are bound exactly once per mount.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('useResizable stabilizes its mousemove/mouseup effect deps', () => {
  let src: string;
  before(() => {
    src = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'hooks', 'useResizable.ts'),
      'utf8',
    );
  });

  it('stores getContainer in a ref kept in sync each render', () => {
    assert.match(src, /getContainerRef\s*=\s*useRef\(getContainer\)/);
    assert.match(src, /getContainerRef\.current\s*=\s*getContainer/);
    // The mousemove handler must read via the ref, never the prop.
    const onMoveBlock = src.match(/const\s+onMove\s*=[\s\S]+?\};/);
    assert.ok(onMoveBlock, 'could not locate onMove handler');
    assert.match(
      onMoveBlock![0],
      /getContainerRef\.current\(\)/,
      'onMove must call getContainerRef.current() — calling the prop directly re-introduces the per-render identity dep',
    );
  });

  it('stores bounds in a ref kept in sync each render', () => {
    assert.match(src, /boundsRef\s*=\s*useRef\(bounds\)/);
    assert.match(src, /boundsRef\.current\s*=\s*bounds/);
    const onMoveBlock = src.match(/const\s+onMove\s*=[\s\S]+?\};/);
    assert.ok(onMoveBlock);
    assert.match(
      onMoveBlock![0],
      /boundsRef\.current/,
      'onMove must read bounds via the ref',
    );
  });

  it("the mousemove/mouseup effect dep array is [direction, storageKey] — neither getContainer nor bounds", () => {
    // Locate the effect by anchoring on addEventListener('mousemove').
    const effect = src.match(
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?addEventListener\(\s*['"]mousemove['"][\s\S]*?\},\s*\[([^\]]+)\]\s*\)/,
    );
    assert.ok(effect, 'could not locate the mousemove/mouseup useEffect');
    const deps = effect![1].split(',').map(s => s.trim()).filter(Boolean);
    assert.deepEqual(
      [...deps].sort(),
      ['direction', 'storageKey'],
      `mousemove/mouseup effect deps must be exactly [direction, storageKey] — found [${deps.join(', ')}]`,
    );
    // Defensive: explicitly call out the two values that USED to be there.
    assert.ok(
      !deps.includes('getContainer'),
      'getContainer must NOT appear in the effect deps — it is a per-render arrow that would trigger constant rebinds',
    );
    assert.ok(
      !deps.includes('bounds'),
      'bounds must NOT appear in the effect deps — it is a per-render array literal that would trigger constant rebinds',
    );
  });
});
