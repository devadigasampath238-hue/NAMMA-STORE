import Link from "next/link";
import { getActiveBanners, getCategories, getProducts } from "../api";
import { CategoryCard, ProductCard, BenefitsStrip } from "../ui";
import { SafeImage } from "../components";
import type { Product } from "../types";
import { HeroCarousel } from "../hero";

// Server component: the catalog is fetched on the server so the first paint
// already has products in it. `cache: "no-store"` in api.ts keeps it fresh.
export default async function HomePage() {
  const [categories, products, banners] = await Promise.all([
    getCategories(true).catch(() => []),
    getProducts().catch(() => []),
    // Admin-scheduled festival/seasonal campaigns. A failure here must not
    // take the whole homepage down, so it degrades to "no campaigns".
    getActiveBanners().catch(() => []),
  ]);

  // Every section below is derived from REAL backend data. Where there is
  // not enough data yet, the section hides itself rather than showing
  // invented placeholder products.
  const featured = products.filter((p) => p.featured).slice(0, 8);

  const deals = products
    .filter((p) => p.onSale && (p.discountPercent ?? 0) > 0)
    .sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0))
    .slice(0, 8);

  const newArrivals = [...products]
    .sort((a, b) => {
      const at = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bt - at;
    })
    .slice(0, 8);

  // "Trending" has no analytics behind it yet, so it is honestly just the
  // in-stock catalog rather than a fabricated popularity ranking.
  const trending = products.filter((p) => p.inStock).slice(0, 8);

  const heroImage = featured[0]?.thumbnailUrl ?? products[0]?.thumbnailUrl ?? null;

  return (
    <div className="space-y-12">
      {/* ---------------- FESTIVAL / SEASONAL CAROUSEL ----------------
          Renders only when the admin has a live campaign. With none
          scheduled it returns null and the static hero below takes over,
          so the page never shows an empty slider. */}
      <HeroCarousel banners={banners} />

      {/* ---------------- HERO ---------------- */}
      <section className="ns-animate-fade-up overflow-hidden rounded-xl2 border border-brand-100 bg-gradient-to-br from-brand-100 via-brand-50 to-sandal">
        <div className="grid items-center gap-6 p-6 md:grid-cols-2 md:p-10">
          <div>
            <span className="ns-badge bg-white/80 text-brand-700">Made in Karnataka</span>
            <h1 className="mt-3 font-kannada text-3xl font-bold leading-tight text-brand-900 md:text-5xl">
              ನಮ್ಮ Store
            </h1>
            <p className="mt-2 font-heading text-lg font-medium text-brand-700 md:text-2xl">
              Everyday products. Personal gifts. Fair prices.
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-gray-600 md:text-base">
              Mugs, t-shirts, frames and corporate gifting — customise anything with your own
              design and have it delivered across Karnataka.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/products" className="ns-btn-primary !px-7 !py-3 text-base">
                Shop Now
              </Link>
              <Link href="/customize" className="ns-btn-outline !px-7 !py-3 text-base">
                Customise a Gift
              </Link>
            </div>
          </div>

          {heroImage && (
            <div className="relative hidden md:block">
              <div className="absolute -inset-4 rounded-full bg-white/40 blur-2xl" aria-hidden="true" />
              {/* SafeImage (not a raw <img>) resolves the path to an absolute
                  URL and falls back to a placeholder instead of a browser
                  broken-image icon if it 404s. */}
              <SafeImage
                src={heroImage}
                alt=""
                fit="contain"
                className="relative mx-auto h-72 w-full max-w-md rounded-xl2 drop-shadow-xl"
              />
            </div>
          )}
        </div>
      </section>

      {/* ---------------- BENEFITS ---------------- */}
      <BenefitsStrip />

      {/* ---------------- CATEGORIES ---------------- */}
      <Section
        title="Shop by Category"
        href="/categories"
        empty={categories.length === 0}
        emptyText="No categories yet — add some from the admin dashboard."
      >
        <div className="ns-stagger grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {categories.slice(0, 8).map((c) => (
            <CategoryCard key={c.id} category={c} />
          ))}
        </div>
      </Section>

      {/* ---------------- DEALS ---------------- */}
      {deals.length > 0 && (
        <Section title="Deals & Discounts" href="/products?sort=discount">
          <ProductRow products={deals} />
        </Section>
      )}

      {/* ---------------- TRENDING ---------------- */}
      {trending.length > 0 && (
        <Section title="Trending Now" href="/products">
          <ProductRow products={trending} />
        </Section>
      )}

      {/* ---------------- FEATURED ---------------- */}
      <Section
        title="Featured Products"
        href="/products"
        empty={featured.length === 0}
        emptyText="No featured products yet — mark some as Featured in the admin dashboard."
      >
        <ProductRow products={featured} />
      </Section>

      {/* ---------------- NEW ARRIVALS ---------------- */}
      {newArrivals.length > 0 && (
        <Section title="New Arrivals" href="/products?sort=newest">
          <ProductRow products={newArrivals} />
        </Section>
      )}

      {/* ---------------- PROMO ---------------- */}
      <section className="ns-animate-fade-up overflow-hidden rounded-xl2 bg-gradient-to-r from-brand-700 to-brand-900 px-6 py-10 text-center text-white md:px-12">
        <h2 className="font-heading text-2xl font-semibold md:text-3xl">
          Corporate gifting, sorted.
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-brand-100 md:text-base">
          Bulk orders, your logo, your colours. Tell us what you need and we will print it.
        </p>
        <Link
          href="/customize"
          className="mt-6 inline-flex rounded-lg bg-white px-7 py-3 font-medium text-brand-800 transition hover:bg-brand-50"
        >
          Start Customising
        </Link>
      </section>
    </div>
  );
}

function Section({
  title,
  href,
  children,
  empty = false,
  emptyText,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
}) {
  return (
    <section className="ns-animate-fade-up">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 className="ns-section-title">{title}</h2>
        {href && (
          <Link href={href} className="text-sm font-medium text-brand-700 hover:underline">
            View all →
          </Link>
        )}
      </div>
      {empty ? <p className="text-sm text-gray-500">{emptyText}</p> : children}
    </section>
  );
}

function ProductRow({ products }: { products: Product[] }) {
  return (
    <div className="ns-stagger ns-grid-products">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
