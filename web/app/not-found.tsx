import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="h-screen flex items-center justify-center bg-bg-0">
      <div className="text-center">
        <div className="text-[48px] font-medium text-text-mute/30 leading-none mb-4">404</div>
        <h1 className="text-[15px] font-medium text-text-bright mb-2">Page not found</h1>
        <p className="text-[13px] text-text-dim mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="px-3 py-1 rounded text-[13px] font-medium text-accent border border-accent/40 hover:bg-accent/10 transition-colors no-underline"
        >
          Go to problems
        </Link>
      </div>
    </div>
  );
}
