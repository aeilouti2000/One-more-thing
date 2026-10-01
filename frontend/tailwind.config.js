const { fonts } = require("./constants/theme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}", "./providers/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        cove: {
          ice: "var(--color-cove-ice)",
          paper: "var(--color-cove-paper)",
          mist: "var(--color-cove-mist)",
          line: "var(--color-cove-line)",
          muted: "var(--color-cove-muted)",
          ink: "var(--color-cove-ink)",
          accent: "var(--color-cove-accent)",
          "accent-deep": "var(--color-cove-accent-deep)",
          soft: "var(--color-cove-soft)",
          deep: "var(--color-cove-deep)",
        },
      },
      fontFamily: {
        sans: [fonts.sans],
      },
      fontSize: {
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "18px" }],
        base: ["15px", { lineHeight: "21px" }],
        lg: ["17px", { lineHeight: "23px" }],
        xl: ["19px", { lineHeight: "25px" }],
        "2xl": ["22px", { lineHeight: "28px" }],
        "3xl": ["26px", { lineHeight: "32px" }],
        "4xl": ["30px", { lineHeight: "36px" }],
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
};
