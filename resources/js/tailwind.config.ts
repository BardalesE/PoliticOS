import type { Config } from "tailwindcss";

export default {
    darkMode: ["class"],
    content: [
    "./src/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // shadcn semantic tokens — consumed by hero-with-video and future shadcn components
        background:  "rgb(var(--background) / <alpha-value>)",
        foreground:  "rgb(var(--foreground) / <alpha-value>)",
        card: {
          DEFAULT:    "rgb(var(--card) / <alpha-value>)",
          foreground: "rgb(var(--card-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT:    "rgb(var(--muted) / <alpha-value>)",
          foreground: "rgb(var(--muted-foreground) / <alpha-value>)",
        },
        border:  "rgb(var(--border) / <alpha-value>)",
        ring:    "rgb(var(--ring) / <alpha-value>)",
        // Color de marca — cambia dinámicamente con CSS variables desde CandidateContext
        brand: {
          50:  "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 6%, white)",
          100: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 14%, white)",
          200: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 30%, white)",
          300: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 50%, white)",
          400: "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 70%, white)",
          500: "rgb(var(--brand-primary-rgb) / <alpha-value>)",
          600: "rgb(var(--brand-dark-rgb) / <alpha-value>)",
          700: "color-mix(in srgb, rgb(var(--brand-dark-rgb)) 80%, black)",
          800: "color-mix(in srgb, rgb(var(--brand-dark-rgb)) 55%, black)",
          900: "color-mix(in srgb, rgb(var(--brand-dark-rgb)) 35%, black)",
        },
        // Negro institucional (no puro)
        ink: {
          50:  "#FFFFFF",
          100: "#F5F5F5",
          200: "#E5E5E5",
          300: "#D4D4D4",
          // AA sobre blanco (4.54:1) — era #A3A3A3 (~2.5:1), ilegible a sol
          // directo; ink-400 es el tono de texto secundario/meta en toda la home.
          400: "#767676",
          500: "#5C5852",
          600: "#404040",
          700: "#262626",
          800: "#1A1A1A",
          900: "#0A0A0A",
          950: "#050505",
        },
        // Dorado (admin legacy — no usar en landing)
        gold: {
          400: "#E0BE6C",
          500: "#C9A84C",
          600: "#A88A35",
        },
        // Verde WhatsApp (SOLO chatbot)
        chat: {
          50:  "#DCFCE7",
          400: "#4ADE80",
          500: "#25D366",
          600: "#128C7E",
          700: "#064E2E",
        },
        // Azul transparencia (SOLO institucional)
        trust: {
          50:  "#EFF6FF",
          100: "#DBEAFE",
          500: "#3B82F6",
          700: "#1e40af",
          900: "#1E3A8A",
        },
      },
      fontFamily: {
        sans:    ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        serif:   ["var(--font-serif)", "Source Serif 4", "Georgia", "serif"],
        display: ["var(--font-serif)", "Source Serif 4", "Georgia", "serif"],
      },
      // Escala tipográfica de la landing — mobile-first vía clamp().
      // Consolida los valores que las secciones usaban inline; usar
      // text-display/h1/h2/h3 en componentes nuevos, no clamp() a mano.
      fontSize: {
        display: ["clamp(31px, 4.4vw, 50px)", { lineHeight: "1.04" }],
        h1:      ["clamp(28px, 3.6vw, 40px)", { lineHeight: "1.08" }],
        h2:      ["clamp(22px, 3vw, 30px)",   { lineHeight: "1.12" }],
        h3:      ["clamp(16px, 1.6vw, 20px)", { lineHeight: "1.14" }],
        body:    ["1rem",     { lineHeight: "1.625" }],
        small:   ["0.875rem", { lineHeight: "1.5" }],
        caption: ["0.75rem",  { lineHeight: "1.4" }],
      },
      // Radios y sombras de la landing como tokens (rounded-card/modal,
      // shadow-soft/lift/modal) en vez de valores ad-hoc por componente.
      borderRadius: {
        card:  "20px",
        modal: "24px",
      },
      boxShadow: {
        soft:  "0 2px 12px rgba(0,0,0,0.05)",
        lift:  "0 30px 60px -34px var(--page-shadow)",
        modal: "0 32px 80px rgba(0,0,0,0.35)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "brand-glow": "radial-gradient(ellipse at top, rgb(var(--brand-primary-rgb) / 0.08), transparent 60%)",
      },
      animation: {
        "fade-up":    "fadeUp 0.6s ease-out forwards",
        "fade-in":    "fadeIn 0.4s ease-out forwards",
        "pulse-glow": "pulseGlow 2.4s ease-in-out infinite",
        "shimmer":    "shimmer 2s linear infinite",
        "float":      "float 6s ease-in-out infinite",
        "glow-blue":  "glowBlue 3s ease-in-out infinite",
      },
      keyframes: {
        fadeUp:    { "0%": { opacity: "0", transform: "translateY(20px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        fadeIn:    { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        pulseGlow: { "0%, 100%": { boxShadow: "0 0 20px rgb(var(--brand-primary-rgb) / 0.3)" }, "50%": { boxShadow: "0 0 40px rgb(var(--brand-primary-rgb) / 0.6)" } },
        shimmer:   { "0%": { backgroundPosition: "-1000px 0" }, "100%": { backgroundPosition: "1000px 0" } },
        float:     { "0%, 100%": { transform: "translateY(0px)" }, "50%": { transform: "translateY(-12px)" } },
        glowBlue:  { "0%, 100%": { boxShadow: "0 0 24px rgba(220,38,38,0.25)" }, "50%": { boxShadow: "0 0 48px rgba(220,38,38,0.50)" } },
      },
    },
  },
  plugins: [],
} satisfies Config;
