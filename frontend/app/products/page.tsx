"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getProducts, getCategories } from "../../api";
import {
  ProductCard,
  ProductGridSkeleton,
  EmptyState,
  ErrorState,
  SearchIcon,
  CloseIcon,
  useAddToCart,
  friendlyError,
} from "../../ui";
import type { Product, Category } from "../../types";

/* =========================================================
   Sorting is done by the backend for price/name/newest.
   "discount" has no backend sort key, so it is applied
   client-side over the already-fetched page.
========================================================= */
const SORT_OPTIONS = [
  { value: "", label: "Relevance" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest First" },
  { value: "name_asc", label: "Name: A to Z" },
  { value: "discount", label: "Discount" },
];

const PRICE_BANDS = [
  { id: "under-299", label: "Under ₹299", min: 0, max: 299 },
  { id: "299-599", label: "₹299 – ₹599", min: 299, max: 599 },
  { id: "599-999", label: "₹599 – ₹999", min: 599, max: 999 },
  { id: "over-999", label: "Over ₹999", min: 999, max: Number.MAX_SAFE_INTEGER },
];

const DISCOUNT_BANDS = [
  { id: "10", label: "10% and above", min: 10 },
  { id: "25", label: "25% and above", min: 25 },
  { id: "50", label: "50% and above", min: 50 },
];

function ProductsPageInner() {
  const searchParams = useSearchParams();
  const addToCart = useAddToCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const queryFromUrl = searchParams.get("q") || "";
  const sortFromUrl = searchParams.get("sort") || "";

  const [searchInput, setSearchInput] = useState(queryFromUrl);
  const [search, setSearch] = useState(queryFromUrl);
  const [sort, setSort] = useState(sortFromUrl);

  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [priceBand, setPriceBand] = useState("");
  const [discountBand, setDiscountBand] = useState("");
  const [inStockOnly, setInStockOnly] = useState(false);

  // Follow the URL when the navbar search pushes a new ?q=
  useEffect(() => {
    setSearch(queryFromUrl);
    setSearchInput(queryFromUrl);
  }, [queryFromUrl]);

  useEffect(() => {
    setSort(sortFromUrl);
  }, [sortFromUrl]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // "discount" is not a backend sort key - fetch unsorted and order below.
      const backendSort = sort === "discount" ? "" : sort;
      const data = await getProducts(search || undefined, backendSort || undefined);
      setProducts(data);
    } catch (e) {
      setError(friendlyError(e, "We could not load products right now."));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [search, sort]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getCategories(true)
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  /* ---- client-side filtering over the fetched set ---- */
  const visible = useMemo(() => {
    let list = [...products];

    if (categoryIds.length > 0) {
      list = list.filter((p) => p.categoryId != null && categoryIds.includes(p.categoryId));
    }

    const band = PRICE_BANDS.find((b) => b.id === priceBand);
    if (band) {
      list = list.filter((p) => {
        const price = Number(p.effectivePrice ?? p.price);
        return price >= band.min && price <= band.max;
      });
    }

    const discount = DISCOUNT_BANDS.find((d) => d.id === discountBand);
    if (discount) {
      list = list.filter((p) => (p.discountPercent ?? 0) >= discount.min);
    }

    if (inStockOnly) {
      list = list.filter((p) => p.inStock);
    }

    if (sort === "discount") {
      list.sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0));
    }

    return list;
  }, [products, categoryIds, priceBand, discountBand, inStockOnly, sort]);

  const activeFilterCount =
    categoryIds.length + (priceBand ? 1 : 0) + (discountBand ? 1 : 0) + (inStockOnly ? 1 : 0);

  function clearFilters() {
    setCategoryIds([]);
    setPriceBand("");
    setDiscountBand("");
    setInStockOnly(false);
  }

  function toggleCategory(id: number) {
    setCategoryIds((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id]
    );
  }

  const filterPanel = (
    <div className="space-y-6">
      <FilterGroup title="Category">
        {categories.length === 0 && <p className="text-xs text-gray-400">No categories yet.</p>}
        {categories.map((c) => (
          <label key={c.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
            <input
              type="checkbox"
              checked={categoryIds.includes(c.id)}
              onChange={() => toggleCategory(c.id)}
              className="h-4 w-4 accent-brand-600"
            />
            <span className="flex-1 truncate text-gray-700">{c.name}</span>
            {typeof c.productCount === "number" && (
              <span className="text-xs text-gray-400">{c.productCount}</span>
            )}
          </label>
        ))}
      </FilterGroup>

      <FilterGroup title="Price">
        {PRICE_BANDS.map((band) => (
          <label key={band.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
            <input
              type="radio"
              name="price-band"
              checked={priceBand === band.id}
              onChange={() => setPriceBand(priceBand === band.id ? "" : band.id)}
              className="h-4 w-4 accent-brand-600"
            />
            <span className="text-gray-700">{band.label}</span>
          </label>
        ))}
      </FilterGroup>

      <FilterGroup title="Discount">
        {DISCOUNT_BANDS.map((band) => (
          <label key={band.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
            <input
              type="radio"
              name="discount-band"
              checked={discountBand === band.id}
              onChange={() => setDiscountBand(discountBand === band.id ? "" : band.id)}
              className="h-4 w-4 accent-brand-600"
            />
            <span className="text-gray-700">{band.label}</span>
          </label>
        ))}
      </FilterGroup>

      <FilterGroup title="Availability">
        <label className="flex cursor-pointer items-center gap-2 py-1 text-sm">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => setInStockOnly(e.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
          <span className="text-gray-700">In stock only</span>
        </label>
      </FilterGroup>

      {activeFilterCount > 0 && (
        <button onClick={clearFilters} className="text-sm font-medium text-brand-700 underline">
          Clear all filters
        </button>
      )}
    </div>
  );

  return (
    <div>
      {/* ---- search + sort bar ---- */}
      <div className="ns-panel mb-6 flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
          }}
          className="relative flex-1"
          role="search"
        >
          <label htmlFor="products-search" className="sr-only">
            Search products
          </label>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
          <input
            id="products-search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by product, brand or category…"
            className="ns-input !py-2.5 pl-9 pr-9"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearch("");
              }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          )}
        </form>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFiltersOpen(true)}
            className="ns-btn-outline !px-4 !py-2 text-sm lg:hidden"
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>

          <label htmlFor="products-sort" className="sr-only">
            Sort products
          </label>
          <select
            id="products-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="ns-input !py-2.5 md:w-56"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                Sort: {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-6">
        {/* ---- desktop sidebar ---- */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="ns-panel sticky top-24 p-5">
            <h2 className="mb-4 font-heading text-sm font-semibold uppercase tracking-wide text-brand-900">
              Filters
            </h2>
            {filterPanel}
          </div>
        </aside>

        {/* ---- results ---- */}
        <div className="min-w-0 flex-1">
          {!loading && !error && (
            <p className="mb-3 text-sm text-gray-500">
              {visible.length} product{visible.length === 1 ? "" : "s"}
              {search && (
                <>
                  {" "}for <span className="font-medium text-brand-800">“{search}”</span>
                </>
              )}
            </p>
          )}

          {loading ? (
            <ProductGridSkeleton count={8} />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : visible.length === 0 ? (
            <EmptyState
              title="No products match that"
              message={
                activeFilterCount > 0
                  ? "Try removing a filter or two."
                  : "Try a different search term."
              }
              actionLabel="Browse everything"
              actionHref="/products"
              icon={<SearchIcon className="h-9 w-9" />}
            />
          ) : (
            <div className="ns-stagger ns-grid-products">
              {visible.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onAddToCart={(product) => addToCart(product.id, 1)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---- mobile filter drawer ---- */}
      {filtersOpen && (
        <div
          className="ns-animate-fade-in fixed inset-0 z-[70] bg-black/40 lg:hidden"
          onClick={() => setFiltersOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ns-animate-slide-in absolute right-0 top-0 h-full w-80 max-w-[85vw] overflow-y-auto bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-lg font-semibold text-brand-900">Filters</h2>
              <button onClick={() => setFiltersOpen(false)} aria-label="Close filters">
                <CloseIcon />
              </button>
            </div>
            {filterPanel}
            <button onClick={() => setFiltersOpen(false)} className="ns-btn-primary mt-6 w-full">
              Show {visible.length} result{visible.length === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      <div className="max-h-56 overflow-y-auto pr-1">{children}</div>
    </div>
  );
}

// useSearchParams() opts the page out of static rendering unless it sits in
// its own Suspense boundary - without this, `next build` cannot prerender it.
export default function ProductsPage() {
  return (
    <Suspense fallback={<ProductGridSkeleton count={8} />}>
      <ProductsPageInner />
    </Suspense>
  );
}
