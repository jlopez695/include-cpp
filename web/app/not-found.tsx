import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="h-screen flex items-center justify-center bg-bg-0">
      <div className="text-center">
        <div className="text-[72px] font-extrabold text-text-mute/20 leading-none mb-2">404</div>
        <h1 className="text-xl font-bold text-text-bright mb-2">Page not found</h1>
        <p className="text-sm text-text-dim mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-bg-0 hover:brightness-110 transition-all no-underline"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M9 6H3M3 6L5.5 3.5M3 6L5.5 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Go to problems
        </Link>
      </div>
    </div>
  );
}
