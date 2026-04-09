/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,css}"],
  theme: {
    extend: {
      colors: {
        terminal: {
          DEFAULT: "#000000",
          bg: "#000000",
          surface: "#0a0a0a",
          raised: "#111111",
          muted: "#9ca3af"
        },
        accent: {
          pos: "#4ade80",
          neg: "#f87171",
          warn: "#fbbf24"
        }
      },
      boxShadow: {
        "terminal-soft": "0 0 0 1px rgba(255,255,255,0.04), 0 16px 48px rgba(0,0,0,0.45)"
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "Segoe UI", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
        terminal: ['"Geist Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"]
      }
    }
  },
  plugins: []
};
