import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#f4f3ef",
        ink: "#13222c",
        line: "#d8d4ca",
        accent: "#0f766e",
        accentSoft: "#d7f2ee",
        warning: "#d97706",
        warningSoft: "#fff0d8",
        danger: "#be123c",
        dangerSoft: "#ffe1ea"
      },
      boxShadow: {
        panel: "0 12px 32px rgba(19, 34, 44, 0.08)"
      },
      borderRadius: {
        xl2: "1.25rem"
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
