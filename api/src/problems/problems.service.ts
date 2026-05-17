import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import { PROBLEMS_DIR } from '../common/paths.js';
import type { Meta, ProblemDetail, ProblemSummary } from './meta.types.js';

@Injectable()
export class ProblemsService implements OnModuleInit {
  private readonly logger = new Logger(ProblemsService.name);
  private listCache: ProblemSummary[] | null = null;
  private detailCache = new Map<string, ProblemDetail>();
  private metaCache = new Map<string, Meta>();
  // Default is the production-resolved PROBLEMS_DIR. The no-arg constructor
  // (implicit) keeps Nest's DI happy — adding a constructor parameter, even
  // one with a default value, makes Nest reflect on the type and look for a
  // provider, which then fails with UnknownDependenciesException at boot.
  // Tests override via `setProblemsDirForTesting` before `onModuleInit()`.
  private problemsDir: string = PROBLEMS_DIR;

  /**
   * Test-only seam. Pointing the service at a temp directory with bespoke
   * good/bad fixtures lets resilience tests exercise the populateCache
   * error paths without touching the real problems/ tree. Production code
   * must not call this — the default is set at construction time from
   * PROBLEMS_DIR (which itself honors the PROBLEMS_DIR env var).
   */
  setProblemsDirForTesting(dir: string): void {
    this.problemsDir = dir;
  }

  onModuleInit() {
    this.populateCache();
  }

  // `populateCache` runs at boot inside Nest's `onModuleInit`. A single
  // throwing problem used to abort module init, taking the entire API
  // process down with no useful indication of which problem was at fault —
  // a malformed `meta.json`, a removed editableFiles entry that still
  // appears in the manifest, or a missing `problem.md` would all surface
  // as an opaque crash. Now per-problem failures are caught, logged with
  // the offending id and reason, and the bad problem is omitted from the
  // caches. The server still boots; the broken problem returns
  // NotFoundException at request time (consistent with an unknown id).
  private populateCache() {
    const ids = this.readIds();
    const summaries: ProblemSummary[] = [];
    let skipped = 0;

    for (const id of ids) {
      try {
        const meta = this.readMetaFromDisk(id);
        const detail = this.readDetailFromDisk(id, meta);
        this.metaCache.set(id, meta);
        this.detailCache.set(id, detail);
        summaries.push({ id, title: meta.title });
      } catch (err) {
        skipped++;
        this.logger.warn(
          `Skipping problem '${id}' during cache population: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.listCache = summaries;
    this.logger.log(`Cached ${summaries.length} problems${skipped > 0 ? ` (${skipped} skipped due to errors)` : ''}`);
  }

  private readIds(): string[] {
    return fs
      .readdirSync(this.problemsDir)
      .filter(name => !name.startsWith('_') && !name.startsWith('.'))
      .filter(name => fs.existsSync(path.join(this.problemsDir, name, 'meta.json')))
      .sort();
  }

  private readMetaFromDisk(id: string): Meta {
    const metaPath = path.join(this.problemsDir, id, 'meta.json');
    if (!fs.existsSync(metaPath)) {
      throw new NotFoundException(`Problem ${id} not found`);
    }
    // JSON.parse throws on malformed input with a message that names
    // neither the file nor the problem id. Rewrap so a corrupted meta.json
    // points the operator at the offending file directly instead of just
    // saying "Unexpected token } in JSON at position N".
    const raw = fs.readFileSync(metaPath, 'utf8');
    try {
      return JSON.parse(raw) as Meta;
    } catch (err) {
      throw new Error(
        `Problem ${id}: meta.json is not valid JSON (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  }

  private readDetailFromDisk(id: string, preReadMeta?: Meta): ProblemDetail {
    const problemDir = path.join(this.problemsDir, id);
    if (!fs.existsSync(problemDir)) {
      throw new NotFoundException(`Problem ${id} not found`);
    }
    const meta = preReadMeta ?? this.readMetaFromDisk(id);

    const markdown = readProblemFile(problemDir, id, 'problem.md');

    const files: Record<string, string> = {};
    for (const filename of meta.editableFiles) {
      files[filename] = readProblemFile(problemDir, id, filename);
    }

    const readOnlyFiles_content: Record<string, string> = {};
    for (const filename of meta.readOnlyFiles ?? []) {
      readOnlyFiles_content[filename] = readProblemFile(problemDir, id, filename);
    }

    return { id, ...meta, markdown, files, readOnlyFiles_content };
  }

  listIds(): string[] {
    return (this.listCache ?? this.readIds().map(id => ({ id, title: '' }))).map(p => p.id);
  }

  readMeta(id: string): Meta {
    const cached = this.metaCache.get(id);
    if (cached) return cached;
    // Cache miss for an id not seen at boot — fall back to disk (and
    // populate the cache so subsequent calls hit it). readMetaFromDisk
    // throws NotFoundException for unknown ids.
    const meta = this.readMetaFromDisk(id);
    this.metaCache.set(id, meta);
    return meta;
  }

  list(): ProblemSummary[] {
    if (this.listCache) return this.listCache;
    return this.readIds().map(id => {
      const meta = this.readMetaFromDisk(id);
      return { id, title: meta.title };
    });
  }

  detail(id: string): ProblemDetail {
    const cached = this.detailCache.get(id);
    if (cached) return cached;
    return this.readDetailFromDisk(id);
  }
}

/**
 * Read a problem-relative file with a descriptive error on failure.
 *
 * The bare fs.readFileSync that lived here used to throw with just
 * `ENOENT: no such file or directory, open '/abs/path/to/foo.cpp'` —
 * useful if you know the layout, opaque if you don't. The rewrap names
 * both the problem id and the filename as listed in meta.json so an
 * operator can edit the manifest without grep-walking the path back to
 * a problem id.
 */
function readProblemFile(problemDir: string, id: string, filename: string): string {
  try {
    return fs.readFileSync(path.join(problemDir, filename), 'utf8');
  } catch (err) {
    throw new Error(
      `Problem ${id}: required file '${filename}' is missing or unreadable (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}
