import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './receipt.css';
import './app.css';
import './utilities.css';
import { Providers } from './providers';

const geist = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-geist',
});
const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-geist-mono',
});

export const metadata: Metadata = {
  title: { default: 'ValueSkins', template: '%s | ValueSkins' },
  description: 'Where creators and brands connect to collaborate.',
};

export const viewport: Viewport = {
  themeColor: '#f7f8f8',
  colorScheme: 'light',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page renders on request, so Next.js can put the CSP nonce on its scripts (middleware.ts).
  await connection();
  return (
    <html lang="en-IN" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
