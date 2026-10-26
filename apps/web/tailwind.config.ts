import type { Config } from 'tailwindcss';

// Every value is a CSS variable from app/styles/tokens.css, so the component classes and the
// utilities share one source. Light only.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        raised: 'var(--raised)',
        sunken: 'var(--sunken)',
        track: 'var(--track)',
        ink: {
          DEFAULT: 'var(--ink)',
          muted: 'var(--ink-muted)',
          subtle: 'var(--ink-subtle)',
        },
        border: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
          field: 'var(--border-field)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          press: 'var(--accent-press)',
          ink: 'var(--accent-ink)',
          soft: 'var(--accent-soft)',
        },
        'on-accent': 'var(--on-accent)',
        success: { DEFAULT: 'var(--success)', soft: 'var(--success-soft)' },
        warning: { DEFAULT: 'var(--warning)', soft: 'var(--warning-soft)' },
        danger: { DEFAULT: 'var(--danger)', soft: 'var(--danger-soft)' },
        info: { DEFAULT: 'var(--info)', soft: 'var(--info-soft)' },
        dark: { DEFAULT: 'var(--dark)', raised: 'var(--dark-raised)' },
        'on-dark': { DEFAULT: 'var(--on-dark)', muted: 'var(--on-dark-muted)' },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        serif: ['var(--font-serif)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        display: ['40px', { lineHeight: '44px', fontWeight: '700', letterSpacing: '-0.03em' }],
        h1: ['28px', { lineHeight: '34px', fontWeight: '700', letterSpacing: '-0.025em' }],
        h2: ['22px', { lineHeight: '28px', fontWeight: '650' }],
        h3: ['18px', { lineHeight: '24px', fontWeight: '650' }],
        body: ['16px', { lineHeight: '24px' }],
        small: ['14px', { lineHeight: '20px' }],
        label: ['12px', { lineHeight: '16px', fontWeight: '600' }],
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        lg: 'var(--shadow-lg)',
        overlay: 'var(--shadow-overlay)',
        accent: 'var(--shadow-accent)',
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        DEFAULT: 'var(--dur)',
        slow: 'var(--dur-slow)',
      },
      transitionTimingFunction: {
        DEFAULT: 'var(--ease)',
        spring: 'var(--ease-spring)',
      },
      maxWidth: {
        page: 'var(--wrap)',
      },
    },
  },
  plugins: [],
};

export default config;
