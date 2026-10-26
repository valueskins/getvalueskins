import { Bricolage_Grotesque, Instrument_Serif } from 'next/font/google';

/**
 * The home page's faces: Bricolage Grotesque for headlines, UI and text, and Instrument Serif italic
 * for one accent word and the wordmark. Self-hosted by next/font, so the CSP's `font-src 'self'`
 * holds. Only the home page loads them.
 */
const sans = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-v3-sans',
});
const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['italic'],
  variable: '--font-v3-serif',
});

/** Class names that define the two font variables on the page's wrapper. */
export const landingFontVariables = `${sans.variable} ${serif.variable}`;
