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

  it('listIds() returns sorted array of problem IDs', () => {
    const service = new ProblemsService();
    service.onModuleInit();

    const ids = service.listIds();
    const sorted = [...ids].sort();
    assert.deepStrictEqual(ids, sorted, 'IDs should be sorted');
  });
});
