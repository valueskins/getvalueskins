import { Bricolage_Grotesque } from 'next/font/google';

/**
 * The home page's display cut: the app's own Bricolage Grotesque with its width and optical-size
 * axes, so headlines can run condensed and heavy. Self-hosted by next/font like the app's faces,
 * so the CSP's `font-src 'self'` holds. Only the home page loads it (app/home.css reads it).
 */
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: ['opsz', 'wdth'],
  variable: '--font-hm-display',
  display: 'swap',
});

export const displayFont = display.variable;
