import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: {
          base: "#F5F7FA",
          panel: "#FFFFFF",
          inset: "#F1F4F7",
          baseline: "#F7F8FA",
        },
        ink: {
          DEFAULT: "#151922",
          muted: "#5D6878",
          faint: "#8A94A3",
        },
        hairline: "#E2E7EE",
        cobalt: {
          DEFAULT: "#4967F2",
          hover: "#3954D9",
          soft: "#EEF1FF",
        },
        ok: {
          DEFAULT: "#148060",
          soft: "#E8F6F1",
        },
        fail: {
          DEFAULT: "#C2413A",
          soft: "#FCEDEA",
        },
        warn: {
          DEFAULT: "#9A6200",
          soft: "#FFF4D6",
        },
      },
      fontFamily: {
        display: ["var(--font-inter)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "14px",
        chip: "8px",
        tag: "4px",
      },
      boxShadow: {
        seat: "0 1px 2px rgba(15,23,42,0.04), 0 1px 0 rgba(15,23,42,0.02)",
        inset: "inset 0 1px 2px rgba(15,23,42,0.04)",
        lift: "0 12px 32px -16px rgba(33,51,120,0.24)",
      },
      keyframes: {
        blink: {
          "0%,49%": { opacity: "1" },
          "50%,100%": { opacity: "0" },
        },
        breathe: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        blink: "blink 1.06s step-end infinite",
        breathe: "breathe 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
