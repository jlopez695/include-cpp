'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="h-screen flex items-center justify-center bg-bg-0">
      <div className="text-center max-w-md">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-fail/10 flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-fail">
            <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 6V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="10" cy="14" r="0.75" fill="currentColor" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-text-bright mb-2">Something went wrong</h1>
        <p className="text-sm text-text-dim mb-6">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-bg-0 hover:brightness-110 transition-all"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M2.5 6.5A4 4 0 1 1 3.5 9.5" />
            <path d="M2 3.5V6.5H5" />
          </svg>
          Try again
        </button>
      </div>
    </div>
  );
}
