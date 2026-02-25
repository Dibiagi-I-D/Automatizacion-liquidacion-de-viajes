/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#0f1117",
        secondary: "#161921",
        accent: {
          green: "#10b981",
          orange: "#f59e0b",
          red: "#ef4444",
          blue: "#3b82f6",
        },
        dark: {
          100: "#1e2028",
          200: "#161921",
          300: "#12141b",
          400: "#0f1117",
          500: "#0b0d12",
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'scan-line': 'scanLine 2.5s ease-in-out infinite',
      },
      keyframes: {
        scanLine: {
          '0%, 100%': { top: '8%' },
          '50%': { top: '88%' },
        },
      },
    },
  },
  plugins: [],
}
