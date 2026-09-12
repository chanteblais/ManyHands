import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Theme tokens (app/globals.css :root / lib/theme.ts). The rgb() form
        // keeps Tailwind's opacity modifiers (bg-brand-gold/20) working.
        brand: {
          purple: 'rgb(var(--purple-rgb) / <alpha-value>)',
          gold: 'rgb(var(--gold-rgb) / <alpha-value>)',
          'dark-gold': 'var(--gold-dark)',
          cream: 'var(--lemon)',
          ink: 'rgb(var(--ink-rgb) / <alpha-value>)',
          plum: 'rgb(var(--plum-rgb) / <alpha-value>)',
          lavender: 'var(--lavender)',
        },
      },
      textColor: {
        DEFAULT: 'white',
      },
      borderRadius: {
        '2xl': '1rem',
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        tokyo: ['TokyoDreams', 'serif'],
        baskerville: ['var(--font-libre-baskerville)', 'serif'],
      },
      container: {
        center: true,
        padding: {
          DEFAULT: '1rem',
          sm: '2rem',
          lg: '4rem',
          xl: '5rem',
          '2xl': '6rem',
        },
      },
    },
  },
  plugins: [],
}

export default config
