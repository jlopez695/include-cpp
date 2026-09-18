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
        // Sanitize the id before interpolating into the log line. `id`
        // is the directory name from fs.readdirSync(PROBLEMS_DIR) and
        // macOS will happily accept a directory name containing CR or
        // LF. Without this strip, a poisoned PR (or a misconfigured
        // deploy that mounts an attacker-controlled volume) could
        // create `problems/POTD0\nFAKE: ATTACK` and fabricate an extra
        // log line. No automation consumes warn logs today, but the
        // fix is cheap and matches the boundary-sanitization stance
        // we took with meta.json path traversal (commit 0345b65) —
        // treat anything that comes off disk as hostile.
        const safeId = id.replace(/[\r\n]/g, '_');
        this.logger.warn(
          `Skipping problem '${safeId}' during cache population: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.listCache = summaries;
    this.logger.log(`Cached ${summaries.length} problems${skipped > 0 ? ` (${skipped} skipped due to errors)` : ''}`);
  }

  private readIds(): string[] {
    const candidates = fs
      .readdirSync(this.problemsDir)
      .filter(name => !name.startsWith('_') && !name.startsWith('.'))
      .filter(name => fs.existsSync(path.join(this.problemsDir, name, 'meta.json')));

    // Sort by meta.json's `order` field, ascending, tying broken on
    // directory name. Plain lexicographic sort on the directory name
    // (the old behavior) worked by accident while every problem was
    // POTD<n> — it stopped working once problems started being named by
    // title slug: uppercase POTD* sorts before all lowercase slugs in
    // ASCII regardless of intent, and the slugs themselves sort
    // alphabetically rather than in the order they were added. `order`
    // is read directly here (not through readMetaFromDisk's full
    // validation) because readIds() runs before populateCache decides
    // which problems are well-formed enough to cache; a problem with a
    // missing/malformed order (or an unparseable meta.json entirely)
    // just sorts to the end rather than failing here — populateCache's
    // own try/catch is still what ultimately skips a truly broken
    // problem.
    return candidates
      .map(id => ({ id, order: this.readOrderHint(id) }))
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      })
      .map(c => c.id);
  }

  private readOrderHint(id: string): number {
    let parsed: Record<string, unknown>;
    try {
      const raw = fs.readFileSync(path.join(this.problemsDir, id, 'meta.json'), 'utf8');
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Malformed JSON or an unreadable file — fall through to the same
      // end-of-list placement as a well-formed meta.json that simply
      // omits `order`, and stay quiet: populateCache's readMetaFromDisk
      // reports the real error for this problem separately, and warning
      // twice about one broken file just buries the useful message.
      return Number.MAX_SAFE_INTEGER;
    }

    if (typeof parsed.order === 'number' && Number.isFinite(parsed.order)) {
      return parsed.order;
    }

    // An `order` that is present but not a number (a string, null) is a
    // hard validation error: assertMeta rejects the problem and
    // populateCache logs a skip line naming the field and the value.
    // Warning here as well would double-log one mistake, so only the
    // genuinely-absent case gets a line. (A non-finite number is
    // unreachable from disk — JSON has no NaN or Infinity literal — but
    // the guard above stays as belt-and-braces for the sort key.)
    if (parsed.order === undefined) {
      // Nothing else reports this one: the problem is well-formed, so it
      // caches and serves normally, and the only symptom is that it sits
      // at the bottom of the sidebar no matter where the author meant it
      // to go. That reads as a sorting bug rather than a missing field,
      // and the obvious places to look (Sidebar.tsx, the /api/problems
      // response) both contain nothing wrong. Non-fatal on purpose:
      // `order` stays optional, because rejecting the problem in
      // assertMeta would drop it from the list and 404 its page, a far
      // worse outcome for a forgotten integer.
      //
      // `id` is a directory name straight off disk and macOS permits
      // CR/LF in one, so strip them before interpolating — same
      // reasoning as the sanitize in populateCache.
      const safeId = id.replace(/[\r\n]/g, '_');
      this.logger.warn(
        `Problem '${safeId}': meta.json has no 'order' field — sorting it to the end of the list.`,
      );
    }
    return Number.MAX_SAFE_INTEGER;
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `Problem ${id}: meta.json is not valid JSON (${err instanceof Error ? err.message : String(err)})`,
      );
    }
    // Validate the parsed shape *before* casting. The bare `as Meta` cast
    // was a compile-time lie: any object that parsed would surface to
    // callers as a Meta regardless of what was actually inside. The
    // downstream consequence was bad: readDetailFromDisk's
    // `for (const filename of meta.editableFiles)` iterates a string
    // character-by-character if editableFiles was accidentally stored as
    // a string ("main.cpp" instead of ["main.cpp"]), and the resulting
    // ENOENT on 'm' surfaced to /problems/:id callers as an opaque 500
    // with no problem id or field name in the message. A missing or
    // wrong buildType produced an even more confusing failure further
    // out at execution time. Validate here so every cache-miss path
    // (populateCache, list, detail, readMeta) gets the same coherent
    // error message naming the problem id and the offending field.
    return validateMetaShape(parsed, id);
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
 * Validate a parsed meta.json against the Meta shape and return it
 * typed. Throws a descriptive Error naming the problem id and the
 * offending field on any mismatch. Centralized here so all callers of
 * readMetaFromDisk get identical error shapes; the per-problem try/catch
 * in populateCache then logs and skips, and the cache-miss path in
 * detail() surfaces the same descriptive message to the HTTP layer.
 *
 * readOnlyFiles is intentionally optional even though the Meta type
 * marks it required — readDetailFromDisk already does
 * `meta.readOnlyFiles ?? []`, and real problems on disk exist that
 * omit the field. Tightening it here would skip otherwise-valid
 * problems at boot.
 */
function validateMetaShape(parsed: unknown, id: string): Meta {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Problem ${id}: meta.json must be a JSON object`);
  }
  const m = parsed as Record<string, unknown>;
  if (typeof m.title !== 'string') {
    throw new Error(`Problem ${id}: meta.json field 'title' must be a string`);
  }
  if (m.buildType !== 'makefile' && m.buildType !== 'cmake') {
    throw new Error(
      `Problem ${id}: meta.json field 'buildType' must be 'makefile' or 'cmake' (got ${JSON.stringify(m.buildType)})`,
    );
  }
  if (!Array.isArray(m.editableFiles) || !m.editableFiles.every(f => typeof f === 'string')) {
    throw new Error(`Problem ${id}: meta.json field 'editableFiles' must be an array of strings`);
  }
  for (const f of m.editableFiles as string[]) {
    assertBareFilename(id, 'editableFiles', f);
  }
  if (m.readOnlyFiles !== undefined) {
    if (!Array.isArray(m.readOnlyFiles) || !m.readOnlyFiles.every(f => typeof f === 'string')) {
      throw new Error(`Problem ${id}: meta.json field 'readOnlyFiles' must be an array of strings when present`);
    }
    for (const f of m.readOnlyFiles as string[]) {
      assertBareFilename(id, 'readOnlyFiles', f);
    }
  }
  if (typeof m.entrypoint !== 'string') {
    throw new Error(`Problem ${id}: meta.json field 'entrypoint' must be a string`);
  }
  assertBareFilename(id, 'entrypoint', m.entrypoint);
  if (m.order !== undefined && typeof m.order !== 'number') {
    throw new Error(`Problem ${id}: meta.json field 'order' must be a number when present`);
  }
  return parsed as Meta;
}

/**
 * Reject any meta.json path field that escapes its problem directory or
 * embeds shell-/path-corrupting bytes. This is defense in depth against
 * a hostile-contributor PR landing a poisoned meta.json — NOT against a
 * user request, which is already gated by validateRunRequest's
 * editableFiles allowlist in execution.service.ts.
 *
 * Specifically guards three downstream sinks:
 *
 *   1. `entrypoint` flows to cmake-runner.findRunnableBinary
 *      (path.join(buildDir, entrypoint)) and makefile-runner
 *      (shellQuote(`./${entrypoint}`)). A meta.json with
 *      `entrypoint: "../../bin/sh"` would resolve upward through
 *      path.join, pass findRunnableBinary's stat+access(X_OK) on the
 *      target, and runExecutable would spawn /bin/sh under ulimit with
 *      cwd=buildDir.
 *   2. `editableFiles` entries flow to readDetailFromDisk's
 *      `fs.readFileSync(path.join(problemDir, filename), 'utf8')` at
 *      boot. A poisoned `editableFiles: ["../../etc/passwd"]` would
 *      read host files into the detail cache and surface them through
 *      /problems/:id to any caller.
 *   3. `readOnlyFiles` entries flow to the same readProblemFile call
 *      via `readOnlyFiles_content`. Same exfiltration vector.
 *
 * The rules:
 *   - No leading '/' — rejects absolute paths.
 *   - No '..' anywhere — rejects parent traversal. Strict-substring
 *     check (not a path-segment check) so 'foo..bar' is also blocked;
 *     legitimate filenames never contain '..'.
 *   - No NUL bytes — rejects truncation attacks against any downstream
 *     C path consumer (the C++ harness, dlopen, exec).
 */
function assertBareFilename(id: string, field: string, value: string): void {
  if (value.startsWith('/') || value.includes('..') || value.includes('\0')) {
    throw new Error(
      `Problem ${id}: meta.json field '${field}' must be a bare filename relative to the problem directory; got ${JSON.stringify(value)} (no absolute paths, parent-directory references, or NUL bytes)`,
    );
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
