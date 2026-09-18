import 'reflect-metadata';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Logger } from '@nestjs/common';
import { ProblemsService } from '../src/problems/problems.service.js';

/**
 * Regression test for "a problem with no `order` in meta.json sinks to the
 * bottom of the sidebar and nothing says why".
 *
 * `order` is optional, and deliberately stays optional: assertMeta
 * rejecting the problem would drop it from list() and 404 its page, which
 * is a much worse outcome for a forgotten integer than a misplaced row.
 * But readIds() sorts on `order` and substitutes MAX_SAFE_INTEGER when it
 * is absent, so the only symptom used to be a problem sitting last no
 * matter what the author intended — indistinguishable from a sorting bug
 * in the sidebar, and the natural place to go looking (Sidebar.tsx, then
 * the /api/problems response) contains nothing wrong.
 *
 * readOrderHint now warns in exactly that case, and stays silent when
 * meta.json is unreadable or unparseable — populateCache already logs a
 * skip line naming that problem, and two warnings about one broken file
 * buries the one that names the actual error.
 */

function writeProblem(root: string, id: string, meta: Record<string, unknown> | string): void {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'meta.json'),
    typeof meta === 'string' ? meta : JSON.stringify(meta),
  );
  fs.writeFileSync(path.join(dir, 'problem.md'), `# ${id}`);
  fs.writeFileSync(path.join(dir, 'main.cpp'), 'int main(){}');
}

function meta(title: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title,
    buildType: 'makefile',
    editableFiles: ['main.cpp'],
    readOnlyFiles: [],
    entrypoint: 'main',
    ...extra,
  };
}

/**
 * Capture Nest Logger output across the prototype: ProblemsService builds
 * its own `new Logger(...)` internally, so patching an instance is not an
 * option. Returns the collected warn lines plus a restore function.
 */
function captureWarnings(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = {
    log: Logger.prototype.log,
    warn: Logger.prototype.warn,
    error: Logger.prototype.error,
  };
  Logger.prototype.log = function () {};
  Logger.prototype.error = function () {};
  Logger.prototype.warn = function (msg: any) { lines.push(String(msg)); };
  return {
    lines,
    restore() {
      Logger.prototype.log = original.log;
      Logger.prototype.warn = original.warn;
      Logger.prototype.error = original.error;
    },
  };
}

function bootCapturing(dir: string): { svc: ProblemsService; warnings: string[] } {
  const cap = captureWarnings();
  try {
    const svc = new ProblemsService();
    svc.setProblemsDirForTesting(dir);
    svc.onModuleInit();
    return { svc, warnings: cap.lines };
  } finally {
    cap.restore();
  }
}

describe('ProblemsService warns about a missing meta.json order field', () => {
  let tmpRoot: string;

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cpp-svc-order-'));

    // Ordered problems, named so that a lexicographic sort on the
    // directory name would produce the opposite order. If `order` ever
    // stops being honored these two flip and the assertion below fails.
    writeProblem(tmpRoot, 'zzz-ordered-first', meta('Ordered First', { order: 0 }));
    writeProblem(tmpRoot, 'mmm-ordered-second', meta('Ordered Second', { order: 1 }));

    // The case under test: valid in every other respect, just no `order`.
    writeProblem(tmpRoot, 'aaa-no-order', meta('No Order'));
  });

  after(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('warns once, naming the problem id and the field', () => {
    const { warnings } = bootCapturing(tmpRoot);
    const hits = warnings.filter(w => w.includes('aaa-no-order') && /order/.test(w));
    assert.equal(hits.length, 1, `expected exactly one order warning, got: ${JSON.stringify(warnings)}`);
    assert.match(hits[0], /'order'/);
  });

  it('does not warn about problems that declare order', () => {
    const { warnings } = bootCapturing(tmpRoot);
    assert.equal(warnings.filter(w => w.includes('zzz-ordered-first')).length, 0);
    assert.equal(warnings.filter(w => w.includes('mmm-ordered-second')).length, 0);
  });

  it('is non-fatal: the problem still loads and still serves detail', () => {
    const { svc } = bootCapturing(tmpRoot);
    assert.ok(svc.list().some(p => p.id === 'aaa-no-order'));
    assert.equal(svc.detail('aaa-no-order').title, 'No Order');
  });

  it('sorts the order-less problem last, not alphabetically first', () => {
    const { svc } = bootCapturing(tmpRoot);
    assert.deepEqual(
      svc.list().map(p => p.id),
      ['zzz-ordered-first', 'mmm-ordered-second', 'aaa-no-order'],
    );
  });

  it('does not double-log when order is present but the wrong type', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpp-svc-order-bad-'));
    try {
      // A non-number `order` is a hard validation error, not a missing
      // field: assertMeta rejects it, so populateCache skips the problem
      // and logs a line naming the field and the offending value. A
      // second warning from readOrderHint would report the same mistake
      // twice with less detail.
      writeProblem(dir, 'string-order', meta('String Order', { order: '3' }));
      const { warnings } = bootCapturing(dir);
      assert.equal(
        warnings.filter(w => /no 'order' field/.test(w)).length,
        0,
        `wrong-typed order must not add a second warning, got: ${JSON.stringify(warnings)}`,
      );
      const skip = warnings.filter(w => w.includes('string-order'));
      assert.equal(skip.length, 1, `expected exactly the populateCache skip line, got: ${JSON.stringify(warnings)}`);
      assert.match(skip[0], /'order'/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stays silent when meta.json is unparseable — populateCache already reports that', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpp-svc-order-json-'));
    try {
      writeProblem(dir, 'bad-json', '{ this is not valid JSON');
      const { warnings } = bootCapturing(dir);
      const orderWarnings = warnings.filter(w => /no 'order' field/.test(w));
      assert.equal(
        orderWarnings.length,
        0,
        `unparseable meta.json must not add an order warning, got: ${JSON.stringify(warnings)}`,
      );
      // The skip line from populateCache is still there — that is the one
      // carrying the actual reason, and it must not have been crowded out.
      assert.ok(warnings.some(w => w.includes('bad-json') && /Skipping problem/.test(w)));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('strips CR/LF from the id before logging it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpp-svc-order-crlf-'));
    try {
      // A directory name containing a newline is legal on macOS. Without
      // the strip, the warn line would break in two and the second half
      // would be attacker-chosen text sitting at the start of a log line.
      writeProblem(dir, 'evil\nFAKE: attack', meta('Evil'));
      const { warnings } = bootCapturing(dir);
      const hit = warnings.find(w => /no 'order' field/.test(w));
      assert.ok(hit, 'expected an order warning');
      assert.ok(!hit.includes('\n'), `warning must be a single line, got: ${JSON.stringify(hit)}`);
      assert.ok(hit.includes('evil_FAKE: attack'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
