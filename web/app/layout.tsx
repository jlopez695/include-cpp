import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import './globals.css';

// Ship only the weights the codebase actually uses. Audit:
//   font-medium (500): 7 sites · font-semibold (600): 12 · font-bold (700): 14
//   font-extrabold (800): 4 · default (400): everywhere
// Without an explicit weight list next/font generates a file per weight Google
// ships (9 for Inter, 8 for JetBrains_Mono), most of them dead weight.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
});
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
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
      </body>
    </html>
  );
}
