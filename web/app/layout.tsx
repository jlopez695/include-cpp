import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import { SupabasePrewarmer } from '@/components/SupabasePrewarmer';
import './globals.css';

// 400 / 500 / 600. 600 is reserved for display moments (TopBar problem title,
// ProgressDashboard hero stat, prose h1/h2) — body/UI stays 400/500.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['400', '500', '600'],
});
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: '#include <cpp>',
  description: 'Learn C++ from zero to data structures — a browser-based IDE with graded practice problems and video lessons',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// Synchronous theme initializer: reads localStorage and applies the `light`
// class to <html> BEFORE the page paints, eliminating the dark→light flash
// for users who picked light mode. StatusBar's React-side useEffect runs
// after hydration, so without this script the page would render in dark
// for ~50-300ms before snapping to light on the first useEffect tick.
// Wrapped in try/catch because Safari Private Mode and locked-down
// browsers can throw on localStorage access; the fallback is a dark page,
// which is what the SSR-rendered className already implies.
const themeInitScript = `(function(){try{var t=localStorage.getItem('cpp:theme');if(t==='light')document.documentElement.classList.add('light');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning on <html>: the inline script above may have
    // added the `light` class to documentElement before React hydrates, and
    // the SSR-rendered className doesn't include it. Without this prop,
    // React would warn about the mismatch on every paint for light-theme
    // users. The mismatch is intentional and exactly the thing the script
    // is there to introduce.
    <html lang="en" className={`h-full ${inter.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="h-full">
        {children}
        <ServiceWorkerRegistrar />
        <SupabasePrewarmer />
      </body>
    </html>
  );
}
