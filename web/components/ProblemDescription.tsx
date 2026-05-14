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
    const root = ref.current;
    if (!root) return;
    const pres = Array.from(root.querySelectorAll('pre'));
    const cleanups: Array<() => void> = [];

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
        const code = pre.querySelector('code');
        const text = (code?.textContent ?? pre.textContent ?? '').replace(/\n$/, '');
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = 'Copied!';
          window.setTimeout(() => {
            btn.textContent = 'Copy';
          }, 1500);
        });
      };
      btn.addEventListener('click', handler);
      pre.appendChild(btn);
      cleanups.push(() => {
        btn.removeEventListener('click', handler);
        btn.remove();
      });
    }

    return () => {
      for (const fn of cleanups) fn();
    };
  }, [html]);

  return (
    <div
      ref={ref}
      key={html.slice(0, 50)}
      className="flex-1 overflow-y-auto px-6 pt-[22px] pb-8 prose-potd animate-fade-in"
      role="article"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
