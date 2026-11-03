/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        spotify: {
          green: '#1db954',
          black: '#121212',
          'dark-gray': '#181818',
          'light-gray': '#282828',
          white: '#ffffff',
          gray: '#b3b3b3',
        }
      },
      fontFamily: {
        circular: ['Circular', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
