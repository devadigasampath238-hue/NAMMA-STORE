"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getCart,
  getCartSummary,
  removeFromCart,
  getProduct,
  getCustomizableProducts,
  updateCartQuantity,
  addToWishlist,
} from "../../api";
import { Loading, QuantityStepper, SafeImage, useAuth, useCart } from "../../components";
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  CartIcon,
  TrashIcon,
  HeartIcon,
  Price,
  useToast,
  useWishlist,
  friendlyError,
} from "../../ui";
import type { CartItem, CartSummary, Product, CustomizableProduct } from "../../types";

// A cart line points at either a catalog Product or a CustomizableProduct -
// never both. This normalises either into what the cart UI needs.
interface LineInfo {
  name: string;
  image?: string | null;
  price: number;
  stock: number;
  productId?: number;
}

export default function CartPage() {
  const { appUser, loading: authLoading } = useAuth();
  const { refreshCart } = useCart();
  const { refresh: refreshWishlist } = useWishlist();
  const { success, error: toastError } = useToast();

  const [items, setItems] = useState<CartItem[]>([]);
  const [lineInfo, setLineInfo] = useState<Record<number, LineInfo>>({});
  const [summary, setSummary] = useState<CartSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!appUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const cart = await getCart(appUser.id);
      setItems(cart);

      const productIds = Array.from(
        new Set(cart.filter((i) => i.productId).map((i) => i.productId as number))
      );
      const needsCustomizable = cart.some((i) => i.customizableProductId);

      const [products, customizable] = await Promise.all([
        Promise.all(productIds.map((id) => getProduct(id).catch(() => null))),
        needsCustomizable
          ? getCustomizableProducts().catch(() => [])
          : Promise.resolve<CustomizableProduct[]>([]),
      ]);

      const productMap = new Map(
        products.filter((p): p is Product => Boolean(p)).map((p) => [p.id, p])
      );
      const customizableMap = new Map(customizable.map((c) => [c.id, c]));

      const info: Record<number, LineInfo> = {};
      for (const item of cart) {
        if (item.customizableProductId) {
          const c = customizableMap.get(item.customizableProductId);
          if (c) {
            info[item.id] = {
              name: c.name,
              image: c.imageUrl,
              price: c.basePrice,
              stock: c.stock,
            };
          }
        } else if (item.productId) {
          const p = productMap.get(item.productId);
          if (p) {
            info[item.id] = {
              name: p.name,
              image: p.thumbnailUrl,
              price: p.effectivePrice ?? p.salePrice ?? p.price,
              stock: p.stockQuantity,
              productId: p.id,
            };
          }
        }
      }
      setLineInfo(info);

      // Totals come from the backend, never from adding up the client's
      // numbers - that is the only way the displayed price and the charged
      // price cannot drift apart.
      setSummary(await getCartSummary(appUser.id));
    } catch (e) {
      setError(friendlyError(e, "We could not load your cart."));
    } finally {
      setLoading(false);
    }
  }, [appUser]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  async function handleQuantityChange(item: CartItem, next: number) {
    setBusyId(item.id);
    try {
      if (next <= 0) {
        await removeFromCart(item.id);
      } else {
        await updateCartQuantity(item.id, next);
      }
      await Promise.all([load(), refreshCart()]);
    } catch (e) {
      toastError(friendlyError(e, "Could not update that item."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(itemId: number) {
    setBusyId(itemId);
    try {
      await removeFromCart(itemId);
      await Promise.all([load(), refreshCart()]);
      success("Removed from cart");
    } catch (e) {
      toastError(friendlyError(e, "Could not remove that item."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveForLater(item: CartItem, productId?: number) {
    if (!appUser || !productId) return;
    setBusyId(item.id);
    try {
      await addToWishlist(appUser.id, productId);
      await removeFromCart(item.id);
      await Promise.all([load(), refreshCart(), refreshWishlist()]);
      success("Moved to your wishlist");
    } catch (e) {
      toastError(friendlyError(e, "Could not move that item."));
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading) return <Loading />;

  if (!appUser) {
    return (
      <EmptyState
        title="Sign in to see your cart"
        message="Your cart is saved to your account."
        actionLabel="Sign In"
        actionHref="/login"
        icon={<CartIcon className="h-9 w-9" />}
      />
    );
  }

  if (loading) return <ListSkeleton rows={3} height="h-32" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  if (items.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        message="Once you add something, it will show up here waiting for you."
        actionLabel="Start Shopping"
        actionHref="/products"
        icon={<CartIcon className="h-9 w-9" />}
      />
    );
  }

  return (
    <div>
      <h1 className="ns-section-title mb-6">
        Your Cart <span className="text-base font-normal text-gray-500">({items.length})</span>
      </h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        {/* ---------------- items ---------------- */}
        <div className="ns-stagger space-y-3">
          {items.map((item) => {
            const info = lineInfo[item.id];
            const unavailable = !info;
            const outOfStock = info ? info.stock <= 0 : true;
            const busy = busyId === item.id;

            return (
              <article key={item.id} className="ns-card flex gap-4 p-4">
                <SafeImage
                  src={info?.image}
                  alt={info?.name ?? "Cart item"}
                  fit="contain"
                  className="h-24 w-24 shrink-0 rounded-lg border border-brand-100 bg-white"
                  imgClassName="p-1.5"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {info?.productId ? (
                        <Link
                          href={`/products/${info.productId}`}
                          className="font-medium text-gray-900 transition hover:text-brand-700"
                        >
                          {info.name}
                        </Link>
                      ) : (
                        <span className="font-medium text-gray-900">
                          {info?.name ?? "This item is no longer available"}
                        </span>
                      )}

                      {(item.customizableProductId || item.customImageUrl) && (
                        <span className="ns-badge ml-2 bg-brand-100 text-brand-800">Customised</span>
                      )}
                    </div>

                    <Price
                      value={(info?.price ?? 0) * item.quantity}
                      className="shrink-0 font-semibold text-brand-800"
                    />
                  </div>

                  <div className="mt-1 text-xs text-gray-500">
                    {[
                      item.selectedColor && `Colour: ${item.selectedColor}`,
                      item.selectedSize && `Size: ${item.selectedSize}`,
                      item.printPosition && `Position: ${item.printPosition}`,
                      item.customText && `Text: "${item.customText}"`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>

                  <p className="mt-0.5 text-xs text-gray-400">
                    <Price value={info?.price ?? 0} /> each
                  </p>

                  {unavailable && (
                    <p className="mt-1 text-xs font-medium text-red-600">
                      No longer available — please remove it.
                    </p>
                  )}
                  {!unavailable && outOfStock && (
                    <p className="mt-1 text-xs font-medium text-red-600">Out of stock</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <QuantityStepper
                      value={item.quantity}
                      max={info?.stock}
                      onChange={(next) => handleQuantityChange(item, next)}
                    />

                    {info?.productId && (
                      <button
                        onClick={() => handleSaveForLater(item, info.productId)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 text-sm text-gray-600 transition hover:text-brand-700 disabled:opacity-50"
                      >
                        <HeartIcon className="h-4 w-4" />
                        Save for later
                      </button>
                    )}

                    <button
                      onClick={() => handleRemove(item.id)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 text-sm text-red-600 transition hover:text-red-700 disabled:opacity-50"
                    >
                      <TrashIcon />
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* ---------------- price summary ---------------- */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="ns-panel p-5">
            <h2 className="mb-4 font-heading text-sm font-semibold uppercase tracking-wide text-brand-900">
              Price Details
            </h2>

            <dl className="space-y-2.5 text-sm">
              <Row label={`Subtotal (${summary?.itemCount ?? 0} items)`} value={summary?.subtotal} />
              {(summary?.discountAmount ?? 0) > 0 && (
                <Row
                  label={`Coupon discount${summary?.couponCode ? ` (${summary.couponCode})` : ""}`}
                  value={summary?.discountAmount}
                  negative
                />
              )}
              <Row
                label="Delivery"
                value={summary?.deliveryCharge}
                free={(summary?.deliveryCharge ?? 0) === 0}
              />
            </dl>

            <div className="mt-4 flex items-center justify-between border-t border-brand-100 pt-4">
              <span className="font-heading font-semibold text-brand-900">Total</span>
              <Price value={summary?.totalAmount} className="text-xl font-bold text-brand-800" />
            </div>

            <p className="mt-2 text-xs text-gray-400">
              Totals are calculated by the server. Apply a coupon at checkout.
            </p>

            <Link href="/checkout" className="ns-btn-primary mt-5 w-full !py-3">
              Proceed to Checkout
            </Link>

            <Link
              href="/products"
              className="mt-3 block text-center text-sm font-medium text-brand-700 hover:underline"
            >
              ← Continue shopping
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  negative = false,
  free = false,
}: {
  label: string;
  value?: number;
  negative?: boolean;
  free?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-600">{label}</dt>
      <dd className={negative ? "font-medium text-green-700" : "text-gray-800"}>
        {free ? (
          <span className="font-medium text-green-700">FREE</span>
        ) : (
          <>
            {negative && "−"}
            <Price value={value} />
          </>
        )}
      </dd>
    </div>
  );
}
