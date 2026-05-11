import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { clampFontSize } from '../lib/editor-settings.js';

describe('clampFontSize', () => {
  it('returns value within range unchanged', () => {
    assert.equal(clampFontSize(13), 13);
    assert.equal(clampFontSize(16), 16);
  });

  it('clamps below minimum to 10', () => {
    assert.equal(clampFontSize(5), 10);
    assert.equal(clampFontSize(0), 10);
    assert.equal(clampFontSize(-3), 10);
  });

  it('clamps above maximum to 24', () => {
    assert.equal(clampFontSize(30), 24);
    assert.equal(clampFontSize(100), 24);
  });

  it('rounds non-integer values', () => {
    assert.equal(clampFontSize(13.7), 14);
    assert.equal(clampFontSize(12.3), 12);
  });

  it('returns default for NaN and Infinity', () => {
    assert.equal(clampFontSize(NaN), 13);
    assert.equal(clampFontSize(Infinity), 13);
    assert.equal(clampFontSize(-Infinity), 13);
  });

  it('handles boundary values exactly', () => {
    assert.equal(clampFontSize(10), 10);
    assert.equal(clampFontSize(24), 24);
    assert.equal(clampFontSize(9), 10);
    assert.equal(clampFontSize(25), 24);
  });
});
