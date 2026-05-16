'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Panel max-width in px. Defaults match the two existing modals. */
  width?: number;
}

/**
 * Shared modal chrome: backdrop, panel, title bar with close, optional footer.
 * Adds focus-trap on Tab/Shift+Tab cycling within the panel and returns focus
 * to whatever element opened the modal on close. Esc closes (handled here so
 * callers don't each repeat the keydown listener).
 */
export function Modal({ open, onClose, title, children, footer, width = 400 }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Hold the latest onClose in a ref so the focus/trap effect below doesn't
  // need it as a dep. Callers pass `onClose={() => setOpen(false)}` inline,
  // which is a fresh function identity on every parent render — putting it
  // in deps re-triggered the effect's cleanup + setup on every keystroke
  // in the parent. Each cleanup focused previouslyFocused.current (the
  // OPENER), then the new setup re-focused the first focusable in the
  // modal. Net effect: every parent re-render briefly stole focus out of
  // the modal and snapped it back, producing a visible focus-ring flicker
  // and, on screen readers, a re-announcement of the dialog. Anchoring
  // the effect to `[open]` alone fixes it.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    const focusables = panel?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    );
    focusables?.[0]?.focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        // Route through the ref so we always call the latest onClose
        // even though it's not in this effect's dep array.
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={panelRef}
        className="bg-bg-1 border border-border-soft/60 rounded-lg elevation-modal animate-fade-in"
        style={{ width }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-border-soft">
          <h2 className="text-[14px] font-semibold text-text-bright tracking-[-0.01em]">{title}</h2>
          <button
            onClick={onClose}
            className="hit-area-lg w-6 h-6 flex items-center justify-center text-text-mute hover:text-text-bright transition-colors"
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
        {footer && (
          <div className="px-5 py-2.5 border-t border-border-soft">{footer}</div>
        )}
      </div>
    </div>
  );
}
