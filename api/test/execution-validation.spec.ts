import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ExecutionService } from '../src/execution/execution.service.js';
import { ProblemsService } from '../src/problems/problems.service.js';

function makeService(): ExecutionService {
  const problems = new ProblemsService();
  problems.onModuleInit();
  return new ExecutionService(problems);
}

describe('ExecutionService.validateRunRequest — filename allowlist', () => {
  // The runners write every key of `files` into their build tree (per-user
  // staging for cmake, tmpDir for makefile). Without this gate, an
  // attacker-controlled body could:
  //   - overlay tests/grader.cpp (a readOnlyFile) with a stub that always
  //     passes, and /test would happily report 100%;
  //   - submit "../../etc/something" and escape the staging dir;
  //   - clobber the entry/main.cpp on cmake problems.
  // This test pins the gate so a future refactor can't drop it silently.

  it('accepts a known editable filename', () => {
    const svc = makeService();
    // POTD0 (makefile build) — editableFiles is ["hello.cpp"]
    assert.doesNotThrow(() =>
      svc.validateRunRequest('POTD0', { 'hello.cpp': '/* whatever */' }),
    );
  });

  it('accepts an empty files map (nothing to overlay is trivially safe)', () => {
    const svc = makeService();
    assert.doesNotThrow(() => svc.validateRunRequest('POTD0', {}));
  });

  it('rejects a read-only test file submitted as user code (grader-spoof)', () => {
    const svc = makeService();
    assert.throws(
      () => svc.validateRunRequest('POTD0', { 'tests/grader.cpp': 'fake pass' }),
      { name: 'BadRequestException' },
      'must not let users overlay grader sources — they would game the score',
    );
  });

  it('rejects a path-traversal filename', () => {
    const svc = makeService();
    assert.throws(
      () => svc.validateRunRequest('POTD0', { '../../etc/passwd': 'malicious' }),
      { name: 'BadRequestException' },
    );
  });

  it('rejects an absolute-path filename', () => {
    const svc = makeService();
    assert.throws(
      () => svc.validateRunRequest('POTD0', { '/tmp/x': '' }),
      { name: 'BadRequestException' },
    );
  });

  it('rejects an unknown filename that is not in editableFiles', () => {
    const svc = makeService();
    assert.throws(
      () => svc.validateRunRequest('POTD0', { 'something-random.cpp': '' }),
      { name: 'BadRequestException' },
    );
  });

  it('rejects when one of several files is disallowed (all-or-nothing)', () => {
    const svc = makeService();
    assert.throws(
      () =>
        svc.validateRunRequest('POTD0', {
          'hello.cpp': '/* legit */',
          'tests/grader.cpp': '/* sneaky */',
        }),
      { name: 'BadRequestException' },
    );
  });

  it('throws NotFoundException for an unknown problem id', () => {
    const svc = makeService();
    assert.throws(
      () => svc.validateRunRequest('NONEXISTENT', { 'anything': '' }),
      { name: 'NotFoundException' },
    );
  });

  it('accepts a cmake problem with its nested editableFiles path', () => {
    const svc = makeService();
    // POTD64 (cmake build) — editableFiles is ["src/final.cpp"]
    assert.doesNotThrow(() =>
      svc.validateRunRequest('POTD64', { 'src/final.cpp': '/* code */' }),
    );
  });

  it('rejects entry/main.cpp on a cmake problem (readOnly entry)', () => {
    const svc = makeService();
    assert.throws(
      () => svc.validateRunRequest('POTD64', { 'entry/main.cpp': '/* hijack */' }),
      { name: 'BadRequestException' },
    );
  });
});
