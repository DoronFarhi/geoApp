/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'map-bg': '#0d1117',
        'panel-bg': '#161b22',
        'panel-border': '#30363d',
        'accent-blue': '#58a6ff',
      },
    },
  },
  plugins: [],
}

