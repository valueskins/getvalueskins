import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import { fontVariables } from '@/lib/fonts';
import './globals.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/shell.css';
import './styles/screens.css';
import './utilities.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'ValueSkins', template: '%s | ValueSkins' },
  description: 'Where creators and brands connect to collaborate.',
};

export const viewport: Viewport = {
  themeColor: '#fbf8f4',
  colorScheme: 'only light',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page renders on request, so Next.js can put the CSP nonce on its scripts (middleware.ts).
  await connection();
  return (
    <html lang="en-IN" className={fontVariables}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
