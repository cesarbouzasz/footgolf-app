import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      maxWidth: {
        '7xl': '80rem',
      },
      fontFamily: {
        sans: ['var(--font-family)', 'system-ui', 'sans-serif'],
        display: ['var(--font-family-display)', 'system-ui', 'sans-serif'],
      },
      colors: {
        gold: {
          50: '#fffbf0',
          100: '#fef3e2',
          200: '#fde8ca',
          300: '#fcd5a5',
          400: '#fab75a',
          500: '#f0a500',
          600: '#d4af37',
          700: '#b8963f',
          800: '#8b7434',
          900: '#5f5226',
        },
        premium: {
          dark: '#0f1419',
          light: '#ffffff',
          accent: '#d4af37',
          secondary: '#6366f1',
        },
      },
      boxShadow: {
        premium: '0 20px 60px rgba(0, 0, 0, 0.4)',
        'premium-sm': '0 8px 24px rgba(0, 0, 0, 0.2)',
        'gold-glow': '0 0 30px rgba(212, 175, 55, 0.4)',
        'gold-lg': '0 12px 40px rgba(212, 175, 55, 0.3)',
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'slide-up': 'slide-up 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'slide-down': 'slide-down 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'glow-pulse': {
          '0%, 100%': { 'box-shadow': '0 0 20px rgba(212, 175, 55, 0.3)' },
          '50%': { 'box-shadow': '0 0 40px rgba(212, 175, 55, 0.6)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(30px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-30px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
export default config
