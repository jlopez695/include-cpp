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
      className="h-6 bg-bg-1 border-t border-border-soft flex items-center px-3.5 gap-3.5 text-[11px] text-text-dim shrink-0 font-mono tracking-[0.2px]"
      role="status"
    >
      <span>{activeFile || '\u2014'}</span>
      <span>{language.toUpperCase()}</span>
      {isEditable && (
        <span>
          Ln {cursorLine}, Col {cursorCol}
        </span>
      )}
      <div className="flex-1" />
      {compiling && (
        <span className="text-accent animate-pulse-soft">Compiling...</span>
      )}
      <span className="text-text-mute">Backend: localhost:3001</span>
    </footer>
  );
}
