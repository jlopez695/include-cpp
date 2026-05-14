import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { ProblemsService } from './problems.service.js';
import type { ProblemSummary } from './meta.types.js';

@ApiTags('problems')
@Controller('problems')
export class ProblemsController {
  constructor(private readonly problems: ProblemsService) {}

  @ApiOperation({ summary: 'List all problems' })
  @Header('Cache-Control', 'public, max-age=3600')
  @Get()
  list(): ProblemSummary[] {
    return this.problems.list();
  }

  @ApiOperation({ summary: 'Get problem detail' })
  @ApiParam({ name: 'id', description: 'Problem ID', example: 'POTD0' })
  @Header('Cache-Control', 'public, max-age=3600')
  @Get(':id')
  detail(@Param('id') id: string) {
    const d = this.problems.detail(id);
    // Wire contract preserved from the original Hono server: `readOnlyFiles`
    // is the content map, not the meta string array.
    return {
      id: d.id,
      title: d.title,
      buildType: d.buildType,
      editableFiles: d.editableFiles,
      entrypoint: d.entrypoint,
      markdown: d.markdown,
      files: d.files,
      readOnlyFiles: d.readOnlyFiles_content,
    };
  }
}
