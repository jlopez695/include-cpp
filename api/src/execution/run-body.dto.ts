import { IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RunBodyDto {
  @ApiProperty({
    description: 'Map of filename to file content',
    example: { 'main.cpp': '#include <iostream>\nint main() { return 0; }' },
  })
  @IsObject()
  files!: Record<string, string>;

  @ApiProperty({ description: 'User identifier', required: false })
  @IsOptional()
  @IsString()
  userId?: string;
}
