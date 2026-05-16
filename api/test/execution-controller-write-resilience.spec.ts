/**
 * Regression test for "raw.write to a destroyed ServerResponse crashes
 * the Node process".
 *
 * SSE flow shape:
 *
 *   1. Client POSTs /api/problems/:id/run, the controller flushes
 *      headers and starts streaming.
 *   2. ExecutionService.runStream spawns a child process and pipes
 *      stdout/stderr through emit() → write() → raw.write(...).
 *   3. Client disconnects (closes the tab, navigates away, hits the
 *      Stop button which aborts the fetch).
 *   4. The req.raw 'close' listener fires controller.abort(), which
 *      sends SIGKILL to the child process group.
 *   5. SIGKILL is not instant. For a few hundred ms after the abort
 *      lands, the child's stdout/stderr can still flush buffered
 *      chunks that were already in the pipe; the makefile-runner's
 *      on-end handler emits the unparsed tail through the same
 *      write() callback as well.
 *   6. Each of those write() calls hits a ServerResponse that has
 *      already been destroyed by the client disconnect. Pre-fix,
 *      raw.write() threw ERR_STREAM_WRITE_AFTER_END synchronously,
 *      the throw escaped the spawned child's 'data' event listener
 *      (Node's EventEmitter doesn't propagate listener throws — it
 *      surfaces them as `uncaughtException`), and depending on
 *      handlers the process could exit. At minimum every disconnected
 *      run logged a noisy stack trace.
 *
 * The fix flags `clientGone = true` from the req.raw 'close' listener
 * and short-circuits every subsequent write(). A try/catch around
 * raw.write() handles the race window between the boolean check and
 * the actual write (close fires async; a write already started can
 * still lose the race), flipping clientGone so queued chunks behind
 * it skip cleanly. raw.end() in the finally is also try/catch'd —
 * calling .end() on an already-destroyed socket throws.
 *
 * This is a structural test because exercising the race requires
 * spawning a real subprocess and a real network connection — possible
 * but flaky in CI. The structural pins are sufficient: every code
 * path that touches raw.* now goes through the guard.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('ExecutionController guards raw.write against destroyed sockets', () => {
  let source: string;
  before(() => {
    source = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'src', 'execution', 'execution.controller.ts'),
      'utf8',
    );
  });

  it('the req.raw close listener sets a clientGone flag (not just abort())', () => {
    // The original code was `req.raw.on('close', () => controller.abort())`.
    // That kills the child but doesn't stop subsequent writes from
    // reaching the destroyed socket. The flag is what lets `write` know.
    assert.match(
      source,
      /req\.raw\.on\(\s*['"]close['"][\s\S]+?clientGone\s*=\s*true/,
      'close listener must flag clientGone in addition to calling abort()',
    );
    // And it must still fire the abort — otherwise child processes leak.
    assert.match(source, /controller\.abort\(\)/);
  });

  it('the write helper short-circuits when clientGone is true', () => {
    // The write callback that the runners receive must check clientGone
    // BEFORE touching raw.write. Otherwise the first chunk after
    // disconnect still races to the destroyed socket and throws.
    const writeBlock = source.match(/const\s+write\s*=\s*\(event[^)]*\)\s*=>\s*\{[\s\S]+?\n\s*\};/);
    assert.ok(writeBlock, 'could not locate the write helper');
    assert.match(
      writeBlock![0],
      /if\s*\(\s*clientGone\s*\)\s*return\s*;/,
      'write must early-return when clientGone is set',
    );
  });

  it('raw.write is wrapped in try/catch so the post-check race cannot throw', () => {
    // The clientGone check and the actual raw.write run on different
    // event-loop turns. A write that passed the check can still lose
    // the race if 'close' fires while the write was queued. The catch
    // swallows the resulting ERR_STREAM_WRITE_AFTER_END and flips the
    // flag so subsequent chunks short-circuit.
    const writeBlock = source.match(/const\s+write\s*=\s*\(event[^)]*\)\s*=>\s*\{[\s\S]+?\n\s*\};/);
    assert.ok(writeBlock);
    assert.match(writeBlock![0], /try\s*\{[\s\S]+?raw\.write\(/);
    assert.match(writeBlock![0], /catch[\s\S]+?clientGone\s*=\s*true/);
  });

  it('raw.end() in the finally block is also guarded against the same race', () => {
    // After the runner promise resolves the finally runs raw.end(). If
    // the client disconnected during the run, raw is already destroyed
    // and .end() throws the same ERR_STREAM_WRITE_AFTER_END. The fix
    // skips end() when clientGone is set; the leftover try/catch covers
    // the tiny remaining race where clientGone flips between the check
    // and the call.
    assert.match(
      source,
      /if\s*\(\s*!\s*clientGone\s*\)\s*\{\s*try\s*\{\s*raw\.end\(\)/,
      'raw.end must be inside `if (!clientGone)` and try/catch wrapped — leaking a throw here defeats the rest of the fix',
    );
  });
});
