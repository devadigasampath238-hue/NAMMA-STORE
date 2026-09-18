import type { Metadata } from "next";
import "./globals.css";
import { AppShell, AuthProvider, CartProvider } from "../components";
import { Navbar, Footer, ToastProvider, WishlistProvider } from "../ui";

export const metadata: Metadata = {
  title: "Namma Store — Karnataka's own online store",
  description:
    "Shop mugs, t-shirts, gifts and personalised products from Namma Store. Fast delivery across Karnataka.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#C2410C",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* The logo watermark is painted by body::before in globals.css.
          Opacity lives only on that pseudo-element, so nothing here
          loses contrast. */}
      <body>
        {/* Skip link: first thing a keyboard user reaches. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-brand-800 focus:shadow-lg"
        >
          Skip to main content
        </a>

        <ToastProvider>
          <AuthProvider>
            <CartProvider>
              <WishlistProvider>
                {/* AppShell drops the customer Navbar/Footer on /admin/*
                    so the dashboard gets its own full-width chrome. */}
                <AppShell navbar={<Navbar />} footer={<Footer />}>
                  {children}
                </AppShell>
              </WishlistProvider>
            </CartProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
