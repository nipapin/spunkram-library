/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/js/**/*.{js,ts,jsx,tsx,html}"],
  theme: {
    extend: {
      colors: {
        background: "rgba(var(--background), <alpha-value>)",
        foreground: "rgba(var(--foreground), <alpha-value>)",
        card: {
          DEFAULT: "rgba(var(--card), <alpha-value>)",
          foreground: "rgba(var(--card-foreground), <alpha-value>)",
        },
        popover: {
          DEFAULT: "rgba(var(--popover), <alpha-value>)",
          foreground: "rgba(var(--popover-foreground), <alpha-value>)",
        },
        primary: {
          DEFAULT: "rgba(var(--primary), <alpha-value>)",
          foreground: "rgba(var(--primary-foreground), <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgba(var(--secondary), <alpha-value>)",
          foreground: "rgba(var(--secondary-foreground), <alpha-value>)",
        },
        muted: {
          DEFAULT: "rgba(var(--muted), <alpha-value>)",
          foreground: "rgba(var(--muted-foreground), <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgba(var(--accent), <alpha-value>)",
          foreground: "rgba(var(--accent-foreground), <alpha-value>)",
        },
        destructive: "rgba(var(--destructive), <alpha-value>)",
        border: "rgba(var(--border), 0.08)",
        input: "rgba(var(--input), 0.1)",
        ring: "rgba(var(--ring), <alpha-value>)",
        chart: {
          1: "rgba(var(--chart-1), <alpha-value>)",
          2: "rgba(var(--chart-2), <alpha-value>)",
          3: "rgba(var(--chart-3), <alpha-value>)",
          4: "rgba(var(--chart-4), <alpha-value>)",
          5: "rgba(var(--chart-5), <alpha-value>)",
        },
        sidebar: {
          DEFAULT: "rgba(var(--sidebar), <alpha-value>)",
          foreground: "rgba(var(--sidebar-foreground), <alpha-value>)",
          primary: "rgba(var(--sidebar-primary), <alpha-value>)",
          "primary-foreground":
            "rgba(var(--sidebar-primary-foreground), <alpha-value>)",
          accent: "rgba(var(--sidebar-accent), <alpha-value>)",
          "accent-foreground":
            "rgba(var(--sidebar-accent-foreground), <alpha-value>)",
          border: "rgba(var(--sidebar-border), 0.08)",
          ring: "rgba(var(--sidebar-ring), <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};
