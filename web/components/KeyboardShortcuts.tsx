'use client';

import { Modal } from './Modal';

interface KeyboardShortcutsProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ['⌘', 'Enter'], desc: 'Run code' },
  { keys: ['⌘', '⇧', 'Enter'], desc: 'Run tests' },
  { keys: ['⌘', 'S'], desc: 'Save (auto-saved)' },
  { keys: ['⌘', '/'], desc: 'Toggle comment' },
  { keys: ['⌘', 'D'], desc: 'Select next occurrence' },
  { keys: ['⌘', '⇧', 'K'], desc: 'Delete line' },
  { keys: ['Alt', '↑/↓'], desc: 'Move line up/down' },
  { keys: ['⌘', '[/]'], desc: 'Indent/outdent' },
  { keys: ['⌘', '⇧', 'D'], desc: 'Diff with starter code' },
  { keys: ['⌘', 'B'], desc: 'Toggle sidebar' },
  { keys: ['⌘', '?'], desc: 'Show this cheatsheet' },
];

export function KeyboardShortcuts({ open, onClose }: KeyboardShortcutsProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keyboard Shortcuts"
      width={380}
      footer={<span className="text-[11px] text-text-mute">Press <kbd>Esc</kbd> to close</span>}
    >
      <div className="px-5 py-2">
        {SHORTCUTS.map((s, i) => (
          <div key={i} className="flex items-center justify-between py-1.5 last:border-0">
            <span className="text-[13px] text-text-base">{s.desc}</span>
            <div className="flex items-center gap-1">
              {s.keys.map((k, j) => (
                <kbd key={j} className="text-[11px] bg-bg-2 text-text-dim px-1.5 py-0.5 rounded font-mono border-0">
                  {k}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
