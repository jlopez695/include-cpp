'use client';

import { useEffect, useRef } from 'react';

interface ProblemDescriptionProps {
  html: string;
}

/**
 * Renders pre-rendered, syntax-highlighted HTML produced server-side in
 * lib/markdown-server. The MD/remark/rehype/highlight.js libraries that
 * used to ship to the client (~200KB minified) now run only at build
 * time. After mount, we walk every <pre> and inject a copy button — the
 * only piece of interactivity the original component had.
 */
export function ProblemDescription({ html }: ProblemDescriptionProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Defer button wiring to idle time. The description is fully readable
    // (scrollable, text-selectable) without copy buttons, so we let the
    // browser finish more critical work before we touch the DOM. On browsers
    // that don't support requestIdleCallback (Safari < 16.4) we fall back to
    // setTimeout(0), which still pushes the work past the current task.
    const cleanups: Array<() => void> = [];
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const wire = () => {
      const root = ref.current;
      if (!root) return;
      const pres = Array.from(root.querySelectorAll('pre'));
      for (const pre of pres) {
        // Avoid double-wiring if the effect re-runs (StrictMode dev).
        if (pre.querySelector(':scope > .copy-btn')) continue;
        (pre as HTMLPreElement).style.position = 'relative';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'copy-btn';
        btn.textContent = 'Copy';
        btn.setAttribute('aria-label', 'Copy code');

        const handler = () => {
          // Prefer the inner <code>'s textContent: pre.textContent walks ALL
          // descendants, including the copy button we just appended, so
          // falling back to pre.textContent on a code block without an
          // inner <code> would copy "...code...Copy" with the button label
          // tacked on the end. rehype-stringify always wraps fenced blocks
          // in <code>, but a future markdown plugin could emit a bare <pre>
          // and this fallback would be wrong; leaving the comment as the
          // breadcrumb for that future bug.
          const code = pre.querySelector('code');
          const text = (code?.textContent ?? pre.textContent ?? '').replace(/\n$/, '');
          // Same guards as OutputPanel.handleCopy: navigator.clipboard is
          // undefined on insecure origins and writeText can reject (permission
          // denied, document not focused). The bare .then(...) below would
          // surface those as unhandled promise rejections in the console
          // every time the user clicked Copy on a misbehaving browser.
          if (typeof navigator === 'undefined' || !navigator.clipboard) return;
          navigator.clipboard.writeText(text).then(
            () => {
              btn.textContent = 'Copied!';
              window.setTimeout(() => {
                btn.textContent = 'Copy';
              }, 1500);
            },
            () => { /* clipboard write rejected — leave the button label alone */ },
          );
        };
        btn.addEventListener('click', handler);
        pre.appendChild(btn);
        cleanups.push(() => {
          btn.removeEventListener('click', handler);
          btn.remove();
        });
      }
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(wire, { timeout: 1500 });
    } else {
      timeoutId = setTimeout(wire, 0);
    }

    return () => {
      if (idleId !== undefined && typeof window !== 'undefined'
        && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      for (const fn of cleanups) fn();
    };
  }, [html]);

  return (
    // Intentionally no `key` here. The previous shape — key={html.slice(0, 50)}
    // — was a remount-on-html-change trick that misfired on prefix-collision:
    // two problems whose markdown starts with the same 50 characters
    // (very common when problems share an intro template like
    // `# Problem ...\n\nWrite a function that ...`) got the same key, React
    // skipped the remount, the [html] effect ran cleanup against the stale
    // DOM (already replaced by dangerouslySetInnerHTML) and wired buttons
    // onto the new DOM — leaving the old buttons orphaned and producing
    // duplicate copy buttons under certain navigation orders. The parent
    // route already remounts this component when the problem id changes
    // (web/app/problems/[id]/page.tsx); the [html] dependency on the
    // effect handles same-component html updates without needing a key.
    <div
      ref={ref}
      className="flex-1 overflow-y-auto px-6 pt-[22px] pb-8 prose animate-fade-in"
      role="article"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
