import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProblemsService } from '../src/problems/problems.service.js';

describe('ProblemsService in-memory cache', () => {
  it('onModuleInit populates list and detail caches', () => {
    const service = new ProblemsService();
    service.onModuleInit();

    const list = service.list();
    assert.ok(Array.isArray(list), 'list() should return an array');
    assert.ok(list.length > 0, 'list() should have at least one problem');
    assert.ok(list.every(p => typeof p.id === 'string' && typeof p.title === 'string'),
      'each summary should have id and title');
  });

  it('list() returns the same cached array on repeated calls', () => {
    const service = new ProblemsService();
    service.onModuleInit();

    const a = service.list();
    const b = service.list();
    assert.strictEqual(a, b, 'list() should return the same array reference (cached)');
  });

  it('detail() returns cached data for known problem', () => {
    const service = new ProblemsService();
    service.onModuleInit();

    const ids = service.listIds();
    assert.ok(ids.length > 0, 'should have at least one problem');

    const detail = service.detail(ids[0]);
    assert.equal(detail.id, ids[0]);
    assert.ok(typeof detail.title === 'string');
    assert.ok(typeof detail.markdown === 'string');
    assert.ok(typeof detail.files === 'object');
    assert.ok(detail.editableFiles.length > 0, 'problem should have editable files');
  });

  it('detail() returns the same cached reference on repeated calls', () => {
    const service = new ProblemsService();
    service.onModuleInit();

    const id = service.listIds()[0];
    const a = service.detail(id);
    const b = service.detail(id);
    assert.strictEqual(a, b, 'detail() should return the same reference (cached)');
  });

  it('detail() throws NotFoundException for unknown problem', () => {
    const service = new ProblemsService();
    service.onModuleInit();

    assert.throws(
      () => service.detail('NONEXISTENT_PROBLEM_XYZ'),
      { name: 'NotFoundException' },
    );
  });

  // Plain lexicographic sort on directory name only worked by accident
  // while every problem was POTD<n> — see the `order` field comment in
  // meta.types.ts. Since problems started being named by title slug
  // (fizz-buzz, struct-student, ...), listIds() sorts by each problem's
  // meta.json `order` field instead, tie-broken by directory name; this
  // pins that against the real problems/ tree rather than asserting the
  // old (now-incorrect) "IDs come back plain-alphabetical" invariant.
  it('listIds() returns problems ordered by meta.json order (ties broken alphabetically)', () => {
    const service = new ProblemsService();
    service.onModuleInit();

    const ids = service.listIds();
    const orderOf = (id: string): number => service.readMeta(id).order ?? Number.MAX_SAFE_INTEGER;

    for (let i = 1; i < ids.length; i++) {
      const prevId = ids[i - 1]!;
      const curId = ids[i]!;
      const prevOrder = orderOf(prevId);
      const curOrder = orderOf(curId);
      assert.ok(
        prevOrder < curOrder || (prevOrder === curOrder && prevId < curId),
        `expected '${prevId}' (order ${prevOrder}) to sort before '${curId}' (order ${curOrder})`,
      );
    }
  });

  // readMeta() is invoked on every code-execution request (runStream reads
  // meta.buildType to dispatch makefile vs cmake). It used to bypass the
  // cache and re-read meta.json from disk every time — this regression
  // test pins the cached behavior so we don't regress to per-request fs.
  it('readMeta() returns the same cached reference for known problems', () => {
    const service = new ProblemsService();
    service.onModuleInit();

    const id = service.listIds()[0];
    const a = service.readMeta(id);
    const b = service.readMeta(id);
    assert.strictEqual(a, b, 'readMeta() should return the cached object reference');
  });

  it('readMeta() exposes the meta fields used by the execution dispatcher', () => {
    const service = new ProblemsService();
    service.onModuleInit();

    const id = service.listIds()[0];
    const meta = service.readMeta(id);
    // These are the only fields the runners read; if any drift to undefined
    // a run/test request would fail in surprising ways.
    assert.ok(meta.buildType === 'makefile' || meta.buildType === 'cmake',
      'buildType drives runner dispatch — must be a known value');
    assert.ok(typeof meta.entrypoint === 'string' && meta.entrypoint.length > 0);
    assert.ok(Array.isArray(meta.editableFiles));
  });

  it('readMeta() throws NotFoundException for unknown problem', () => {
    const service = new ProblemsService();
    service.onModuleInit();

    assert.throws(
      () => service.readMeta('NONEXISTENT_PROBLEM_XYZ'),
      { name: 'NotFoundException' },
    );
  });
});
