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
