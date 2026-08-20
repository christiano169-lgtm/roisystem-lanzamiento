/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      colors: {
        bg: '#08080a',
        sidebar: '#0a0a0c',
        panel: '#0c0c0f',
        card: '#101013',
        chip: '#151519',
        input: '#17171c',
        border: '#242429',
        border2: '#2b2b32',
        accent: '#22d3ee',
      },
    },
  },
  plugins: [],
};
