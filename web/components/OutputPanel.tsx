'use client';

import { useRef, useEffect, useState } from 'react';
import type { TestResult } from '@/lib/types';

interface OutputLine {
  text: string;
  cls: string;
}

interface OutputPanelProps {
  lines: OutputLine[];
  testResults: TestResult[];
  label: string;
  summary: string | null;
}

export function OutputPanel({ lines, testResults, label, summary }: OutputPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines.length, testResults.length]);

  const hasTests = testResults.length > 0;
  const hasLines = lines.length > 0;
  const isEmpty = !hasTests && !hasLines;

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
          {hasTests && (
            <span className="text-[10px] text-text-mute/60 tabular-nums">
              {testResults.length} tests
            </span>
          )}
          {!hasTests && hasLines && (
            <span className="text-[10px] text-text-mute/60 tabular-nums">
              {lines.length} lines
            </span>
          )}
        </div>
        {summary && <SummaryBadge summary={summary} />}
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[12.5px] bg-[#111114]">
        {isEmpty ? (
          <EmptyState />
        ) : (
          <div className="leading-[1.7]">
            {/* Raw output lines (compile errors, run output) */}
            {hasLines && (
              <div className={hasTests ? 'mb-3' : ''}>
                {lines.map((line, i) => (
                  <div key={i} className={`whitespace-pre-wrap break-words ${line.cls}`}>
                    {line.text}
                  </div>
                ))}
              </div>
            )}

            {/* Structured test results */}
            {hasTests && (
              <div className="flex flex-col gap-0.5">
                {testResults.map((t, i) => (
                  <TestResultRow key={i} result={t} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TestResultRow({ result }: { result: TestResult }) {
  const [expanded, setExpanded] = useState(false);
  const passed = result.status === 'pass';
  const hasFail = !passed && !!result.message;

  return (
    <div className="animate-fade-in">
      <button
        onClick={() => hasFail && setExpanded(e => !e)}
        className={`flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-md transition-colors ${
          hasFail ? 'cursor-pointer hover:bg-white/[0.03]' : 'cursor-default'
        }`}
        aria-expanded={hasFail ? expanded : undefined}
      >
        {/* Status icon */}
        {passed ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-pass shrink-0">
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" opacity="0.3" />
            <path d="M4 7.2L6 9.2L10 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-fail shrink-0">
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" opacity="0.3" />
            <path d="M5 5L9 9M9 5L5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        )}

        {/* Test name */}
        <span className={`text-[12px] flex-1 truncate ${passed ? 'text-text-base' : 'text-text-bright'}`}>
          {result.name}
        </span>

        {/* Duration */}
        {result.duration != null && (
          <span className="text-[10px] text-text-mute tabular-nums shrink-0">
            {result.duration < 1000 ? `${result.duration}ms` : `${(result.duration / 1000).toFixed(1)}s`}
          </span>
        )}

        {/* Expand chevron */}
        {hasFail && (
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="none"
            className={`text-text-mute shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
          >
            <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Expanded failure detail */}
      {expanded && result.message && (
        <div className="ml-7 mr-2 mb-2 px-3 py-2 rounded-md bg-fail/[0.06] border border-fail/15 text-[11.5px] text-fail/90 whitespace-pre-wrap break-words leading-relaxed animate-fade-in">
          {result.message}
        </div>
      )}
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
