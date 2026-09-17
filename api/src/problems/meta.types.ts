export type BuildType = 'makefile' | 'cmake';

export interface Meta {
  title: string;
  buildType: BuildType;
  editableFiles: string[];
  readOnlyFiles: string[];
  entrypoint: string;
  // Explicit sidebar/list-ordering key. Directory names stopped being a
  // usable sort key once problems started being named by title slug
  // (fizz-buzz, struct-student, ...) instead of POTD<n> — lexicographic
  // sort scrambled the two families together. Ascending; ties break on
  // directory name. Optional so a meta.json that predates this field (or
  // a malformed one caught by validateMetaShape before this is checked)
  // still loads — see readOrderHint in problems.service.ts for the
  // missing-value fallback.
  order?: number;
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
