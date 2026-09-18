// Lets `tsc --noEmit` accept `import "./globals.css"` in layout.tsx.
// Next.js handles CSS imports at build time, but a bare tsc run has no
// declaration for them, which surfaces as TS2882.
declare module "*.css";
declare module "*.scss";
