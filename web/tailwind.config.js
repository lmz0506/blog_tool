/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"Cascadia Mono"', '"SFMono-Regular"', "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
