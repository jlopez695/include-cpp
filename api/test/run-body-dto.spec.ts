import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RunBodyDto } from '../src/execution/run-body.dto.js';

function toDto(plain: Record<string, unknown>): RunBodyDto {
  return plainToInstance(RunBodyDto, plain);
}

test('valid body with files and userId passes validation', async () => {
  const dto = toDto({ files: { 'main.cpp': 'int main() {}' }, userId: 'alice' });
  const errors = await validate(dto);
  assert.equal(errors.length, 0);
});

test('valid body with files only (no userId) passes validation', async () => {
  const dto = toDto({ files: { 'main.cpp': 'int main() {}' } });
  const errors = await validate(dto);
  assert.equal(errors.length, 0);
});

test('missing files field fails validation', async () => {
  const dto = toDto({ userId: 'alice' });
  const errors = await validate(dto);
  assert.ok(errors.length > 0, 'Expected validation errors for missing files');
  assert.ok(errors.some(e => e.property === 'files'));
});

test('files as non-object fails validation', async () => {
  const dto = toDto({ files: 'not-an-object' });
  const errors = await validate(dto);
  assert.ok(errors.length > 0, 'Expected validation error for non-object files');
  assert.ok(errors.some(e => e.property === 'files'));
});

test('userId as non-string fails validation', async () => {
  const dto = toDto({ files: { 'main.cpp': 'code' }, userId: 123 });
  const errors = await validate(dto);
  assert.ok(errors.length > 0, 'Expected validation error for non-string userId');
  assert.ok(errors.some(e => e.property === 'userId'));
});

test('whitelist strips unknown properties', async () => {
  const dto = toDto({
    files: { 'main.cpp': 'code' },
    userId: 'alice',
    malicious: 'payload',
  });
  const errors = await validate(dto, { whitelist: true });
  assert.equal(errors.length, 0);
  assert.equal((dto as any).malicious, undefined);
});

// The next block pins the per-value validation behavior of `files`.
// @IsObject() on its own only asserts that the field is an object —
// every value inside could be a number, array, nested object, or null
// and validation would still pass. The runtime cost is real: the
// runners write each value with fs.promises.writeFile(filePath, content),
// which coerces some primitives (a number becomes its string form) and
// throws on others (objects, arrays). A non-string value either silently
// corrupted the on-disk file with a coerced shape (a number like 42
// becoming "42") or escaped as an unhandled 500, depending on the
// concrete bad value. Either way the operator got a confusing failure
// far from the cause; the right answer is a 400 at the DTO boundary
// naming `files.<name>` as the offending field.

test('files with a numeric value fails validation', async () => {
  const dto = toDto({ files: { 'main.cpp': 42 } });
  const errors = await validate(dto);
  assert.ok(errors.length > 0, 'Expected validation error for numeric file value');
  assert.ok(errors.some(e => e.property === 'files'));
});

test('files with a null value fails validation', async () => {
  const dto = toDto({ files: { 'main.cpp': null } });
  const errors = await validate(dto);
  assert.ok(errors.length > 0, 'Expected validation error for null file value');
  assert.ok(errors.some(e => e.property === 'files'));
});

test('files with an array value fails validation', async () => {
  const dto = toDto({ files: { 'main.cpp': ['#include <iostream>'] } });
  const errors = await validate(dto);
  assert.ok(errors.length > 0, 'Expected validation error for array file value');
  assert.ok(errors.some(e => e.property === 'files'));
});

test('files with a nested object value fails validation', async () => {
  const dto = toDto({ files: { 'main.cpp': { nested: true } } });
  const errors = await validate(dto);
  assert.ok(errors.length > 0, 'Expected validation error for nested object file value');
  assert.ok(errors.some(e => e.property === 'files'));
});

test('files with a boolean value fails validation', async () => {
  const dto = toDto({ files: { 'main.cpp': true } });
  const errors = await validate(dto);
  assert.ok(errors.length > 0, 'Expected validation error for boolean file value');
  assert.ok(errors.some(e => e.property === 'files'));
});

test('files with an empty record passes (no file values to check)', async () => {
  // Edge case worth pinning: an empty object has no values to violate
  // the per-value rule. Whether the surrounding flow accepts an empty
  // files map is the controller/runner's concern — at the DTO level,
  // the per-value rule must not synthesize a false positive for it.
  const dto = toDto({ files: {} });
  const errors = await validate(dto);
  // No files-shape errors. (The DTO itself doesn't require non-empty.)
  assert.equal(errors.filter(e => e.property === 'files').length, 0);
});

test('files with multiple entries, one bad, fails on that entry', async () => {
  const dto = toDto({
    files: {
      'main.cpp': 'int main() {}',
      'helper.h': 99,
      'README.md': 'docs',
    },
  });
  const errors = await validate(dto);
  assert.ok(errors.some(e => e.property === 'files'),
    'Expected files error when at least one value is non-string');
});
