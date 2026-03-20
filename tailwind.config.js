/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0a0a14',
          surface: '#13132b',
          elevated: '#1e1e3f',
        },
        neon: {
          cyan:   '#00f5ff',
          purple: '#a855f7',
          green:  '#10b981',
          amber:  '#f59e0b',
          pink:   '#ec4899',
        },
        player: {
          X: '#00f5ff',
          O: '#a855f7',
          W: '#10b981',
          M: '#f59e0b',
        },
      },
      boxShadow: {
        'neon-cyan':   '0 0 8px #00f5ff, 0 0 20px #00f5ff44',
        'neon-purple': '0 0 8px #a855f7, 0 0 20px #a855f744',
        'neon-green':  '0 0 8px #10b981, 0 0 20px #10b98144',
        'neon-amber':  '0 0 8px #f59e0b, 0 0 20px #f59e0b44',
        'neon-pink':   '0 0 8px #ec4899, 0 0 20px #ec489944',
        'cell':        'inset 0 0 6px rgba(0,245,255,0.05)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'rotate-board': 'rotate-board 0.5s ease-in-out forwards',
        'slide-in': 'slide-in 0.3s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'bounce-in': 'bounce-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%':       { opacity: '0.6' },
        },
        'rotate-board': {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(90deg)' },
        },
        'slide-in': {
          '0%':   { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',     opacity: '1' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'bounce-in': {
          '0%':   { transform: 'scale(0)',   opacity: '0' },
          '60%':  { transform: 'scale(1.1)', opacity: '1' },
          '100%': { transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
