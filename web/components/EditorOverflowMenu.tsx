'use client';

import { useEffect, useRef, useState } from 'react';

interface MenuItem {
  label: string;
  active: boolean;
  onToggle: () => void;
  /** Optional right-side hint, e.g. tab-size value */
  hint?: string;
}

interface EditorOverflowMenuProps {
  items: MenuItem[];
}

/**
 * Trailing ⋯ button on the editor action bar that opens a popover for
 * settings used too rarely to deserve permanent visual real estate
 * (vim mode, word wrap, minimap, tab size). Full keyboard nav: ↑/↓ to
 * move between items, Enter/Space to toggle, Esc to close, return focus
 * to the trigger on close. Click-outside also closes.
 */
export function EditorOverflowMenu({ items }: EditorOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        menuRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Focus current item when menu opens or focusedIdx changes
  useEffect(() => {
    if (open) itemRefs.current[focusedIdx]?.focus();
  }, [open, focusedIdx]);

  // Esc closes and returns focus to trigger
  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIdx(i => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIdx(i => (i - 1 + items.length) % items.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusedIdx(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setFocusedIdx(items.length - 1);
    }
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => {
          setFocusedIdx(0);
          setOpen(o => !o);
        }}
        title="More editor settings"
        className={`hit-area w-7 h-7 flex items-center justify-center transition-colors ${
          open ? 'text-accent' : 'text-text-mute hover:text-text-base'
        }`}
        aria-label="More editor settings"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <circle cx="3" cy="7" r="1.2" />
          <circle cx="7" cy="7" r="1.2" />
          <circle cx="11" cy="7" r="1.2" />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Editor settings"
          onKeyDown={handleMenuKeyDown}
          className="absolute bottom-full right-0 mb-2 w-52 bg-bg-1 border border-border-soft rounded shadow-2xl py-1 z-30 animate-fade-in"
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={el => { itemRefs.current[i] = el; }}
              role="menuitemcheckbox"
              aria-checked={item.active}
              onClick={() => item.onToggle()}
              className={`w-full flex items-center justify-between px-3 py-1.5 text-[12px] transition-colors ${
                item.active ? 'text-accent' : 'text-text-base'
              } hover:bg-bg-3`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`w-3 h-3 inline-flex items-center justify-center rounded-sm border ${
                    item.active
                      ? 'bg-accent border-accent text-bg-0'
                      : 'border-border-strong'
                  }`}
                  aria-hidden="true"
                >
                  {item.active && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4L3.3 5.8L6.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {item.label}
              </span>
              {item.hint && (
                <span className="text-text-mute text-[11px] tabular-nums">{item.hint}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
