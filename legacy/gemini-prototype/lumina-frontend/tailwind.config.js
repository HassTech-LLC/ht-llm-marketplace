/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#0B0A11',
          card: 'rgba(17, 16, 28, 0.45)',
          border: 'rgba(255, 255, 255, 0.08)',
          glow: '#A855F7',
          cyan: '#06B6D4',
          accent: '#7C3AED'
        }
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [],
}
