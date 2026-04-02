/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: '#050508',
        surface1: 'rgba(255,255,255,0.035)',
        surface2: 'rgba(255,255,255,0.07)',
        borderSubtle: 'rgba(255,255,255,0.06)',
        borderActive: 'rgba(255,255,255,0.18)',
        accentBlue: '#0A84FF',
        accentGlow: 'rgba(10,132,255,0.35)',
        accentPurple: '#BF5AF2',
        aurora1: '#0A84FF',
        aurora2: '#30D158',
        aurora3: '#BF5AF2',
        textPrimary: 'rgba(255,255,255,0.92)',
        textSecondary: 'rgba(255,255,255,0.45)',
        textTertiary: 'rgba(255,255,255,0.25)',
        success: '#30D158',
        danger: '#FF453A',
        warning: '#FFD60A',
      },
      fontFamily: {
        sans: ['"SF Pro Display"', '-apple-system', 'BlinkMacSystemFont', '"Inter"', 'sans-serif'],
        mono: ['"SF Mono"', 'Menlo', 'monospace']
      },
      boxShadow: {
        'blue-glow': '0 0 24px rgba(10,132,255,0.35)',
        'blue-glow-hover': '0 0 32px rgba(10,132,255,0.5)',
      }
    },
  },
  plugins: [],
}
