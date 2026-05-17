import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('Build resilience — `next build` must not depend on backend being up', () => {
  // Both routes are redirect-only shims that call fetchProblems() then
  // redirect to the first problem (or render an empty state). Same
  // pattern, same fix.
  for (const route of ['app/page.tsx', 'app/problems/page.tsx']) {
    describe(`Redirect shim: ${route}`, () => {
      const src = read(route);

      it('opts out of static prerender (force-dynamic)', () => {
        // Prerendering a redirect shim during `next build` would require
        // the backend at NEXT_PUBLIC_API_URL (or localhost:3001) to be
        // reachable — which it usually isn't in CI / fresh checkouts.
        // Marking it dynamic moves the fetch to request time.
        assert.match(src, /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
      });

      it('handles fetchProblems failure without throwing (defense in depth)', () => {
        // Even with force-dynamic, the runtime fetch can still fail
        // (backend bounced, network blip). A bare `throw` would render
        // a server error instead of the empty-state fallback.
        assert.match(src, /try\s*\{[\s\S]*?fetchProblems\(\)/);
        assert.match(src, /\}\s*catch[\s\S]*?problems\s*=\s*\[\]/);
      });
    });
  }

  describe('Problem detail route (/problems/[id])', () => {
    const src = read('app/problems/[id]/page.tsx');

    it('generateStaticParams falls back to [] when backend is down', () => {
      // Mirror of the same defense: if the backend isn't reachable when
      // the build runs generateStaticParams, return [] so the route
      // becomes purely on-demand instead of failing the whole build.
      assert.match(src, /export\s+async\s+function\s+generateStaticParams/);
      assert.match(src, /try\s*\{[\s\S]*?fetchProblems\(\)[\s\S]*?\}\s*catch[\s\S]*?return\s*\[\]/);
    });

    it('the inner fetchProblems() (for prev/next nav) degrades to [] on failure', () => {
      // The page's Promise.all calls fetchProblems again to derive the
      // prev/next arrows. Pre-fix that call was bare, so a backend
      // outage on this leg tore the page down even when fetchProblem(id)
      // above had succeeded — the nav arrows aren't worth a full failure.
      // Pin: there's a fetchProblems() call inside an array literal
      // (the Promise.all input) that's chained with .catch.
      assert.match(
        src,
        /fetchProblems\(\)\s*\.catch\s*\(\s*\(\s*\)\s*=>\s*\[\s*\]\s*\)/,
        'inner fetchProblems() in Promise.all must end in `.catch(() => [])`',
      );
    });

    it('the fetchHealth() catch-fallback matches the HealthResponse type', () => {
      // The pre-fix ad-hoc fallback was `{ status: 'ok', warnings: [] }` —
      // wrong field name (`status` instead of `ok`), missing toolchain,
      // and structurally divergent from HealthResponse. Hide-the-bug
      // behavior worked only because the page accesses `.warnings`
      // alone, but the type drift made downstream additions
      // (`health.toolchain.cmake`, `health.ok`) silently incorrect.
      // Pin: the fallback must reference an explicitly-typed value with
      // an `ok` field, not the old `status` shape.
      assert.match(
        src,
        /HealthResponse\b[\s\S]*?fetchHealth\(\)\s*\.catch/,
        'fetchHealth() fallback should reference a typed HealthResponse value',
      );
      assert.doesNotMatch(
        src,
        /fetchHealth\(\)\s*\.catch\(\s*\(\s*\)\s*=>\s*\(\s*\{\s*status\s*:/,
        'fetchHealth() must not fall back to the old `{ status: ...}` shape',
      );
    });
  });

  describe('Problems shared layout (app/problems/layout.tsx)', () => {
    // Pre-fix the layout did a bare `await fetchProblems()` with no
    // try/catch — a transient backend outage propagated through the
    // sidebar fetch into error.tsx for every problem page underneath
    // the layout, even when the per-problem fetch in page.tsx would
    // have succeeded. Adding the same try/catch + empty-array fallback
    // the other shims use degrades the failure to "sidebar list is
    // empty next to a working problem-detail view" instead of "entire
    // /problems/* subtree is unreachable."
    const src = read('app/problems/layout.tsx');

    it('handles fetchProblems failure without throwing (defense in depth)', () => {
      assert.match(src, /try\s*\{[\s\S]*?fetchProblems\(\)/);
      assert.match(src, /\}\s*catch[\s\S]*?problems\s*=\s*\[\]/);
    });
  });
});
