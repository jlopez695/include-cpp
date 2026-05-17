import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Direct import (no path aliases in test runner)
import { parseDiagnostics } from '../lib/diagnostics.js';

describe('parseDiagnostics', () => {
  const knownFiles = ['hello.cpp', 'hello.h', 'tests/grader.cpp'];

  it('parses gcc error with line and column', () => {
    const stderr = `hello.cpp:10:5: error: use of undeclared identifier 'x'\n`;
    const result = parseDiagnostics(stderr, knownFiles);

    assert.equal(result.size, 1);
    const diags = result.get('hello.cpp')!;
    assert.equal(diags.length, 1);
    assert.deepEqual(diags[0], {
      line: 10,
      col: 5,
      severity: 'error',
      message: "use of undeclared identifier 'x'",
    });
  });

  it('parses warning severity', () => {
    const stderr = `hello.cpp:3:1: warning: unused variable 'y'\n`;
    const result = parseDiagnostics(stderr, knownFiles);
    assert.equal(result.get('hello.cpp')![0].severity, 'warning');
  });

  it('maps note severity to info', () => {
    const stderr = `hello.cpp:5:2: note: declared here\n`;
    const result = parseDiagnostics(stderr, knownFiles);
    assert.equal(result.get('hello.cpp')![0].severity, 'info');
  });

  it('extracts basename from absolute paths', () => {
    const stderr = `/home/user/problems/POTD0/hello.cpp:7:3: error: bad thing\n`;
    const result = parseDiagnostics(stderr, knownFiles);
    assert.equal(result.size, 1);
    assert.ok(result.has('hello.cpp'));
  });

  it('handles multiple errors in the same file', () => {
    const stderr = [
      'hello.cpp:1:1: error: first error',
      'hello.cpp:5:10: error: second error',
      'hello.cpp:8:1: warning: a warning',
    ].join('\n');

    const result = parseDiagnostics(stderr, knownFiles);
    assert.equal(result.get('hello.cpp')!.length, 3);
  });

  it('handles errors across multiple files', () => {
    const stderr = [
      'hello.cpp:1:1: error: error in cpp',
      'hello.h:3:5: warning: warning in header',
    ].join('\n');

    const result = parseDiagnostics(stderr, knownFiles);
    assert.equal(result.size, 2);
    assert.ok(result.has('hello.cpp'));
    assert.ok(result.has('hello.h'));
  });

  it('ignores lines for unknown files', () => {
    const stderr = `unknown.cpp:1:1: error: something\nhello.cpp:2:3: error: known\n`;
    const result = parseDiagnostics(stderr, knownFiles);
    assert.equal(result.size, 1);
    assert.ok(result.has('hello.cpp'));
  });

  it('ignores non-diagnostic lines', () => {
    const stderr = [
      'In file included from hello.cpp:1:',
      'hello.cpp:10:5: error: real error',
      'make: *** [Makefile:12: hello] Error 1',
    ].join('\n');

    const result = parseDiagnostics(stderr, knownFiles);
    assert.equal(result.get('hello.cpp')!.length, 1);
  });

  it('handles no column number (defaults to col 1)', () => {
    const stderr = `hello.cpp:42: error: linker error message\n`;
    const result = parseDiagnostics(stderr, knownFiles);
    assert.equal(result.size, 1);
    const diag = result.get('hello.cpp')![0];
    assert.equal(diag.line, 42);
    assert.equal(diag.col, 1);
  });

  it('returns empty map for clean compilation', () => {
    const stderr = '';
    const result = parseDiagnostics(stderr, knownFiles);
    assert.equal(result.size, 0);
  });

  /**
   * `fatal error:` regression. gcc and clang both prefix the
   * include-not-found message with "fatal error:", and the original
   * regex only matched `(error|warning|note):`. The result was that the
   * single most common student mistake on day one ("I typed the header
   * name wrong") produced zero markers — the user saw stderr text but
   * the editor had no red squiggle pointing at the offending #include
   * line. These tests pin that the `(?:fatal\s+)?` branch is wired in.
   */
  describe('fatal error severity (the include-not-found case)', () => {
    it("parses a gcc-shaped `fatal error:` line as severity=error", () => {
      const stderr = `hello.cpp:5:10: fatal error: nonexistent.h: No such file or directory\n`;
      const result = parseDiagnostics(stderr, knownFiles);
      assert.equal(result.size, 1);
      const diag = result.get('hello.cpp')![0];
      assert.equal(diag.severity, 'error', 'fatal error must surface as error severity (Monaco has no "fatal" tier)');
      assert.equal(diag.line, 5);
      assert.equal(diag.col, 10);
      assert.equal(diag.message, 'nonexistent.h: No such file or directory');
    });

    it("parses a clang-shaped `fatal error:` (slightly different message text)", () => {
      const stderr = `hello.cpp:5:10: fatal error: 'nonexistent.h' file not found\n`;
      const result = parseDiagnostics(stderr, knownFiles);
      const diag = result.get('hello.cpp')![0];
      assert.equal(diag.severity, 'error');
      assert.equal(diag.message, "'nonexistent.h' file not found");
    });

    it("does NOT match the literal word 'fatal' in the message body", () => {
      // Defensive: the prefix is anchored before the severity word, so a
      // diagnostic whose message HAPPENS to mention "fatal" stays parsed
      // normally and routes through the regular `error` severity.
      const stderr = `hello.cpp:3:1: error: fatal misuse of feature\n`;
      const result = parseDiagnostics(stderr, knownFiles);
      const diag = result.get('hello.cpp')![0];
      assert.equal(diag.severity, 'error');
      assert.equal(diag.message, 'fatal misuse of feature');
    });

    it('still routes warnings even when "fatal" never appears', () => {
      // Smoke check the non-fatal path didn't regress.
      const stderr = `hello.cpp:7:2: warning: unused variable 'z'\n`;
      const result = parseDiagnostics(stderr, knownFiles);
      assert.equal(result.get('hello.cpp')![0].severity, 'warning');
    });
  });

  /**
   * CRLF line-ending regression. DIAG_RE's `(.+)$` uses `.`, which in
   * JavaScript regex does NOT match `\r` (line terminator). Before the
   * fix, splitting stderr only on `\n` left a trailing `\r` glued to the
   * end of each line on any CRLF-emitting toolchain — and the whole
   * regex then failed, dropping the diagnostic completely. Visible
   * symptom: wall of compiler errors in the output panel but zero
   * red squiggles in Monaco. Toolchains affected: MinGW, Cygwin,
   * some C++ runtime libraries on Windows-flavored builds, and any
   * user explicitly writing `\r\n` newlines in their error messages.
   */
  describe('CRLF line endings (the silent-drop regression)', () => {
    it('parses an error from a CRLF-terminated stderr line', () => {
      const stderr = `hello.cpp:10:5: error: use of undeclared identifier 'x'\r\n`;
      const result = parseDiagnostics(stderr, knownFiles);
      assert.equal(result.size, 1, 'CRLF must not silently drop the diagnostic');
      const diag = result.get('hello.cpp')![0];
      assert.equal(diag.line, 10);
      assert.equal(diag.col, 5);
      assert.equal(diag.severity, 'error');
      // The message must NOT contain the trailing \r — Monaco's
      // marker tooltip would surface it as an artifact otherwise.
      assert.equal(diag.message, "use of undeclared identifier 'x'");
    });

    it('parses multiple CRLF-terminated diagnostics in one stderr block', () => {
      const stderr =
        'hello.cpp:1:1: error: first\r\n' +
        'hello.cpp:5:10: warning: second\r\n' +
        'hello.cpp:8:1: note: third\r\n';
      const result = parseDiagnostics(stderr, knownFiles);
      const diags = result.get('hello.cpp')!;
      assert.equal(diags.length, 3, 'all three CRLF-terminated diagnostics must be parsed');
      assert.equal(diags[0].message, 'first');
      assert.equal(diags[1].message, 'second');
      assert.equal(diags[2].message, 'third'); // note → info severity is covered elsewhere
    });

    it('parses a diagnostic when stderr has no final newline but trailing \\r', () => {
      // Subtle: the split eats \r before \n, but if the last "line" of
      // stderr is `foo\r` with NO following \n, the split leaves the
      // \r in place. The per-line strip catches it.
      const stderr = `hello.cpp:10:5: error: foo\r`;
      const result = parseDiagnostics(stderr, knownFiles);
      assert.equal(result.size, 1);
      assert.equal(result.get('hello.cpp')![0].message, 'foo');
    });

    it('mixed \\n and \\r\\n endings in one stderr block both parse', () => {
      // Some libc impls mix endings when buffered + unbuffered writers
      // interleave. Both terminators must produce parsed diagnostics
      // and neither must leak \r into the messages.
      const stderr =
        'hello.cpp:1:1: error: lf-line\n' +
        'hello.cpp:2:1: error: crlf-line\r\n';
      const result = parseDiagnostics(stderr, knownFiles);
      const diags = result.get('hello.cpp')!;
      assert.equal(diags.length, 2);
      assert.equal(diags[0].message, 'lf-line');
      assert.equal(diags[1].message, 'crlf-line');
    });
  });
});
