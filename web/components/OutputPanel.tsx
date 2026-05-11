'use client';

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
  return (
    <div
      className="flex flex-col h-full bg-bg-0 border-t border-border-soft overflow-hidden"
      role="log"
      aria-label="Program output"
      aria-live="polite"
    >
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-bg-1 border-b border-border-soft shrink-0">
        <span className="text-[10px] font-bold tracking-[1.4px] uppercase text-text-mute">
          {label || 'Output'}
        </span>
        {summary && (
          <span
            className={`text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full border ${
              summary.includes('failed')
                ? 'text-fail bg-fail/10 border-fail/30'
                : 'text-good bg-good/10 border-good/30'
            }`}
            role="status"
          >
            {summary}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[12.5px] bg-[#111114]">
        {lines.length === 0 ? (
          <div className="text-text-mute italic text-xs py-2">
            Run your code or run the tests to see output here.
          </div>
        ) : (
          <div className="leading-[1.65]">
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
