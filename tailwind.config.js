/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        cove: {
          ice: "#E3F2FD",
          paper: "#FFFFFF",
          mist: "#BBDEFB",
          line: "#90CAF9",
          muted: "#1565C0",
          ink: "#0D47A1",
          accent: "#2196F3",
          "accent-deep": "#0D47A1",
          soft: "#E3F2FD",
          deep: "#0D47A1",
        },
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
};
