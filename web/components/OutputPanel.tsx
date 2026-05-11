'use client';

import { useRef, useEffect } from 'react';

interface OutputLine {
  text: string;
  cls: string;
}

interface OutputPanelProps {
  lines: OutputLine[];
  label: string;
  summary: string | null;
}

export function OutputPanel({ lines, label, summary }: OutputPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new output
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines.length]);

  return (
    <div
      className="flex flex-col h-full bg-bg-0 border-t border-border-soft overflow-hidden"
      role="log"
      aria-label="Program output"
      aria-live="polite"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-bg-1 border-b border-border-soft shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-[1.4px] uppercase text-text-mute">
            {label || 'Output'}
          </span>
          {lines.length > 0 && (
            <span className="text-[10px] text-text-mute/60 tabular-nums">
              {lines.length} lines
            </span>
          )}
        </div>
        {summary && <SummaryBadge summary={summary} />}
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[12.5px] bg-[#111114]">
        {lines.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="leading-[1.7]">
            {lines.map((line, i) => (
              <div key={i} className={`whitespace-pre-wrap break-words ${line.cls}`}>
                {line.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryBadge({ summary }: { summary: string }) {
  const failed = summary.includes('failed') || summary.includes('0/');
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border animate-pop-in ${
        failed
          ? 'text-fail bg-fail/10 border-fail/25'
          : 'text-good bg-good/10 border-good/25'
      }`}
      role="status"
    >
      {failed ? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M3 3L7 7M7 3L3 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5.5L4 7.5L8 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {summary}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-6 animate-fade-in">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-text-mute/30 mb-3">
        <rect x="4" y="6" width="24" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 14L14 18L10 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 22H22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div className="text-text-mute text-xs">Run your code or tests to see output</div>
      <div className="text-text-mute/50 text-[10px] mt-1.5 font-mono">
        Cmd+Enter to run &middot; Cmd+Shift+Enter to test
      </div>
    </div>
  );
}
