import { IsObject, IsOptional, IsString, ValidateBy, buildMessage } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
 */
function IsRecordOfStrings(): PropertyDecorator {
  return ValidateBy({
    name: 'isRecordOfStrings',
    validator: {
      validate: (value: unknown): boolean => {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
        return Object.values(value as Record<string, unknown>).every(v => typeof v === 'string');
      },
      defaultMessage: buildMessage(
        (eachPrefix) => `${eachPrefix}files must be an object whose values are all strings`,
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
