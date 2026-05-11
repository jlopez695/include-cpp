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
});
