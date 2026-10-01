import type { Config } from 'tailwindcss';

// SPEC 18: black background, white text, one red accent, 4px radius, no
// gradients, no shadows.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#000000',
        foreground: '#FFFFFF',
        muted: '#A3A3A3',
        line: '#262626',
        accent: '#FF0000',
        danger: '#FF4D4D',
      },
      borderRadius: {
        DEFAULT: '4px',
      },
    },
  },
  plugins: [],
};

export default config;
