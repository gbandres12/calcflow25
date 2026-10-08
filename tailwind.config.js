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
      // Cores da marca — mesmos valores de --cf-* em styles.css, em rgb pra
      // aceitar transparência (bg-ink/55). var() não aceita o "/55".
      colors: {
        ink: { DEFAULT: 'rgb(22 60 53 / <alpha-value>)', soft: 'rgb(54 87 78 / <alpha-value>)' },
        forest: {
          DEFAULT: 'rgb(15 89 72 / <alpha-value>)',
          deep: 'rgb(12 70 57 / <alpha-value>)',
          soft: 'rgb(227 238 231 / <alpha-value>)'
        },
        olive: 'rgb(141 152 81 / <alpha-value>)',
        sand: { DEFAULT: 'rgb(201 162 76 / <alpha-value>)', soft: 'rgb(246 239 220 / <alpha-value>)' },
        cream: 'rgb(248 250 252 / <alpha-value>)',
        paper: 'rgb(255 255 255 / <alpha-value>)',
        line: 'rgb(226 232 240 / <alpha-value>)',
        muted: 'rgb(114 128 120 / <alpha-value>)'
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace']
      }
    }
  },
  plugins: []
};
