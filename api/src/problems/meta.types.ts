export type BuildType = 'makefile' | 'cmake';

export interface Meta {
  title: string;
  buildType: BuildType;
  editableFiles: string[];
  readOnlyFiles: string[];
  entrypoint: string;
}

export interface ProblemSummary {
  id: string;
  title: string;
}

export interface ProblemDetail extends ProblemSummary {
  buildType: BuildType;
  editableFiles: string[];
  readOnlyFiles: string[];
  entrypoint: string;
  markdown: string;
  files: Record<string, string>;
  readOnlyFiles_content: Record<string, string>;
}
