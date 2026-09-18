import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ProblemsService } from './problems.service.js';
import type { ProblemSummary } from './meta.types.js';

// These routes serve in-memory cached metadata behind an hour of
// Cache-Control, so they cost nothing to answer. Both root throttlers
// apply to every route, which meant the `exec` budget (8 per 10s, sized
// for the endpoints that spawn a compiler) also governed these reads —
// `next build` fetches every problem during static generation and got a
// 429 on the 9th. Both buckets are overridden here; `exec` is left
// enforcing its real limit on the execution controller.
@Throttle({
  default: { ttl: 10_000, limit: 300 },
  exec: { ttl: 10_000, limit: 300 },
})
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
