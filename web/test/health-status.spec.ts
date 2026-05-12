import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyHealth } from '../lib/health.js';

describe('classifyHealth', () => {
  it('returns disconnected when fetchError is true', () => {
    assert.equal(classifyHealth(null, true), 'disconnected');
  });

  it('returns disconnected when response is null', () => {
    assert.equal(classifyHealth(null, false), 'disconnected');
  });

  it('returns connected when ok and no warnings', () => {
    const resp = {
      ok: true,
      toolchain: { ccache: true, cmake: true, make: true, clangxx: true, cxx: true },
      warnings: [],
    };
    assert.equal(classifyHealth(resp, false), 'connected');
  });

  it('returns degraded when response has warnings', () => {
    const resp = {
      ok: true,
      toolchain: { ccache: false, cmake: true, make: true, clangxx: true, cxx: true },
      warnings: ['ccache not found'],
    };
    assert.equal(classifyHealth(resp, false), 'degraded');
  });

  it('returns degraded when ok is false', () => {
    const resp = {
      ok: false,
      toolchain: { ccache: false, cmake: false, make: false, clangxx: false, cxx: false },
      warnings: [],
    };
    assert.equal(classifyHealth(resp, false), 'degraded');
  });
});
