import { Bricolage_Grotesque, Instrument_Serif } from 'next/font/google';

/**
 * The app's two faces: Bricolage Grotesque for headlines, UI and text, and Instrument Serif italic
 * for one accent word and the wordmark. Self-hosted by next/font, so the CSP's `font-src 'self'`
 * holds. styles/tokens.css reads the two variables.
 */
const sans = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
});
const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['italic'],
  variable: '--font-instrument',
});

/** Class names that define the two font variables, for the root element. */
export const fontVariables = `${sans.variable} ${serif.variable}`;
