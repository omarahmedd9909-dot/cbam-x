import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // CBAM X design system — Bloomberg Terminal meets Stripe
        // Core surfaces
        surface: {
          base: "hsl(var(--surface-base))",
          raised: "hsl(var(--surface-raised))",
          overlay: "hsl(var(--surface-overlay))",
          sunken: "hsl(var(--surface-sunken))",
        },
        // Brand accent — electric blue, precise and authoritative
        accent: {
          DEFAULT: "hsl(var(--accent))",
          muted: "hsl(var(--accent-muted))",
          subtle: "hsl(var(--accent-subtle))",
          foreground: "hsl(var(--accent-foreground))",
        },
        // Semantic colors
        success: {
          DEFAULT: "hsl(var(--success))",
          muted: "hsl(var(--success-muted))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          muted: "hsl(var(--warning-muted))",
          foreground: "hsl(var(--warning-foreground))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          muted: "hsl(var(--danger-muted))",
          foreground: "hsl(var(--danger-foreground))",
        },
        // Text hierarchy
        ink: {
          primary: "hsl(var(--ink-primary))",
          secondary: "hsl(var(--ink-secondary))",
          tertiary: "hsl(var(--ink-tertiary))",
          disabled: "hsl(var(--ink-disabled))",
        },
        // Border
        border: {
          DEFAULT: "hsl(var(--border))",
          strong: "hsl(var(--border-strong))",
          subtle: "hsl(var(--border-subtle))",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
        display: ["var(--font-display)", "var(--font-geist-sans)", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.8125rem", { lineHeight: "1.25rem" }],
        base: ["0.875rem", { lineHeight: "1.5rem" }],
        md: ["0.9375rem", { lineHeight: "1.5rem" }],
        lg: ["1rem", { lineHeight: "1.5rem" }],
        xl: ["1.125rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.25rem", { lineHeight: "1.75rem" }],
        "3xl": ["1.5rem", { lineHeight: "2rem" }],
        "4xl": ["2rem", { lineHeight: "2.5rem" }],
        "5xl": ["2.5rem", { lineHeight: "3rem" }],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "10px",
        xl: "14px",
        "2xl": "18px",
      },
      spacing: {
        "4.5": "1.125rem",
        "13": "3.25rem",
        "15": "3.75rem",
        "17": "4.25rem",
        "18": "4.5rem",
      },
      boxShadow: {
        // No decorative shadows — only functional elevation
        "focus-ring": "0 0 0 2px hsl(var(--accent) / 0.4)",
        "focus-ring-danger": "0 0 0 2px hsl(var(--danger) / 0.4)",
        "card": "0 1px 3px hsl(0 0% 0% / 0.06), 0 1px 2px hsl(0 0% 0% / 0.04)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-in-from-top": {
          "0%": { transform: "translateY(-8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "slide-in-from-right": {
          "0%": { transform: "translateX(16px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "score-fill": {
          "0%": { "stroke-dashoffset": "var(--score-circumference)" },
          "100%": { "stroke-dashoffset": "var(--score-offset)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out",
        "slide-in-top": "slide-in-from-top 0.2s ease-out",
        "slide-in-right": "slide-in-from-right 0.2s ease-out",
        "score-fill": "score-fill 1.2s ease-out forwards",
        shimmer: "shimmer 1.5s infinite linear",
      },
    },
  },
  plugins: [],
};

export default config;
