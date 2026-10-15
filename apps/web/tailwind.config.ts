import type { Config } from 'tailwindcss';

// The "Receipt" design system (docs/DESIGN_HANDOFF.md). Every value is a CSS
// variable from app/receipt.css, so the classes and the utilities share one
// source. Light only.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: 'var(--page)',
        surface: 'var(--surface)',
        sunken: 'var(--sunken)',
        ink: { DEFAULT: 'var(--ink)', 2: 'var(--ink-2)', 3: 'var(--ink-3)' },
        rule: { DEFAULT: 'var(--rule)', strong: 'var(--rule-strong)' },
        field: 'var(--field)',
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          press: 'var(--accent-press)',
        },
        error: { DEFAULT: 'var(--error)', bg: 'var(--error-bg)' },
        ok: { DEFAULT: 'var(--ok)', bg: 'var(--ok-bg)' },
        wait: { DEFAULT: 'var(--wait)', bg: 'var(--wait-bg)' },
        prog: { DEFAULT: 'var(--prog)', bg: 'var(--prog-bg)' },
      },
      fontFamily: {
        sans: ['var(--font)'],
        mono: ['var(--mono)'],
      },
      fontSize: {
        display: ['40px', { lineHeight: '44px', fontWeight: '600', letterSpacing: '-0.02em' }],
        h1: ['28px', { lineHeight: '36px', fontWeight: '600', letterSpacing: '-0.01em' }],
        h2: ['22px', { lineHeight: '28px', fontWeight: '600' }],
        h3: ['18px', { lineHeight: '24px', fontWeight: '600' }],
        body: ['16px', { lineHeight: '24px' }],
        small: ['14px', { lineHeight: '20px' }],
        label: ['12px', { lineHeight: '16px', fontWeight: '500' }],
      },
      borderRadius: {
        DEFAULT: 'var(--r)',
        sm: 'var(--r-sm)',
      },
      boxShadow: {
        overlay: 'var(--shadow-overlay)',
      },
      maxWidth: {
        page: '1280px',
      },
    },
  },
  plugins: [],
};

export default config;
