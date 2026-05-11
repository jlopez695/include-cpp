export type BuildType = 'makefile' | 'cmake';
export type Status = 'unsolved' | 'attempted' | 'solved';

export interface ProblemSummary {
  id: string;
  title: string;
}

export interface ProblemDetail extends ProblemSummary {
  buildType: BuildType;
  editableFiles: string[];
  readOnlyFiles: Record<string, string>;
  entrypoint: string;
  markdown: string;
  files: Record<string, string>;
}

export interface HealthResponse {
  ok: boolean;
  toolchain: {
    ccache: boolean;
    cmake: boolean;
    make: boolean;
    clangxx: boolean;
    cxx: boolean;
  };
  warnings: string[];
}

/* SSE event types from the backend */
export type StreamEvent =
  | { kind: 'stdout'; data: string }
  | { kind: 'stderr'; data: string }
  | { kind: 'sentinel'; event: SentinelEvent }
  | { kind: 'compile-start' }
  | { kind: 'compile-end'; exitCode: number; killedByTimeout: boolean }
  | { kind: 'run-start' }
  | { kind: 'run-end'; exitCode: number; killedByTimeout: boolean }
  | { kind: 'error'; message: string }
  | { kind: 'done'; passed: number; total: number; exitCode: number };

export type SentinelEvent =
  | { type: 'test'; name: string; status: 'pass' | 'fail' | 'crash' | 'skip'; message?: string }
  | { type: 'result'; passed: number; total: number };

export interface FileTab {
  name: string;
  editable: boolean;
}

export interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'crash' | 'skip';
  message?: string;
  duration?: number;
}

export interface Diagnostic {
  line: number;
  col: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}
