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
        <h1 className="text-[15px] font-medium text-text-bright mb-2">Something went wrong</h1>
        <p className="text-[13px] text-text-dim mb-6">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={reset}
          className="px-3 py-1 rounded text-[13px] font-medium text-accent border border-accent/40 hover:bg-accent/10 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
