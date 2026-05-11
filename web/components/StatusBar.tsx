'use client';

interface StatusBarProps {
  activeFile: string;
  language: string;
  isEditable: boolean;
  cursorLine: number;
  cursorCol: number;
  compiling: boolean;
}

export function StatusBar({
  activeFile,
  language,
  isEditable,
  cursorLine,
  cursorCol,
  compiling,
}: StatusBarProps) {
  return (
    <footer
      className="h-[26px] bg-bg-1 border-t border-border-soft flex items-center px-4 gap-4 text-[11px] text-text-dim shrink-0 font-mono"
      role="status"
    >
      {/* Left cluster */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-good/80" title="Backend connected" />
          <span className="text-text-mute">API</span>
        </span>
        <span className="text-border-strong">|</span>
        <span className="text-text-base">{activeFile || '\u2014'}</span>
        <span className="px-1.5 py-px rounded bg-bg-3/60 text-text-mute text-[10px]">
          {language.toUpperCase()}
        </span>
      </div>

      <div className="flex-1" />

      {/* Right cluster */}
      <div className="flex items-center gap-3">
        {compiling && (
          <span className="flex items-center gap-1.5 text-accent animate-pulse-soft">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="animate-spin">
              <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" opacity="0.3" />
              <path d="M9 5A4 4 0 0 0 5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Compiling
          </span>
        )}
        {isEditable && (
          <span className="tabular-nums">
            Ln {cursorLine}, Col {cursorCol}
          </span>
        )}
        {!isEditable && (
          <span className="text-text-mute italic text-[10px]">read-only</span>
        )}
      </div>
    </footer>
  );
}
