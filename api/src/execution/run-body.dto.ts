import { IsObject, IsOptional, IsString, ValidateBy, buildMessage } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Per-entry and aggregate caps on `files`. Pre-cap a single POST with
// `files: { "a.cpp": <500MB of text> }` was accepted by the validator
// — @IsRecordOfStrings only checked the value type was string — and
// then the runners' `fs.promises.writeFile(filePath, content)` wrote
// the full payload to disk under /tmp. ulimit -f only caps the spawned
// COMPILE's writes, not the Node-side staging write that precedes it,
// so /tmp filled and Node held the half-gigabyte string in V8's heap
// while it ran. Three caps, all checked at the DTO boundary so the
// failure is a clean 400 naming which cap tripped:
//   - MAX_FILES_ENTRIES: number of files per submission. The largest
//     CS 225 problem in the corpus has 3 editable files; 32 is generous
//     headroom that still rejects a fan-out attack.
//   - MAX_FILE_VALUE_LENGTH: per-file size cap. Real student
//     submissions are well under 50 KB; 256 KB lets accidentally-pasted
//     debugging output through but rejects megabyte payloads.
//   - MAX_FILES_TOTAL_LENGTH: aggregate cap to defeat the "many small
//     files that together exhaust memory" attack the per-file cap
//     misses. Sized just under the default Fastify bodyLimit (1 MB) so
//     the boundary at this layer is at least as tight as the framework
//     layer's — never the surprise of getting through the validator
//     only to be cut off by bodyLimit on a different code path.
const MAX_FILES_ENTRIES = 32;
const MAX_FILE_VALUE_LENGTH = 256 * 1024;
const MAX_FILES_TOTAL_LENGTH = 1 * 1024 * 1024;

/**
 * Custom per-value validator. @IsObject() alone only checks that `files`
 * is an object — every value inside could be any type and validation
 * would still pass. The downstream cost is real: runners write each
 * entry with fs.promises.writeFile(filePath, content), which coerces
 * some primitives to nonsense ("42" instead of 42) and throws on
 * others (objects, arrays, null) as an unhandled 500 far from the
 * cause. The DTO boundary is the right place to fail this — a 400
 * naming `files` is much more actionable than a deep stack from the
 * runner. Built with ValidateBy (rather than chaining @IsString on a
 * field whose declared type is Record<string, string>) because the
 * value-level rule has to inspect every entry in the record, not the
 * record itself.
 *
 * In addition to the original "all values are strings" rule, this
 * validator now also enforces three size caps (MAX_FILES_ENTRIES,
 * MAX_FILE_VALUE_LENGTH, MAX_FILES_TOTAL_LENGTH) to close the OOM /
 * /tmp-fill surface that an unbounded string payload would otherwise
 * present once the value got past validation and reached
 * fs.promises.writeFile in the runners.
 */
function IsRecordOfStrings(): PropertyDecorator {
  // Stash the cap name that tripped on this particular validation so
  // defaultMessage can name it. Module-scope (not closure-scope on the
  // decorator factory) because class-validator keeps a single
  // ValidationMetadata per decorator-application across many concurrent
  // request bodies; using a module variable is fine because validate()
  // is synchronous and one body finishes before the next begins.
  let lastViolation: string | null = null;
  return ValidateBy({
    name: 'isRecordOfStrings',
    validator: {
      validate: (value: unknown): boolean => {
        lastViolation = null;
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          lastViolation = 'files must be an object';
          return false;
        }
        const entries = Object.entries(value as Record<string, unknown>);
        if (entries.length > MAX_FILES_ENTRIES) {
          lastViolation = `files exceeds the per-request entry cap (got ${entries.length}, max ${MAX_FILES_ENTRIES})`;
          return false;
        }
        let total = 0;
        for (const [name, v] of entries) {
          if (typeof v !== 'string') {
            lastViolation = `files[${name}] must be a string`;
            return false;
          }
          if (v.length > MAX_FILE_VALUE_LENGTH) {
            lastViolation = `files[${name}] exceeds the per-file length cap (got ${v.length}, max ${MAX_FILE_VALUE_LENGTH})`;
            return false;
          }
          total += v.length;
          if (total > MAX_FILES_TOTAL_LENGTH) {
            lastViolation = `files total length exceeds the per-request cap (got >${total}, max ${MAX_FILES_TOTAL_LENGTH})`;
            return false;
          }
        }
        return true;
      },
      defaultMessage: buildMessage(
        (eachPrefix) => `${eachPrefix}${lastViolation ?? 'files must be an object whose values are all strings'}`,
      ),
    },
  });
}

export class RunBodyDto {
  @ApiProperty({
    description: 'Map of filename to file content',
    example: { 'main.cpp': '#include <iostream>\nint main() { return 0; }' },
  })
  @IsObject()
  @IsRecordOfStrings()
  files!: Record<string, string>;

  @ApiProperty({ description: 'User identifier', required: false })
  @IsOptional()
  @IsString()
  userId?: string;
}
