'use client';

import { useEffect, useState } from 'react';
import type { HealthResponse } from '@/lib/types';

export function HealthBanner() {
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    fetch(`${apiBase}/api/health`)
      .then(r => r.json())
      .then((data: HealthResponse) => {
        if (data.warnings.length > 0) setWarnings(data.warnings);
      })
      .catch(() => {
        // Backend not reachable — will show elsewhere
      });
  }, []);

  if (dismissed || warnings.length === 0) return null;

  return (
    <div
      className="bg-warn/10 border-b border-warn/25 px-4 py-2 flex items-center gap-3 text-xs text-warn shrink-0"
      role="alert"
    >
      <span className="font-bold shrink-0">Setup</span>
      <div className="flex-1">
        {warnings.map((w, i) => (
          <div key={i}>{w}</div>
        ))}
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-text-dim hover:text-text-base px-2 py-1"
        aria-label="Dismiss warnings"
      >
        ✕
      </button>
    </div>
  );
}
