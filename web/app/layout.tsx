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
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'CS 225 POTD',
  description: 'Problem of the Day archive and web solver for CS 225',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${inter.variable} ${jetbrains.variable}`}>
      <body className="h-full">
        {children}
        <ServiceWorkerRegistrar />
        <SupabasePrewarmer />
      </body>
    </html>
  );
}
