/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    './constants.tsx'
  ],
  theme: {
    extend: {
      // Cores da marca: as mesmas variáveis --cf-* de styles.css.
      colors: {
        ink: { DEFAULT: 'var(--cf-ink)', soft: 'var(--cf-ink-soft)' },
        forest: { DEFAULT: 'var(--cf-forest)', deep: 'var(--cf-forest-deep)', soft: 'var(--cf-forest-soft)' },
        olive: 'var(--cf-olive)',
        sand: { DEFAULT: 'var(--cf-sand)', soft: 'var(--cf-sand-soft)' },
        cream: 'var(--cf-cream)',
        paper: 'var(--cf-paper)',
        line: 'var(--cf-line)',
        muted: 'var(--cf-muted)'
      },
      fontFamily: {
        sans: ['Manrope', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
