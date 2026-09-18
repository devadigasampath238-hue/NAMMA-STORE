"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getCategory, getProductsByCategory } from "../../../api";
import {
  ProductCard,
  ProductGridSkeleton,
  EmptyState,
  ErrorState,
  useAddToCart,
  friendlyError,
} from "../../../ui";
import { SafeImage } from "../../../components";
import type { Category, Product } from "../../../types";

export default function CategoryPage() {
  const params = useParams();
  const id = Number(params.id);
  const addToCart = useAddToCart();

  const [category, setCategory] = useState<Category | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [c, p] = await Promise.all([getCategory(id), getProductsByCategory(id)]);
      setCategory(c);
      setProducts(p);
    } catch (e) {
      setError(friendlyError(e, "We could not load this category."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div>
        <div className="ns-skeleton mb-6 h-32 w-full rounded-xl2" />
        <ProductGridSkeleton count={8} />
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-gray-500">
        <Link href="/" className="hover:text-brand-700">Home</Link>
        <span className="mx-1.5">/</span>
        <Link href="/categories" className="hover:text-brand-700">Categories</Link>
        <span className="mx-1.5">/</span>
        <span className="text-brand-800">{category?.name}</span>
      </nav>

      <header className="ns-animate-fade-up ns-panel mb-6 flex flex-col gap-4 overflow-hidden p-5 sm:flex-row sm:items-center">
        {category?.imageUrl && (
          <SafeImage
            src={category.imageUrl}
            alt=""
            className="h-24 w-full shrink-0 rounded-lg sm:w-40"
          />
        )}
        <div className="min-w-0">
          <h1 className="ns-section-title">{category?.name}</h1>
          {category?.description && (
            <p className="mt-1 text-sm text-gray-600">{category.description}</p>
          )}
          <p className="mt-1 text-sm text-gray-500">
            {products.length} product{products.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      {products.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          message="This category has no products at the moment."
          actionLabel="Browse all products"
          actionHref="/products"
        />
      ) : (
        <div className="ns-stagger ns-grid-products">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} onAddToCart={(product) => addToCart(product.id, 1)} />
          ))}
        </div>
      )}
    </div>
  );
}
