import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components.tsx",
    // BUGFIX: ui.tsx (Header, Footer, ProductCard, CategoryCard, badges,
    // price tags, etc.) was missing from this list. Tailwind's JIT scanner
    // only generates CSS for classes it finds in files listed here, so
    // every utility class used ONLY inside ui.tsx (e.g. the discount
    // badge's `absolute bottom-2 left-2`) was silently dropped from the
    // final stylesheet. That's why the "X% OFF" badge rendered with no
    // positioning and sat on top of the product name instead of pinned to
    // the corner of the image.
    "./ui.tsx",
  ],
  theme: {
    extend: {
      fontFamily: {
        kannada: ["var(--font-kannada)", "sans-serif"],
      },
      colors: {
        brand: {
          // Sandalwood / turmeric / Karnataka red — warm, not Flipkart blue
          // or Amazon black+orange.
          50: "#FFF8ED",
          100: "#FFEBC7",
          200: "#FFD68A",
          300: "#FDB94D",
          400: "#F79A22",
          500: "#E97A0C",
          600: "#C2410C",
          700: "#9A3412",
          800: "#7C2D12",
          900: "#5C220D",
          orange: "#C2410C",
          maroon: "#7C2D12",
        },
        sandal: "#FDF6EC",
      },
      boxShadow: {
        card: "0 1px 2px rgba(124,45,18,0.06), 0 4px 14px rgba(124,45,18,0.08)",
        cardHover: "0 6px 20px rgba(124,45,18,0.16)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};
export default config;
