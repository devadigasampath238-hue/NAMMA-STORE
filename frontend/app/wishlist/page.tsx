"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getWishlist, removeFromWishlist } from "../../api";
import { Loading, SafeImage, useAuth } from "../../components";
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  HeartIcon,
  TrashIcon,
  Price,
  useAddToCart,
  useWishlist,
  useToast,
  friendlyError,
} from "../../ui";
import type { Product } from "../../types";

export default function WishlistPage() {
  const { appUser, loading: authLoading } = useAuth();
  const { setIds } = useWishlist();
  const { success, error: toastError } = useToast();
  const addToCart = useAddToCart();

  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!appUser) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await getWishlist(appUser.id);
      setItems(data);
      // Keep the navbar badge honest with what this page actually shows.
      setIds(new Set(data.map((p) => p.id)), data.length);
    } catch (e) {
      setError(friendlyError(e, "We could not load your wishlist."));
    } finally {
      setLoading(false);
    }
  }, [appUser, setIds]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  async function handleRemove(productId: number) {
    if (!appUser) return;
    setBusyId(productId);
    try {
      const result = await removeFromWishlist(appUser.id, productId);
      const next = items.filter((p) => p.id !== productId);
      setItems(next);
      setIds(new Set(next.map((p) => p.id)), result.count);
      success("Removed from your wishlist");
    } catch (e) {
      toastError(friendlyError(e, "Could not remove that item."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleMoveToCart(product: Product) {
    setBusyId(product.id);
    const added = await addToCart(product.id, 1);
    setBusyId(null);
    if (added) await handleRemove(product.id);
  }

  if (authLoading) return <Loading />;

  if (!appUser) {
    return (
      <EmptyState
        title="Sign in to see your wishlist"
        message="Your saved items follow you across devices once you are signed in."
        actionLabel="Sign In"
        actionHref="/login"
        icon={<HeartIcon className="h-9 w-9" />}
      />
    );
  }

  return (
    <div>
      <header className="ns-animate-fade-up mb-6">
        <h1 className="ns-section-title">My Wishlist</h1>
        {!loading && items.length > 0 && (
          <p className="mt-1 text-sm text-gray-500">
            {items.length} item{items.length === 1 ? "" : "s"} saved
          </p>
        )}
      </header>

      {loading ? (
        <ListSkeleton rows={3} height="h-32" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Your wishlist is waiting for something special ❤️"
          message="Tap the heart on any product and it will show up here."
          actionLabel="Explore Products"
          actionHref="/products"
          icon={<HeartIcon className="h-9 w-9" />}
        />
      ) : (
        <div className="ns-stagger space-y-3">
          {items.map((product) => {
            const outOfStock = !product.inStock;
            const busy = busyId === product.id;

            return (
              <article
                key={product.id}
                className="ns-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
              >
                <Link href={`/products/${product.id}`} className="shrink-0">
                  <SafeImage
                    src={product.thumbnailUrl}
                    alt={product.name}
                    fit="contain"
                    className="h-28 w-full rounded-lg border border-brand-100 bg-white sm:h-24 sm:w-24"
                    imgClassName="p-2"
                  />
                </Link>

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/products/${product.id}`}
                    className="font-medium text-gray-900 transition hover:text-brand-700"
                  >
                    {product.name}
                  </Link>
                  {product.categoryName && (
                    <p className="mt-0.5 text-xs text-gray-400">{product.categoryName}</p>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
                    <Price
                      value={product.effectivePrice ?? product.price}
                      className="text-lg font-semibold text-brand-700"
                    />
                    {product.onSale && (
                      <>
                        <Price value={product.price} className="text-sm text-gray-400 line-through" />
                        <span className="text-sm font-medium text-green-700">
                          {product.discountPercent}% off
                        </span>
                      </>
                    )}
                  </div>

                  <p
                    className={`mt-1 text-xs font-medium ${
                      outOfStock
                        ? "text-red-600"
                        : product.stockStatus === "LOW_STOCK"
                        ? "text-amber-600"
                        : "text-green-700"
                    }`}
                  >
                    {outOfStock
                      ? "Out of stock"
                      : product.stockStatus === "LOW_STOCK"
                      ? `Only ${product.stockQuantity} left`
                      : "In stock"}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col gap-2 sm:w-40">
                  <button
                    onClick={() => handleMoveToCart(product)}
                    disabled={outOfStock || busy}
                    className="ns-btn-primary !py-2 text-sm"
                  >
                    {busy ? "Working…" : "Move to Cart"}
                  </button>
                  <button
                    onClick={() => handleRemove(product.id)}
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-1.5 text-sm text-red-600 transition hover:text-red-700 disabled:opacity-50"
                  >
                    <TrashIcon />
                    Remove
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
