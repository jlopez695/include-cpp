'use client';

import { useState, useEffect } from 'react';
import type { HealthResponse } from '@/lib/types';
import { classifyHealth, type HealthStatus } from '@/lib/health';

const POLL_INTERVAL = 30_000; // 30 seconds

export function useHealthCheck() {
  const [status, setStatus] = useState<HealthStatus>('connected');

  useEffect(() => {
    let mounted = true;
    let id: ReturnType<typeof setInterval> | undefined;

    async function check() {
      try {
        const res = await fetch('/api/health');
        if (!mounted) return;
        if (!res.ok) {
          setStatus(classifyHealth(null, true));
          return;
        }
        const data: HealthResponse = await res.json();
        setStatus(classifyHealth(data, false));
      } catch {
        if (mounted) setStatus(classifyHealth(null, true));
      }
    }

    function start() {
      if (id !== undefined) return;
      check();
      id = setInterval(check, POLL_INTERVAL);
    }

    function stop() {
      if (id === undefined) return;
      clearInterval(id);
      id = undefined;
    }

    // Skip polling while the tab is in the background. Resumes with an
    // immediate fresh check on visibility return so the status indicator
    // reflects current state instead of stale 30-seconds-ago data.
    function onVisibility() {
      if (document.hidden) stop();
      else start();
    }

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      mounted = false;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return status;
}
