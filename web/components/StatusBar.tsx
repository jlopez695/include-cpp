'use client';

import { useState, useEffect } from 'react';
import { useHealthCheck } from '@/hooks/useHealthCheck';

interface StatusBarProps {
  activeFile: string;
  isEditable: boolean;
  cursorLine: number;
  cursorCol: number;
  onShowShortcuts?: () => void;
}

/**
 * Minimal footer: filename, cursor position when editable, plus two utility
 * actions on the right. The earlier version had an API-health dot, language
 * pill, VIM badge, "Compiling…" text, and a "read-only" italic — all
 * duplicated elsewhere (vim status row, file-tab lock, in-bar Running spinner).
 */
export function StatusBar({
  activeFile,
  isEditable,
  cursorLine,
  cursorCol,
  onShowShortcuts,
}: StatusBarProps) {
  const healthStatus = useHealthCheck();
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('potd:theme');
    if (saved === 'light') {
      setDark(false);
      document.documentElement.classList.add('light');
    }
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.remove('light');
      localStorage.setItem('potd:theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      localStorage.setItem('potd:theme', 'light');
    }
  };

  return (
    <footer
      className="h-7 bg-bg-1 border-t border-border-soft flex items-center px-3 gap-3 text-[11px] text-text-mute shrink-0 font-mono"
      role="status"
    >
      <span className="text-text-dim truncate">{activeFile || '—'}</span>
      {/* Only show the health indicator when something is wrong — quiet by default. */}
      {healthStatus !== 'connected' && (
        <span
          className={healthStatus === 'degraded' ? 'text-warn' : 'text-fail'}
          title={healthStatus === 'degraded' ? 'Backend degraded' : 'Backend disconnected'}
        >
          ●
        </span>
      )}

      <div className="flex-1" />

      {isEditable && (
        <span className="tabular-nums">Ln {cursorLine}, Col {cursorCol}</span>
      )}
      {onShowShortcuts && (
        <button
          onClick={onShowShortcuts}
          title="Keyboard shortcuts (Cmd+?)"
          className="hit-area-lg w-5 h-5 flex items-center justify-center text-text-mute hover:text-text-base transition-colors"
          aria-label="Show keyboard shortcuts"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.25" />
            <path d="M4.5 4.5C4.5 3.7 5.2 3 6 3C6.8 3 7.5 3.7 7.5 4.5C7.5 5.3 6 5.5 6 6.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            <circle cx="6" cy="8.5" r="0.5" fill="currentColor" />
          </svg>
        </button>
      )}
      <button
        onClick={toggleTheme}
        title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
        className="hit-area-lg w-5 h-5 flex items-center justify-center text-text-mute hover:text-text-base transition-colors"
        aria-label="Toggle theme"
      >
        {dark ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="1.25" />
            <path d="M6 1V2.5M6 9.5V11M1 6H2.5M9.5 6H11M2.5 2.5L3.5 3.5M8.5 8.5L9.5 9.5M9.5 2.5L8.5 3.5M3.5 8.5L2.5 9.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M10 7.5A4.5 4.5 0 1 1 4.5 2C5.5 3 6 4.5 6 6C6 7.5 6.5 9 7.5 10C8.5 9.5 9.5 8.5 10 7.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </footer>
  );
}
