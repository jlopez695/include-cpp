'use client';

import { useState, useEffect } from 'react';
import { useHealthCheck } from '@/hooks/useHealthCheck';

interface StatusBarProps {
  activeFile: string;
  language: string;
  isEditable: boolean;
  cursorLine: number;
  cursorCol: number;
  compiling: boolean;
  vimMode?: boolean;
  onShowShortcuts?: () => void;
}

export function StatusBar({
  activeFile,
  language,
  isEditable,
  cursorLine,
  cursorCol,
  compiling,
  vimMode,
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
      className="h-[26px] bg-bg-1 border-t border-border-soft flex items-center px-4 gap-4 text-[11px] text-text-dim shrink-0 font-mono"
      role="status"
    >
      {/* Left cluster */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              healthStatus === 'connected' ? 'bg-good/80' :
              healthStatus === 'degraded' ? 'bg-warn/80' :
              'bg-fail/80'
            }`}
            title={
              healthStatus === 'connected' ? 'Backend connected' :
              healthStatus === 'degraded' ? 'Backend degraded' :
              'Backend disconnected'
            }
          />
          <span className="text-text-mute">API</span>
        </span>
        <span className="text-border-strong">|</span>
        <span className="text-text-base">{activeFile || '\u2014'}</span>
        <span className="px-1.5 py-px rounded bg-bg-3/60 text-text-mute text-[10px]">
          {language.toUpperCase()}
        </span>
      </div>

      <div className="flex-1" />

      {/* Right cluster */}
      <div className="flex items-center gap-3">
        {vimMode && (
          <span className="px-1.5 py-px rounded bg-accent/15 text-accent text-[10px] font-bold tracking-wider">
            VIM
          </span>
        )}
        {compiling && (
          <span className="flex items-center gap-1.5 text-accent animate-pulse-soft">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="animate-spin">
              <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" opacity="0.3" />
              <path d="M9 5A4 4 0 0 0 5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Compiling
          </span>
        )}
        {isEditable && (
          <span className="tabular-nums">
            Ln {cursorLine}, Col {cursorCol}
          </span>
        )}
        {!isEditable && (
          <span className="text-text-mute italic text-[10px]">read-only</span>
        )}
        {onShowShortcuts && (
          <button
            onClick={onShowShortcuts}
            title="Keyboard shortcuts (Cmd+?)"
            className="hit-area-lg w-5 h-5 flex items-center justify-center rounded text-text-mute hover:text-text-bright transition-colors"
            aria-label="Show keyboard shortcuts"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.1" />
              <path d="M4.5 4.5C4.5 3.7 5.2 3 6 3C6.8 3 7.5 3.7 7.5 4.5C7.5 5.3 6 5.5 6 6.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
              <circle cx="6" cy="8.5" r="0.5" fill="currentColor" />
            </svg>
          </button>
        )}
        <button
          onClick={toggleTheme}
          title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
          className="hit-area-lg w-5 h-5 flex items-center justify-center rounded text-text-mute hover:text-text-bright transition-colors"
          aria-label="Toggle theme"
        >
          {dark ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="1.2" />
              <path d="M6 1V2.5M6 9.5V11M1 6H2.5M9.5 6H11M2.5 2.5L3.5 3.5M8.5 8.5L9.5 9.5M9.5 2.5L8.5 3.5M3.5 8.5L2.5 9.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M10 7.5A4.5 4.5 0 1 1 4.5 2C5.5 3 6 4.5 6 6C6 7.5 6.5 9 7.5 10C8.5 9.5 9.5 8.5 10 7.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
    </footer>
  );
}
