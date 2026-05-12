import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { prefersReducedMotion } from '../lib/accessibility.js';

describe('prefersReducedMotion', () => {
  const origWindow = (globalThis as any).window;

  afterEach(() => {
    (globalThis as any).window = origWindow;
  });

  it('returns false when window is undefined (SSR)', () => {
    delete (globalThis as any).window;
    assert.equal(prefersReducedMotion(), false);
  });

  it('returns false when matchMedia is not a function', () => {
    (globalThis as any).window = { matchMedia: undefined };
    assert.equal(prefersReducedMotion(), false);
  });

  it('returns true when prefers-reduced-motion matches', () => {
    (globalThis as any).window = {
      matchMedia: (query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
      }),
    };
    assert.equal(prefersReducedMotion(), true);
  });

  it('returns false when prefers-reduced-motion does not match', () => {
    (globalThis as any).window = {
      matchMedia: () => ({ matches: false, media: '' }),
    };
    assert.equal(prefersReducedMotion(), false);
  });
});
