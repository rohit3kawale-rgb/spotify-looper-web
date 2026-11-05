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
          green: '#1DB954',
          green2: '#1ed760',
          black: '#121212',
          'dark-gray': '#181818',
          'light-gray': '#282828',
          white: '#ffffff',
          gray: '#b3b3b3',
        }
      },
      fontFamily: {
        circular: ['Circular', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      backgroundImage: {
        'spotify-gradient': 'linear-gradient(135deg, #1DB954 0%, #1ed760 50%, #1db954 100%)',
        'mesh-gradient': 'radial-gradient(circle at 20% 50%, rgba(29,185,84,0.12) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(29,185,84,0.08) 0%, transparent 50%), radial-gradient(circle at 40% 80%, rgba(29,185,84,0.06) 0%, transparent 50%)',
        'card-gradient': 'linear-gradient(145deg, rgba(24,24,24,0.95) 0%, rgba(18,18,18,0.95) 100%)',
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
        'glass-hover': '0 12px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
        'green-glow': '0 0 20px rgba(29,185,84,0.35), 0 0 40px rgba(29,185,84,0.15)',
        'green-glow-lg': '0 0 30px rgba(29,185,84,0.5), 0 0 60px rgba(29,185,84,0.2)',
        'card': '0 4px 24px rgba(0,0,0,0.3)',
        'card-hover': '0 8px 32px rgba(0,0,0,0.4)',
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'fade-up': 'fadeUp 0.5s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'slide-in': 'slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'float': 'float 4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(29,185,84,0.3), 0 0 40px rgba(29,185,84,0.1)' },
          '100%': { boxShadow: '0 0 30px rgba(29,185,84,0.5), 0 0 60px rgba(29,185,84,0.2)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      transitionDuration: {
        '400': '400ms',
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}