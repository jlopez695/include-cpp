import { execSync } from 'node:child_process';

/**
 * Toolchain detection at module load. Logs prominently on startup so
 * silent perf regressions (missing ccache) are visible the moment the
 * server boots, not after a slow compile.
 */

function has(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export interface ToolchainStatus {
  ccache: boolean;
  cmake: boolean;
  make: boolean;
  clangxx: boolean;
  cxx: boolean;
}

export const TOOLCHAIN: ToolchainStatus = {
  ccache: has('ccache'),
  cmake: has('cmake'),
  make: has('make'),
  clangxx: has('clang++'),
  cxx: has('c++'),
};

export function logToolchainStartupBanner(): void {
  const lines: string[] = [];
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(' Toolchain check');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const ok = (k: string, v: boolean) => lines.push(`  ${v ? '✓' : '✗'} ${k}`);
  ok('make    ', TOOLCHAIN.make);
  ok('cmake   ', TOOLCHAIN.cmake);
  ok('c++     ', TOOLCHAIN.cxx || TOOLCHAIN.clangxx);
  ok('ccache  ', TOOLCHAIN.ccache);

  if (!TOOLCHAIN.ccache) {
    lines.push('');
    lines.push(' ⚠  ccache NOT FOUND. Every compile rebuilds from scratch (5–10× slower).');
    lines.push('    INSTALL:  brew install ccache');
  }
  if (!TOOLCHAIN.make) {
    lines.push(' ⚠  make NOT FOUND. Makefile-based problems will not compile.');
  }
  if (!TOOLCHAIN.cmake) {
    lines.push(' ⚠  cmake NOT FOUND. CMake-based problems will not compile.');
  }
  if (!TOOLCHAIN.cxx && !TOOLCHAIN.clangxx) {
    lines.push(' ⚠  No C++ compiler found on PATH (c++ / clang++). Nothing will compile.');
  }
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const line of lines) console.log(line);
}
