/**
 * Regression test for "useSSE silently swallows malformed SSE data
 * frames with zero observability."
 *
 * The original code:
 *
 *   try {
 *     const event = JSON.parse(raw) as StreamEvent;
 *     dispatch(event, callbacks);
 *   } catch {
 *     // Ignore malformed JSON
 *   }
 *
 * had three observability problems compounded:
 *
 *   1. A malformed frame produced no log, no warning, no callback —
 *      the event was dropped and the only signal was "the test results
 *      panel is missing rows the backend swears it sent." On the recent
 *      parseSentinels NaN audit, the silent-at-the-boundary behavior
 *      made the bug invisible for days; this pin keeps the breadcrumb
 *      requirement explicit so a future regression doesn't re-bury it.
 *
 *   2. A future backend version that adds a new event payload field
 *      whose shape no longer parses as StreamEvent would surface as
 *      "tests silently stop running" with no link back to the bad
 *      frame. With the warn, the operator gets the raw line and can
 *      diff it against the contract.
 *
 *   3. A truly malformed frame (partial network read that split a
 *      JSON object in a way the line-buffer didn't handle) would also
 *      be invisible. TextDecoder + \n-split should handle the common
 *      case, but the warn is a safety net for the cases it doesn't.
 *
 * The fix changes the catch to `console.warn('[useSSE] malformed event:', raw)`.
 * The valid event next to the malformed one MUST still dispatch — the
 * fix is purely additive observability, not a flow change.
 */

// Register a DOM before importing React so useSSE's useState/useRef/
// useEffect can run in a renderHook context.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();

import { describe, it, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { renderHook, act } from '@testing-library/react';

import { useSSE } from '../hooks/useSSE.js';

after(() => {
  GlobalRegistrator.unregister();
});

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function installFetchMock(streamBody: string): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const encoder = new TextEncoder();
  (globalThis as { fetch?: unknown }).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const stream = new ReadableStream({
      start(controller) {
        // Push the whole body in one chunk. The line-buffer split runs
        // on \n boundaries regardless of how many chunks the network
        // delivers, so a single-chunk fixture exercises the same code
        // path as a fragmented one for these assertions.
        controller.enqueue(encoder.encode(streamBody));
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };
  return { calls };
}

let warnCalls: unknown[][];
let originalWarn: typeof console.warn;

beforeEach(() => {
  warnCalls = [];
  originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnCalls.push(args); };
});

after(() => {
  if (originalWarn) console.warn = originalWarn;
});

describe('useSSE leaves a console.warn breadcrumb on malformed event frames', () => {
  it('warns with the offending raw line when JSON.parse fails on a data: frame', async () => {
    // One malformed frame followed by one valid frame. The valid frame
    // must still dispatch — observability is purely additive.
    const body =
      'event: stdout\n' +
      'data: {not valid json}\n' +
      '\n' +
      'event: stdout\n' +
      'data: {"kind":"stdout","data":"hello"}\n' +
      '\n';

    installFetchMock(body);

    const { result } = renderHook(() => useSSE());

    const stdoutReceived: string[] = [];
    await act(async () => {
      await result.current.run('POTD0', { 'main.cpp': 'int main(){}' }, 'run', {
        onStdout: (data) => { stdoutReceived.push(data); },
      });
    });

    // Breadcrumb assertion: a warn was emitted, and the raw bad line
    // appears verbatim in its arguments. A regression that re-silences
    // the catch will drop warnCalls to length 0.
    assert.ok(warnCalls.length > 0, 'expected console.warn to be called for the malformed frame');
    const allArgs = warnCalls.flat().map(String).join(' ');
    assert.match(allArgs, /\{not valid json\}/);

    // Dispatch assertion: the *valid* frame next to the malformed one
    // still reached the callback. A regression that broadens the
    // catch into a function-level abort would drop stdoutReceived to
    // length 0.
    assert.deepEqual(stdoutReceived, ['hello']);
  });

  it('warns with a [useSSE] prefix so the source is greppable in the console', () => {
    // The prefix is the contract a human operator scans for when
    // chasing a "missing test result" report. Pin it so a future
    // edit that drops the prefix gets caught — the same parseDiagnostics
    // / parseSentinels audits have demonstrated that searchable
    // breadcrumbs save hours.
    return (async () => {
      installFetchMock('event: stdout\ndata: {bad json\n\n');

      const { result } = renderHook(() => useSSE());
      await act(async () => {
        await result.current.run('POTD0', {}, 'run', {});
      });

      const allArgs = warnCalls.flat().map(String).join(' ');
      assert.match(allArgs, /\[useSSE\]/);
    })();
  });

  it('does not warn when every data: frame parses cleanly', async () => {
    installFetchMock(
      'event: stdout\ndata: {"kind":"stdout","data":"a"}\n\n' +
      'event: stdout\ndata: {"kind":"stdout","data":"b"}\n\n',
    );

    const { result } = renderHook(() => useSSE());
    const stdoutReceived: string[] = [];
    await act(async () => {
      await result.current.run('POTD0', {}, 'run', {
        onStdout: (data) => { stdoutReceived.push(data); },
      });
    });

    // No false positives — the warn is only on the actual catch path.
    assert.equal(warnCalls.length, 0, `unexpected warns on happy path: ${JSON.stringify(warnCalls)}`);
    assert.deepEqual(stdoutReceived, ['a', 'b']);
  });
});
