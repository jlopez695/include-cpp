import { Controller, Get } from '@nestjs/common';
import { TOOLCHAIN } from '../common/toolchain.js';

interface HealthResponse {
  ok: boolean;
  toolchain: typeof TOOLCHAIN;
  warnings: string[];
}

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    const warnings: string[] = [];
    if (!TOOLCHAIN.ccache) {
      warnings.push('ccache not installed — every compile rebuilds from scratch (5–10× slower). Install: brew install ccache');
    }
    if (!TOOLCHAIN.make) {
      warnings.push('make not installed — Makefile-based problems will not compile');
    }
    if (!TOOLCHAIN.cmake) {
      warnings.push('cmake not installed — CMake-based problems will not compile');
    }
    if (!TOOLCHAIN.cxx && !TOOLCHAIN.clangxx) {
      warnings.push('No C++ compiler on PATH — nothing will compile');
    }
    return {
      ok: warnings.length === 0,
      toolchain: TOOLCHAIN,
      warnings,
    };
  }
}
