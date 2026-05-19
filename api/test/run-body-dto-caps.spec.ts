import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RunBodyDto } from '../src/execution/run-body.dto.js';

/**
 * Regression for the unbounded `files` payload in RunBodyDto.
 *
 * Pre-cap @IsRecordOfStrings only checked the *type* of each value
 * (string), not the count, individual length, or aggregate length.
 * A single POST with `files: { "a.cpp": <500MB of text> }` would
 * pass validation, then fs.promises.writeFile in the runner would
 * commit the full payload to disk under /tmp — exhausting /tmp
 * AND holding the gigabyte string in V8's heap while the request
 * ran. ulimit -f only caps the spawned compile's writes, not the
 * Node-side staging write.
 *
 * The three new caps, all checked at the DTO boundary:
 *   - max 32 file entries per request
 *   - max 256 KB per file value
 *   - max 1 MB aggregate value bytes
 */

function toDto(plain: Record<string, unknown>): RunBodyDto {
  return plainToInstance(RunBodyDto, plain);
}

test('files entry count > 32 fails validation with a cap-named message', async () => {
  const files: Record<string, string> = {};
  for (let i = 0; i < 33; i++) files[`f${i}.cpp`] = 'int x;';
  const dto = toDto({ files });
  const errors = await validate(dto);
  assert.ok(errors.length > 0, 'expected validation error for too many entries');
  const filesErr = errors.find(e => e.property === 'files');
  assert.ok(filesErr, 'expected error on files');
  // class-validator stores constraint messages in `constraints`.
  const msg = JSON.stringify(filesErr!.constraints ?? {});
  assert.match(msg, /entry cap/);
});

test('a single value larger than 256KB fails validation', async () => {
  const dto = toDto({ files: { 'main.cpp': 'x'.repeat(256 * 1024 + 1) } });
  const errors = await validate(dto);
  assert.ok(errors.length > 0, 'expected per-file length cap error');
  const filesErr = errors.find(e => e.property === 'files');
  const msg = JSON.stringify(filesErr!.constraints ?? {});
  assert.match(msg, /per-file length cap/);
});

test('aggregate value bytes > 1MB fails validation, even when each value is under the per-file cap', async () => {
  // 5 files × 240 KB each = 1.17 MB total. None of them individually
  // hits the 256 KB per-file cap; only the aggregate trips.
  const files: Record<string, string> = {
    'a.cpp': 'a'.repeat(240 * 1024),
    'b.cpp': 'b'.repeat(240 * 1024),
    'c.cpp': 'c'.repeat(240 * 1024),
    'd.cpp': 'd'.repeat(240 * 1024),
    'e.cpp': 'e'.repeat(240 * 1024),
  };
  const dto = toDto({ files });
  const errors = await validate(dto);
  assert.ok(errors.length > 0, 'expected aggregate cap error');
  const filesErr = errors.find(e => e.property === 'files');
  const msg = JSON.stringify(filesErr!.constraints ?? {});
  assert.match(msg, /total length/);
});

test('boundary case: exactly 32 entries, each 256KB, aggregate <1MB still passes', async () => {
  // Construct a payload right at the per-entry cap with small values
  // so the aggregate stays well under 1 MB. The per-entry cap is the
  // first check; if entry count is 32 we should still get through
  // as long as the per-value and aggregate caps hold.
  const files: Record<string, string> = {};
  for (let i = 0; i < 32; i++) files[`f${i}.cpp`] = 'int main() {}';
  const dto = toDto({ files });
  const errors = await validate(dto);
  assert.equal(errors.length, 0, 'boundary payload should pass');
});

test('boundary case: single file at exactly 256KB passes', async () => {
  const dto = toDto({ files: { 'main.cpp': 'x'.repeat(256 * 1024) } });
  const errors = await validate(dto);
  assert.equal(errors.length, 0, 'value at exactly the per-file cap should pass');
});
