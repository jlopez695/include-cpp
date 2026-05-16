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
    it('generateStaticParams falls back to [] when backend is down', () => {
      // Mirror of the same defense: if the backend isn't reachable when
      // the build runs generateStaticParams, return [] so the route
      // becomes purely on-demand instead of failing the whole build.
      const src = read('app/problems/[id]/page.tsx');
      assert.match(src, /export\s+async\s+function\s+generateStaticParams/);
      assert.match(src, /try\s*\{[\s\S]*?fetchProblems\(\)[\s\S]*?\}\s*catch[\s\S]*?return\s*\[\]/);
    });
  });
});
