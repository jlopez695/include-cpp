'use client';

import { useState, useEffect } from 'react';
import type { HealthResponse } from '@/lib/types';
import { classifyHealth, type HealthStatus } from '@/lib/health';

const POLL_INTERVAL = 30_000; // 30 seconds

export function useHealthCheck() {
  const [status, setStatus] = useState<HealthStatus>('connected');

  useEffect(() => {
    let mounted = true;

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

    check();
    const id = setInterval(check, POLL_INTERVAL);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return status;
}
