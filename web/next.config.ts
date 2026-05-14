import type { NextConfig } from 'next';

const IMMUTABLE = 'public, max-age=31536000, immutable';

const config: NextConfig = {
  reactStrictMode: true,
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
  // Defensive cache headers. Next emits these for /_next/static/* by default,
  // but some hosts strip framework headers, so we re-assert them here. Hashed
  // chunks + fonts are content-addressed so we can mark them immutable for a
  // year; the service worker (public/sw.js) also caches them on first hit so
  // repeat visits skip the network entirely.
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: IMMUTABLE }],
      },
      {
        source: '/sw.js',
        headers: [
          // Never cache the SW itself — must always re-check so we can roll
          // out new versions. The SW is tiny so the round-trip is cheap.
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default config;
