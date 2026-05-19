'use client';

import { useRef, useEffect, useState } from 'react';
import type { TestResult } from '@/lib/types';
import { formatOutputText } from '@/lib/output-format';

interface OutputLine {
  text: string;
  cls: string;
}

interface OutputPanelProps {
  lines: OutputLine[];
  testResults: TestResult[];
  label: string;
  summary: string | null;
  onRerunTests?: () => void;
  onClear?: () => void;
}

export function OutputPanel({ lines, testResults, label, summary, onRerunTests, onClear }: OutputPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  // Stick-to-bottom: only auto-scroll on new output if the user is already
  // near the bottom. If they've scrolled up to read earlier output mid-run,
  // we leave their scroll position alone instead of yanking them down on
  // every incoming SSE event. Ref (not state) so scroll events don't
  // trigger re-renders.
  const stickToBottomRef = useRef(true);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    // 40px tolerance covers sub-pixel rounding and one trailing line so a
    // quick scroll-tap doesn't "unstick" the panel by accident.
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    stickToBottomRef.current = distanceFromBottom < 40;
  };

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length, testResults.length]);

  const handleCopy = () => {
    const text = formatOutputText(lines, testResults);
    // navigator.clipboard.writeText can reject (permission denied, document
    // not focused, blocked by some Safari versions) and is undefined entirely
    // on http origins / file://. The previous code's bare `.then(...)` had
    // no catch, so any failure surfaced as an unhandled promise rejection
    // in the console without giving the user any indication. Wrap it: on
    // success show "Copied", on failure swallow silently — there's nothing
    // useful to retry from the panel chrome and the user can still select +
    // Cmd-C the output manually.
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => { /* clipboard write rejected — fall through quietly */ },
    );
  };

  const hasTests = testResults.length > 0;
  const hasFailed = testResults.some(t => t.status !== 'pass');
  const passedCount = testResults.reduce((n, t) => n + (t.status === 'pass' ? 1 : 0), 0);
  const hasLines = lines.length > 0;
  const isEmpty = !hasTests && !hasLines;

  return (
    <div
      className="flex flex-col h-full bg-bg-0 border-t border-border-soft overflow-hidden"
      role="log"
      aria-label="Program output"
      aria-live="polite"
    >
      {/* Header — sentence-case label, no eyebrow tracking, no SummaryBadge.
          The N / total counter already conveys pass/fail status. */}
      <div className="flex items-center justify-between px-3 h-9 bg-bg-1 border-b border-border-soft shrink-0 text-[12px]">
        <div className="flex items-center gap-2">
          <span className="text-text-dim">
            {label || 'Output'}
          </span>
          {hasTests && (
            <span className="text-text-mute tabular-nums" aria-live="polite">
              <span className={passedCount === testResults.length ? 'text-good' : 'text-text-base'}>
                {passedCount}
              </span>
              <span> / {testResults.length}</span>
            </span>
          )}
          {!hasTests && hasLines && (
            <span className="text-text-mute tabular-nums">{lines.length} lines</span>
          )}
          {summary && hasFailed === false && hasTests && (
            <span className="text-good">{summary}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!isEmpty && (
            <button
              onClick={handleCopy}
              className="text-text-mute hover:text-text-base transition-colors"
              aria-label="Copy output"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
          {!isEmpty && onClear && (
            <button
              onClick={onClear}
              className="text-text-mute hover:text-text-base transition-colors"
              aria-label="Clear output"
            >
              Clear
            </button>
          )}
          {hasFailed && onRerunTests && (
            <button
              onClick={onRerunTests}
              className="text-accent hover:underline"
            >
              Re-run
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[12.5px] bg-[#111114]"
      >
        {isEmpty ? (
          <EmptyState />
        ) : (
          <div className="leading-[1.7]">
            {hasLines && (
              <div className={hasTests ? 'mb-3' : ''}>
                {lines.map((line, i) => (
                  // Append-only is the common case for `lines`, so a
                  // bare `key={i}` was functionally fine — but if the
                  // parent ever resets/prepends, React reuses rows
                  // against the wrong text. Compose the index with a
                  // short text prefix as a cheap stable-enough key
                  // without introducing a new id stream.
                  <div
                    key={`${i}-${line.text.slice(0, 16)}`}
                    className={`whitespace-pre-wrap break-words ${line.cls}`}
                  >
                    {line.text}
                  </div>
                ))}
              </div>
            )}
            {hasTests && (
              <div className="flex flex-col gap-0.5">
                {testResults.map(t => (
                  // Key on the test NAME, not the array index. Pre-fix
                  // a re-run that returned the tests in a different
                  // order made React reuse the same TestResultRow
                  // instances — and TestResultRow holds local state
                  // (`expanded`) via useState. Index-keyed reuse left
                  // the "expanded" flag on the wrong row when the
                  // underlying result at that index changed. Sentinel
                  // names and JUnit testcase @_names are unique per
                  // suite, so `t.name` is a reliable identity key.
                  <TestResultRow key={t.name} result={t} />
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
    <div className={`animate-fade-in ${passed ? 'test-pass-pulse rounded' : ''}`}>
      <button
        onClick={() => hasFail && setExpanded(e => !e)}
        className={`flex items-center gap-2 w-full text-left py-1.5 px-2 rounded transition-colors ${
          hasFail ? 'cursor-pointer hover:bg-white/[0.04]' : 'cursor-default'
        }`}
        aria-expanded={hasFail ? expanded : undefined}
      >
        {passed ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-good shrink-0">
            <path d="M3 6.2L5 8.2L9 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-fail shrink-0">
            <path d="M3.5 3.5L8.5 8.5M8.5 3.5L3.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        )}
        <span className={`text-[12px] flex-1 truncate ${passed ? 'text-text-base' : 'text-text-bright'}`}>
          {result.name}
        </span>
        {result.duration != null && (
          <span className="text-[10px] text-text-mute tabular-nums shrink-0">
            {result.duration < 1000 ? `${result.duration}ms` : `${(result.duration / 1000).toFixed(1)}s`}
          </span>
        )}
        {hasFail && (
          <svg
            width="10" height="10" viewBox="0 0 12 12" fill="none"
            className={`text-text-mute shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
          >
            <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {expanded && result.message && (
        <div className="ml-7 mr-2 mb-2 px-3 py-2 rounded bg-fail/[0.06] border border-fail/15 text-[11px] leading-relaxed animate-fade-in">
          <FailureDetail message={result.message} />
        </div>
      )}
    </div>
  );
}

/**
 * Parses common test framework failure formats and renders an expected/actual
 * diff. Catch2, Google Test, and generic "expected X but got Y" all fall
 * through to the same compact diff layout.
 */
function FailureDetail({ message }: { message: string }) {
  const expansionMatch = message.match(/with expansion:\s*(.+?)\s*==\s*(.+?)(?:\n|$)/);
  const gtestMatch = message.match(/Expected:\s*(.+)\n\s*Actual:\s*(.+)/);
  const genericMatch = message.match(/expected\s+(.+?)\s+but\s+got\s+(.+?)(?:\n|$)/i);

  const diff = expansionMatch || gtestMatch || genericMatch;

  if (diff) {
    const [, expected, actual] = diff;
    return (
      <div className="flex flex-col gap-1.5">
        <div className="text-fail/90 whitespace-pre-wrap break-words">{message}</div>
        <div className="mt-1 flex flex-col gap-1 text-[11px] font-mono">
          <div className="flex items-baseline gap-2">
            <span className="text-good/70 text-[10px] w-16 shrink-0">expected</span>
            <span className="text-good bg-good/[0.08] px-2 py-0.5 rounded">{expected.trim()}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-fail/70 text-[10px] w-16 shrink-0">actual</span>
            <span className="text-fail bg-fail/[0.08] px-2 py-0.5 rounded">{actual.trim()}</span>
          </div>
        </div>
      </div>
    );
  }

  return <div className="text-fail/90 whitespace-pre-wrap break-words">{message}</div>;
}

function EmptyState() {
  return (
    <div className="text-text-mute text-[13px] py-2">
      Run code or tests (Cmd+Enter / Cmd+Shift+Enter)
    </div>
  );
}
