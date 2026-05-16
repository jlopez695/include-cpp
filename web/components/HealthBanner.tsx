'use client';

import { useState } from 'react';

interface HealthBannerProps {
  warnings: string[];
}

export function HealthBanner({ warnings }: HealthBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || warnings.length === 0) return null;

  return (
    <div
      className="bg-warn/10 border-b border-warn/25 px-4 py-2.5 flex items-center gap-3 text-xs text-warn shrink-0"
      role="alert"
    >
      <span className="font-medium shrink-0">Setup</span>
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
