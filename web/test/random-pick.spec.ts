import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { pickRandom } from '../lib/random-pick.js';

const problems = [
  { id: 'POTD0', title: 'Hello World' },
  { id: 'POTD1', title: 'Epoch Time' },
  { id: 'POTD2', title: 'Pet Constructors' },
  { id: 'POTD3', title: 'Pass by Ref' },
];

describe('pickRandom', () => {
  it('returns null for empty problem list', () => {
    assert.equal(pickRandom([], {}, 'POTD0'), null);
  });

  it('returns null when only problem is the current one', () => {
    assert.equal(pickRandom([{ id: 'POTD0', title: 'A' }], {}, 'POTD0'), null);
  });

  it('excludes current problem from selection', () => {
    for (let i = 0; i < 20; i++) {
      const result = pickRandom(problems, {}, 'POTD0');
      assert.notEqual(result, 'POTD0');
      assert.notEqual(result, null);
    }
  });

  it('prefers unsolved problems over attempted/solved', () => {
    const statuses = {
      POTD0: 'solved' as const,
      POTD1: 'solved' as const,
      POTD2: 'attempted' as const,
      POTD3: 'unsolved' as const,
    };
    // POTD3 is the only unsolved one (excluding current POTD0)
    for (let i = 0; i < 20; i++) {
      assert.equal(pickRandom(problems, statuses, 'POTD0'), 'POTD3');
    }
  });

  it('falls back to attempted when no unsolved remain', () => {
    const statuses = {
      POTD0: 'solved' as const,
      POTD1: 'solved' as const,
      POTD2: 'attempted' as const,
      POTD3: 'solved' as const,
    };
    for (let i = 0; i < 20; i++) {
      assert.equal(pickRandom(problems, statuses, 'POTD0'), 'POTD2');
    }
  });

  it('falls back to any problem when all are solved', () => {
    const statuses = {
      POTD0: 'solved' as const,
      POTD1: 'solved' as const,
      POTD2: 'solved' as const,
      POTD3: 'solved' as const,
    };
    for (let i = 0; i < 20; i++) {
      const result = pickRandom(problems, statuses, 'POTD0');
      assert.notEqual(result, 'POTD0');
      assert.notEqual(result, null);
    }
  });

  it('treats missing status as unsolved', () => {
    // Only POTD1 has a status, rest are missing (treated as unsolved)
    const statuses = { POTD1: 'solved' as const };
    for (let i = 0; i < 20; i++) {
      const result = pickRandom(problems, statuses, 'POTD0');
      assert.notEqual(result, null);
      // Should pick from POTD2 or POTD3 (unsolved), not POTD1 (solved)
      assert.ok(result === 'POTD2' || result === 'POTD3');
    }
  });
});
