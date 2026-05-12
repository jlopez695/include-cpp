import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage for Node.js tests
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
};
(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).window = globalThis;

import { clampFontSize } from '../lib/editor-settings.js';
import { loadUiState, saveUiState } from '../lib/storage.js';

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

describe('vim mode persistence (loadUiState / saveUiState)', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
  });

  it('returns fallback when no value stored', () => {
    assert.equal(loadUiState('vimMode', false), false);
  });

  it('persists and loads a boolean true', () => {
    saveUiState('vimMode', true);
    assert.equal(loadUiState('vimMode', false), true);
  });

  it('persists and loads a boolean false', () => {
    saveUiState('vimMode', true);
    saveUiState('vimMode', false);
    assert.equal(loadUiState('vimMode', true), false);
  });

  it('survives corrupt JSON gracefully', () => {
    store['potd:ui:vimMode'] = '{bad json';
    assert.equal(loadUiState('vimMode', false), false);
  });
});
