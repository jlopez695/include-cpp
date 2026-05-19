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
  //
  // Baseline security headers added at the catch-all route so every
  // response carries the same defaults:
  //   - X-Content-Type-Options: nosniff — prevents MIME sniffing if a
  //     content-type bug ever sends HTML/JS with the wrong type. The
  //     16.x headers() API shape is unchanged from 15.x (verified
  //     against node_modules/next/dist/docs/01-app/03-api-reference/
  //     05-config/01-next-config-js/headers.md per AGENTS.md).
  //   - X-Frame-Options: DENY — blocks clickjacking. The 16.x doc
  //     notes this is superseded by CSP frame-ancestors in modern
  //     browsers, but X-Frame-Options is still respected by older
  //     ones AND has zero downside, so we set both layers when CSP
  //     is added later. DENY (not SAMEORIGIN) because this app
  //     never frames itself; allowing SAMEORIGIN would only widen
  //     the attack surface for an internal compromise.
  //   - Referrer-Policy: strict-origin-when-cross-origin — leaks
  //     only the scheme+host on cross-origin nav, never the
  //     query/path. Same default Vercel applies, included
  //     explicitly so a self-host without that default still gets
  //     it.
  //   - Permissions-Policy: hard-no on camera/mic/geo/browsing-
  //     topics — none of those APIs are used by this app and not
  //     setting the header leaves them on by default.
  // CSP intentionally NOT set here. The theme-init inline script in
  // layout.tsx fires before hydration to prevent FOUC and would
  // need a nonce or hash to coexist with a strict CSP — until we
  // wire that up, a wrong CSP would either break FOUC prevention
  // or be too permissive to be useful. Tracked as a follow-up.
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
    ];

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
      {
        // Catch-all source so the four baseline security headers
        // apply to every page response. Per the Next docs section
        // "Header Overriding Behavior," a later matching rule does
        // NOT replace an earlier one's distinct keys — the security
        // headers stack on top of the cache headers above, and the
        // /_next/static + /sw.js rules above also pick these up.
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default config;
