import type { Config } from 'tailwindcss'

// all raw values live in index.css as CSS vars — tailwind reads them via var()
// this lets us swap themes without rebuilding the class graph
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // layered backgrounds — dark side of the rink
        bg: {
          deep:    'var(--c-bg-deep)',
          base:    'var(--c-bg-base)',
          surface: 'var(--c-bg-surface)',
          raised:  'var(--c-bg-raised)',
        },
        // structural borders
        border: {
          subtle:  'var(--c-border-subtle)',
          DEFAULT: 'var(--c-border)',
          strong:  'var(--c-border-strong)',
        },
        // icy blue — primary interactive, links, active states
        ice: {
          300: 'var(--c-ice-300)',
          400: 'var(--c-ice-400)',
          500: 'var(--c-ice-500)',
          600: 'var(--c-ice-600)',
        },
        // frost teal — achievements, special events, positive feedback
        frost: {
          400: 'var(--c-frost-400)',
          500: 'var(--c-frost-500)',
        },
        // text hierarchy
        content: {
          primary:   'var(--c-text-primary)',
          secondary: 'var(--c-text-secondary)',
          muted:     'var(--c-text-muted)',
          disabled:  'var(--c-text-disabled)',
        },
        // semantic — used sparingly
        gold:    'var(--c-gold)',
        danger:  'var(--c-danger)',
        success: 'var(--c-success)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      // attribute bars, progress rings
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '120': '30rem',
      },
    },
  },
  plugins: [],
}

export default config
