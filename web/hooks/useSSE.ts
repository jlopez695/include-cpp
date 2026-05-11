'use client';

import { useRef, useCallback, useState } from 'react';
import type { StreamEvent, SentinelEvent } from '@/lib/types';
import { getUserId } from '@/lib/storage';

/** POST requests go directly to the backend (Next.js rewrite proxy doesn't handle POST bodies reliably). */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface SSEState {
  connected: boolean;
  error: string | null;
}

interface SSECallbacks {
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
  onSentinel?: (event: SentinelEvent) => void;
  onCompileStart?: () => void;
  onCompileEnd?: (exitCode: number, killedByTimeout: boolean) => void;
  onRunStart?: () => void;
  onRunEnd?: (exitCode: number, killedByTimeout: boolean) => void;
  onDone?: (passed: number, total: number, exitCode: number) => void;
  onError?: (message: string) => void;
}

/**
 * SSE consumer with abort support.
 *
 * Uses `fetch` instead of `EventSource` because we need to POST with a body.
 * Parses the `text/event-stream` format manually.
 */
export function useSSE() {
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<SSEState>({ connected: false, error: null });

  const run = useCallback(
    async (
      problemId: string,
      files: Record<string, string>,
      mode: 'run' | 'test',
      callbacks: SSECallbacks,
    ) => {
      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ connected: true, error: null });

      try {
        const res = await fetch(`${API_BASE}/api/problems/${problemId}/${mode}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files, userId: getUserId() }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const text = await res.text();
          const errMsg = res.status === 409
            ? 'A run is already in progress for this problem.'
            : `Server error: ${res.status} ${text}`;
          setState({ connected: false, error: errMsg });
          callbacks.onError?.(errMsg);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setState({ connected: false, error: 'No response body' });
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          let currentEvent = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              const raw = line.slice(6);
              try {
                const event = JSON.parse(raw) as StreamEvent;
                dispatch(event, callbacks);
              } catch {
                // Ignore malformed JSON
              }
              currentEvent = '';
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // User cancelled — not an error
          setState({ connected: false, error: null });
          return;
        }
        const msg = `Connection failed: ${err.message}`;
        setState({ connected: false, error: msg });
        callbacks.onError?.(msg);
      } finally {
        setState(s => ({ ...s, connected: false }));
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  return { run, abort, ...state };
}

function dispatch(event: StreamEvent, cb: SSECallbacks) {
  switch (event.kind) {
    case 'stdout':
      cb.onStdout?.(event.data);
      break;
    case 'stderr':
      cb.onStderr?.(event.data);
      break;
    case 'sentinel':
      cb.onSentinel?.(event.event);
      break;
    case 'compile-start':
      cb.onCompileStart?.();
      break;
    case 'compile-end':
      cb.onCompileEnd?.(event.exitCode, event.killedByTimeout);
      break;
    case 'run-start':
      cb.onRunStart?.();
      break;
    case 'run-end':
      cb.onRunEnd?.(event.exitCode, event.killedByTimeout);
      break;
    case 'done':
      cb.onDone?.(event.passed, event.total, event.exitCode);
      break;
    case 'error':
      cb.onError?.(event.message);
      break;
  }
}
