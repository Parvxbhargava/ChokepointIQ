/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "Arial", "sans-serif"],
        display: ["Space Grotesk", "Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        asphalt: "#071013",
        signal: "#19f0c4",
        amberline: "#ffbd3d",
        dangerline: "#ff4d6d",
        patrol: "#5ea1ff",
        steel: "#96a5b8"
      },
      boxShadow: {
        glow: "0 0 26px rgba(25, 240, 196, 0.24)",
        panel: "0 18px 60px rgba(0, 0, 0, 0.35)"
      }
    }
  },
  plugins: []
};
