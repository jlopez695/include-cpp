'use client';

import { useEffect } from 'react';

interface KeyboardShortcutsProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ['\u2318', 'Enter'], desc: 'Run code' },
  { keys: ['\u2318', '\u21E7', 'Enter'], desc: 'Run tests' },
  { keys: ['\u2318', 'S'], desc: 'Save (auto-saved)' },
  { keys: ['\u2318', '/'], desc: 'Toggle comment' },
  { keys: ['\u2318', 'D'], desc: 'Select next occurrence' },
  { keys: ['\u2318', '\u21E7', 'K'], desc: 'Delete line' },
  { keys: ['Alt', '\u2191/\u2193'], desc: 'Move line up/down' },
  { keys: ['\u2318', '[/]'], desc: 'Indent/outdent' },
  { keys: ['\u2318', '?'], desc: 'Show this cheatsheet' },
];

export function KeyboardShortcuts({ open, onClose }: KeyboardShortcutsProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-bg-1 border border-border-soft rounded-xl shadow-2xl w-[380px] animate-pop-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-soft">
          <h2 className="text-[13px] font-semibold text-text-bright">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-text-dim hover:text-text-bright hover:bg-bg-3 transition-colors"
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-3">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-border-soft/50 last:border-0">
              <span className="text-[12px] text-text-base">{s.desc}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, j) => (
                  <kbd key={j} className="text-[11px] bg-bg-3 text-text-dim px-2 py-0.5 rounded border border-border-soft font-mono">
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-2.5 border-t border-border-soft">
          <span className="text-[10px] text-text-mute">Press <kbd>Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
