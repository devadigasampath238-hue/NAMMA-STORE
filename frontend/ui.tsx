"use client";

// ===========================================================
// ui.tsx - Stage 2 shared UI layer.
//
// Kept separate from components.tsx so that file stays about
// catalog/admin pieces, while this one owns cross-cutting
// concerns: toasts, wishlist state, icons, empty/error states,
// the product image gallery and the order status timeline.
//
// No animation library is used. framer-motion is NOT a
// dependency of this project, so every motion here is CSS from
// globals.css, which also means prefers-reduced-motion is
// honoured for free.
// ===========================================================

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { toggleWishlist, resolveImageUrl, productImage, PLACEHOLDER_IMAGE } from "./api";
import { useAuth, useCart, SafeImage } from "./components";
import type { Product, Category } from "./types";

/* ===========================================================
   ICONS
   -----------------------------------------------------------
   Inline SVG rather than an icon package: lucide-react is not
   installed, and these are the only glyphs the app needs.
   Each is aria-hidden - the accessible name comes from the
   button that wraps it.
   =========================================================== */

type IconProps = { className?: string; filled?: boolean };

export function HeartIcon({ className = "w-5 h-5", filled = false }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21.2l7.7-7.7 1.1-1.1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}

export function CartIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h3l2.6 12.3a1.6 1.6 0 0 0 1.6 1.2h8.4a1.6 1.6 0 0 0 1.6-1.3L21 7H6" />
    </svg>
  );
}

export function SearchIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={1.9} strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

export function UserIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function ChevronIcon({
  className = "w-5 h-5",
  direction = "right",
}: IconProps & { direction?: "left" | "right" | "up" | "down" }) {
  const rotation = { right: 0, down: 90, left: 180, up: 270 }[direction];
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ transform: `rotate(${rotation}deg)` }}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

export function CloseIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function CheckIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

export function TrashIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
    </svg>
  );
}

export function MenuIcon({ className = "w-6 h-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function Spinner({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} ns-animate-spin`} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ===========================================================
   TOASTS
   -----------------------------------------------------------
   Deliberately tiny. A toast queue is the kind of thing people
   reach for a library for, but the whole requirement here is
   "show a message, fade it out", and react-hot-toast is not
   installed.
   =========================================================== */

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string };

type ToastContextValue = {
  toast: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
  success: () => {},
  error: () => {},
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, kind, message }]);
      const timer = setTimeout(() => dismiss(id), kind === "error" ? 5000 : 3000);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  // Clear pending timers on unmount so nothing fires into a dead tree.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (message: string) => toast(message, "success"),
      error: (message: string) => toast(message, "error"),
    }),
    [toast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`ns-animate-slide-in pointer-events-auto flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur ${
              t.kind === "success"
                ? "border-green-200 bg-green-50/95 text-green-800"
                : t.kind === "error"
                ? "border-red-200 bg-red-50/95 text-red-800"
                : "border-brand-200 bg-white/95 text-brand-900"
            }`}
          >
            <span className="mt-0.5 shrink-0">
              {t.kind === "success" ? (
                <CheckIcon className="h-4 w-4" />
              ) : t.kind === "error" ? (
                <CloseIcon className="h-4 w-4" />
              ) : null}
            </span>
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 opacity-50 transition hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/**
 * Customers must never see a raw backend error. This keeps the real
 * message in the console for debugging and returns a safe line for the UI.
 */
export function friendlyError(e: unknown, fallback = "Something went wrong. Please try again."): string {
  if (typeof console !== "undefined") console.error("[Namma Store]", e);
  const raw = e instanceof Error ? e.message : "";

  // Messages the backend writes deliberately for customers are short and
  // sentence-like. Anything that smells like a stack trace or a SQL/Java
  // internal is swapped for the generic line.
  const looksInternal =
    !raw ||
    raw.length > 180 ||
    /exception|error \d{3}|sql|constraint|hibernate|nested|\bat [a-z]+\./i.test(raw);

  return looksInternal ? fallback : raw;
}

/* ===========================================================
   WISHLIST CONTEXT
   -----------------------------------------------------------
   Holds the badge count plus the set of wishlisted product ids,
   so every heart on a grid knows its own state without each
   card firing its own "contains" request.
   =========================================================== */

type WishlistContextValue = {
  count: number;
  ids: Set<number>;
  ready: boolean;
  isWishlisted: (productId: number) => boolean;
  toggle: (productId: number) => Promise<boolean>;
  refresh: () => Promise<void>;
  /** Lets the wishlist page keep the badge in sync after a removal. */
  setIds: (ids: Set<number>, count: number) => void;
};

const WishlistContext = createContext<WishlistContextValue>({
  count: 0,
  ids: new Set(),
  ready: false,
  isWishlisted: () => false,
  toggle: async () => false,
  refresh: async () => {},
  setIds: () => {},
});

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { appUser } = useAuth();
  const { error: toastError } = useToast();

  const [count, setCount] = useState(0);
  const [ids, setIdSet] = useState<Set<number>>(new Set());
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!appUser) {
      setCount(0);
      setIdSet(new Set());
      setReady(true);
      return;
    }
    try {
      // The full list doubles as the id set, so one request covers both.
      const { getWishlist } = await import("./api");
      const products = await getWishlist(appUser.id);
      setIdSet(new Set(products.map((p) => p.id)));
      setCount(products.length);
    } catch (e) {
      // A wishlist that fails to load must not break the page it sits on.
      console.error("[Namma Store] wishlist refresh failed", e);
      setCount(0);
      setIdSet(new Set());
    } finally {
      setReady(true);
    }
  }, [appUser]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = useCallback(
    async (productId: number) => {
      if (!appUser) {
        toastError("Please sign in to use your wishlist.");
        return false;
      }

      // Optimistic flip so the heart responds instantly.
      const wasSet = ids.has(productId);
      const optimistic = new Set(ids);
      if (wasSet) optimistic.delete(productId);
      else optimistic.add(productId);
      setIdSet(optimistic);
      setCount(optimistic.size);

      try {
        const result = await toggleWishlist(appUser.id, productId);
        const confirmed = new Set(optimistic);
        if (result.wishlisted) confirmed.add(productId);
        else confirmed.delete(productId);
        setIdSet(confirmed);
        setCount(result.count);
        return result.wishlisted;
      } catch (e) {
        // Roll the optimistic change back - the server is the truth.
        const reverted = new Set(ids);
        setIdSet(reverted);
        setCount(reverted.size);
        toastError(friendlyError(e, "Could not update your wishlist."));
        return wasSet;
      }
    },
    [appUser, ids, toastError]
  );

  const setIds = useCallback((next: Set<number>, nextCount: number) => {
    setIdSet(next);
    setCount(nextCount);
  }, []);

  const value = useMemo<WishlistContextValue>(
    () => ({
      count,
      ids,
      ready,
      isWishlisted: (productId: number) => ids.has(productId),
      toggle,
      refresh,
      setIds,
    }),
    [count, ids, ready, toggle, refresh, setIds]
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  return useContext(WishlistContext);
}

/** Heart button used on cards, the detail page and the wishlist page. */
export function WishlistButton({
  productId,
  className = "",
  showLabel = false,
}: {
  productId: number;
  className?: string;
  showLabel?: boolean;
}) {
  const { isWishlisted, toggle } = useWishlist();
  const { success } = useToast();
  const [busy, setBusy] = useState(false);
  const [popping, setPopping] = useState(false);

  const active = isWishlisted(productId);

  async function handleClick(e: React.MouseEvent) {
    // Cards are wrapped in a <Link>; without this the click navigates.
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;

    setBusy(true);
    setPopping(true);
    const nowWishlisted = await toggle(productId);
    setBusy(false);
    window.setTimeout(() => setPopping(false), 400);

    success(nowWishlisted ? "Added to your wishlist" : "Removed from your wishlist");
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-pressed={active}
      aria-label={active ? "Remove from wishlist" : "Add to wishlist"}
      title={active ? "Remove from wishlist" : "Add to wishlist"}
      className={`inline-flex items-center gap-2 transition ${
        active ? "text-red-500" : "text-gray-400 hover:text-red-400"
      } ${className}`}
    >
      <HeartIcon className={`h-5 w-5 ${popping ? "ns-animate-heart" : ""}`} filled={active} />
      {showLabel && (
        <span className="text-sm font-medium">{active ? "Wishlisted" : "Wishlist"}</span>
      )}
    </button>
  );
}

/* ===========================================================
   STATES: empty / error / skeleton
   =========================================================== */

export function EmptyState({
  title,
  message,
  actionLabel,
  actionHref,
  icon,
}: {
  title: string;
  message?: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="ns-animate-fade-up flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-brand-400">
        {icon ?? <HeartIcon className="h-9 w-9" />}
      </div>
      <h2 className="font-heading text-xl font-semibold text-brand-900">{title}</h2>
      {message && <p className="mt-2 max-w-md text-sm text-gray-500">{message}</p>}
      {actionLabel && actionHref && (
        <Link href={actionHref} className="ns-btn-primary mt-6">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

export function ErrorState({
  message = "Something went wrong. Please try again.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="ns-animate-fade-in rounded-xl2 border border-red-100 bg-red-50/70 px-6 py-10 text-center">
      <p className="font-medium text-red-800">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="ns-btn-outline mt-4 !border-red-300 !text-red-700">
          Try again
        </button>
      )}
    </div>
  );
}

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`ns-skeleton rounded-lg ${className}`} />;
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="ns-grid-products" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="ns-card overflow-hidden">
          <SkeletonBlock className="aspect-square !rounded-none" />
          <div className="space-y-2 p-3.5">
            <SkeletonBlock className="h-4 w-3/4" />
            <SkeletonBlock className="h-4 w-1/2" />
            <SkeletonBlock className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 4, height = "h-24" }: { rows?: number; height?: string }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} className={`${height} w-full`} />
      ))}
    </div>
  );
}

/* ===========================================================
   PRODUCT IMAGE GALLERY
   -----------------------------------------------------------
   Thumbnails, prev/next, counter, keyboard arrows, touch swipe
   and an optional lightbox.
   =========================================================== */

export function ProductGallery({
  images,
  alt,
  overlay,
}: {
  images: string[];
  alt: string;
  /** e.g. the customization design preview. */
  overlay?: React.ReactNode;
}) {
  const safeImages = images.filter(Boolean);
  const gallery = safeImages.length > 0 ? safeImages : [PLACEHOLDER_IMAGE];

  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  // A shorter gallery (product edited while open) must not strand the index.
  useEffect(() => {
    if (index > gallery.length - 1) setIndex(0);
  }, [gallery.length, index]);

  const go = useCallback(
    (delta: number) => {
      setIndex((current) => (current + delta + gallery.length) % gallery.length);
    },
    [gallery.length]
  );

  // Arrow keys work when the gallery has focus, and always in the lightbox.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!lightbox) {
        const frame = frameRef.current;
        if (!frame || !frame.contains(document.activeElement)) return;
      }
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      if (e.key === "Escape" && lightbox) setLightbox(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, lightbox]);

  // Lock body scroll while the lightbox is open.
  useEffect(() => {
    if (!lightbox) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [lightbox]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    // 40px threshold: small enough to feel responsive, large enough
    // that a vertical scroll does not register as a swipe.
    if (Math.abs(delta) > 40) go(delta < 0 ? 1 : -1);
    touchStartX.current = null;
  }

  const multiple = gallery.length > 1;

  return (
    <div>
      <div
        ref={frameRef}
        tabIndex={0}
        role="group"
        aria-label={`${alt} image gallery`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="group relative aspect-square overflow-hidden rounded-xl2 border border-brand-100 bg-white"
      >
        <SafeImage
          key={gallery[index]}
          src={gallery[index]}
          alt={`${alt} - image ${index + 1} of ${gallery.length}`}
          fit="contain"
          className="ns-animate-fade-in h-full w-full"
          imgClassName="p-4 md:p-6"
        />

        {overlay}

        {multiple && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-brand-800 shadow-md transition hover:bg-white md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
            >
              <ChevronIcon direction="left" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next image"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-brand-800 shadow-md transition hover:bg-white md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
            >
              <ChevronIcon direction="right" />
            </button>
            <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white">
              {index + 1} / {gallery.length}
            </span>
          </>
        )}

        <button
          type="button"
          onClick={() => setLightbox(true)}
          aria-label="View image full screen"
          className="absolute bottom-2 left-2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-brand-800 shadow-sm transition hover:bg-white"
        >
          Zoom
        </button>
      </div>

      {multiple && (
        <div className="ns-no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          {gallery.map((img, i) => (
            <button
              key={`${img}-${i}`}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show image ${i + 1}`}
              aria-current={i === index}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white transition ${
                i === index ? "border-brand-600" : "border-brand-100 hover:border-brand-300"
              }`}
            >
              <SafeImage src={img} alt="" fit="contain" className="h-full w-full" imgClassName="p-1" />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="ns-animate-fade-in fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} full screen image`}
          onClick={() => setLightbox(false)}
        >
          <button
            onClick={() => setLightbox(false)}
            aria-label="Close full screen view"
            className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white transition hover:bg-white/25"
          >
            <CloseIcon className="h-6 w-6" />
          </button>

          <img
            src={resolveImageUrl(gallery[index])}
            alt={`${alt} - image ${index + 1}`}
            className="ns-animate-scale-in max-h-[85vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {multiple && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); go(-1); }}
                aria-label="Previous image"
                className="absolute left-4 rounded-full bg-white/15 p-3 text-white transition hover:bg-white/25"
              >
                <ChevronIcon direction="left" className="h-6 w-6" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); go(1); }}
                aria-label="Next image"
                className="absolute right-4 rounded-full bg-white/15 p-3 text-white transition hover:bg-white/25"
              >
                <ChevronIcon direction="right" className="h-6 w-6" />
              </button>
              <span className="absolute bottom-6 rounded-full bg-white/15 px-3 py-1 text-sm text-white">
                {index + 1} / {gallery.length}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ===========================================================
   ORDER STATUS TIMELINE
   =========================================================== */

export const ORDER_STATUS_FLOW = [
  "PLACED",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

export function prettyStatus(status: string): string {
  return status
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

export function OrderStatusBadge({ status }: { status: string }) {
  const tone =
    status === "DELIVERED"
      ? "bg-green-100 text-green-800"
      : status === "CANCELLED"
      ? "bg-red-100 text-red-700"
      : status === "SHIPPED" || status === "OUT_FOR_DELIVERY"
      ? "bg-blue-100 text-blue-800"
      : "bg-brand-100 text-brand-800";
  return <span className={`ns-badge ${tone}`}>{prettyStatus(status)}</span>;
}

export function OrderStatusTimeline({ status }: { status: string }) {
  if (status === "CANCELLED") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
        <CloseIcon className="h-4 w-4" />
        This order was cancelled.
      </div>
    );
  }

  const currentIndex = ORDER_STATUS_FLOW.indexOf(status as (typeof ORDER_STATUS_FLOW)[number]);
  // An unrecognised status (legacy row) shows the flow with nothing lit
  // rather than silently marking everything complete.
  const reached = currentIndex < 0 ? -1 : currentIndex;

  return (
    <ol className="flex flex-col gap-0 sm:flex-row sm:items-start">
      {ORDER_STATUS_FLOW.map((step, i) => {
        const done = i <= reached;
        const isCurrent = i === reached;
        return (
          <li key={step} className="flex flex-1 gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center">
            <div className="flex flex-col items-center sm:w-full sm:flex-row">
              {/* left/top connector */}
              <span
                className={`hidden h-0.5 flex-1 sm:block ${
                  i === 0 ? "opacity-0" : done ? "bg-brand-500" : "bg-brand-100"
                }`}
              />
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition ${
                  done
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-brand-200 bg-white text-brand-300"
                } ${isCurrent ? "ring-4 ring-brand-100" : ""}`}
              >
                {done ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={`hidden h-0.5 flex-1 sm:block ${
                  i === ORDER_STATUS_FLOW.length - 1
                    ? "opacity-0"
                    : i < reached
                    ? "bg-brand-500"
                    : "bg-brand-100"
                }`}
              />
              {/* vertical connector on mobile */}
              {i < ORDER_STATUS_FLOW.length - 1 && (
                <span
                  className={`mt-1 h-6 w-0.5 sm:hidden ${i < reached ? "bg-brand-500" : "bg-brand-100"}`}
                />
              )}
            </div>
            <span
              className={`pb-4 text-xs sm:pb-0 ${
                isCurrent ? "font-semibold text-brand-800" : done ? "text-brand-700" : "text-gray-400"
              }`}
            >
              {prettyStatus(step)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ===========================================================
   MODAL
   =========================================================== */

export function Modal({
  open,
  title,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="ns-animate-fade-in fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/45 p-4 py-10"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`ns-animate-scale-in w-full rounded-xl2 bg-white shadow-xl ${wide ? "max-w-3xl" : "max-w-lg"}`}
      >
        <div className="flex items-center justify-between border-b border-brand-100 px-5 py-4">
          <h2 className="font-heading text-lg font-semibold text-brand-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 transition hover:text-gray-700">
            <CloseIcon />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ===========================================================
   SUCCESS ANIMATION
   =========================================================== */

export function SuccessCheck({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Success">
      <circle
        className="ns-success-circle"
        cx="50" cy="50" r="46"
        fill="none" stroke="#16a34a" strokeWidth="5" strokeLinecap="round"
        transform="rotate(-90 50 50)"
      />
      <path
        className="ns-success-check"
        d="M30 52l13 13 27-27"
        fill="none" stroke="#16a34a" strokeWidth="6"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Lightweight confetti. 28 absolutely-positioned divs on a pure-CSS
 * animation - no canvas, no rAF loop, and it removes itself after two
 * seconds so nothing keeps painting.
 */
export function Confetti({ pieces = 28 }: { pieces?: number }) {
  const [visible, setVisible] = useState(true);

  const confetti = useMemo(
    () =>
      Array.from({ length: pieces }).map((_, i) => ({
        id: i,
        left: `${(i * 97) % 100}%`,
        delay: `${(i % 7) * 0.09}s`,
        color: ["#E97A0C", "#C2410C", "#FDB94D", "#16a34a", "#7C2D12"][i % 5],
        size: 6 + (i % 4) * 2,
      })),
    [pieces]
  );

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 2200);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden" aria-hidden="true">
      {confetti.map((piece) => (
        <span
          key={piece.id}
          className="ns-confetti-piece absolute block rounded-[2px]"
          style={{
            left: piece.left,
            width: piece.size,
            height: piece.size * 1.6,
            backgroundColor: piece.color,
            animationDelay: piece.delay,
          }}
        />
      ))}
    </div>
  );
}

/* ===========================================================
   MISC
   =========================================================== */

export function Price({
  value,
  className = "",
}: {
  value: number | string | null | undefined;
  className?: string;
}) {
  const amount = Number(value ?? 0);
  return (
    <span className={className}>
      ₹{amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
    </span>
  );
}

export function formatRupees(value: number | string | null | undefined): string {
  return `₹${Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Estimated delivery window shown on the success page and order history. */
export function deliveryWindow(from?: string | null): string {
  const start = from ? new Date(from) : new Date();
  const base = Number.isNaN(start.getTime()) ? new Date() : start;
  const early = new Date(base);
  early.setDate(early.getDate() + 4);
  const late = new Date(base);
  late.setDate(late.getDate() + 7);

  const sameMonth = early.getMonth() === late.getMonth();
  const month = late.toLocaleDateString("en-IN", { month: "long" });
  return sameMonth
    ? `${early.getDate()}–${late.getDate()} ${month}`
    : `${early.getDate()} ${early.toLocaleDateString("en-IN", { month: "long" })} – ${late.getDate()} ${month}`;
}

/* ===========================================================
   CATALOG CARDS
   -----------------------------------------------------------
   These live here rather than in components.tsx because they
   render the wishlist heart, and components.tsx must not depend
   on this file (that would be an import cycle).
   =========================================================== */

export function ProductCard({
  product,
  onAddToCart,
}: {
  product: Product;
  onAddToCart?: (product: Product) => unknown | Promise<unknown>;
}) {
  const [adding, setAdding] = useState(false);

  const outOfStock = (product.stockQuantity ?? 0) <= 0;
  const displayPrice = product.effectivePrice ?? product.salePrice ?? product.price;
  const onSale = product.onSale ?? Boolean(product.salePrice);
  const discount = product.discountPercent ?? 0;

  async function handleAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!onAddToCart || adding || outOfStock) return;
    setAdding(true);
    try {
      await onAddToCart(product);
    } finally {
      setAdding(false);
    }
  }

  return (
    /* flex-col + h-full is what keeps every card in a row the same height
       regardless of how long the product name is. */
    <div className="ns-card ns-card-hover group flex h-full flex-col overflow-hidden">
      <Link
        href={`/products/${product.id}`}
        className="relative block"
        aria-label={product.name}
      >
        <SafeImage
          src={productImage(product)}
          alt={product.name}
          className="aspect-square"
          imgClassName="group-hover:scale-105 transition-transform duration-300"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        />

        {product.productType && (
          <span className="ns-badge absolute left-2 top-2 bg-white/90 text-brand-700 shadow-sm">
            {product.productType}
          </span>
        )}

        {onSale && discount > 0 && (
          <span className="ns-badge absolute bottom-2 left-2 bg-brand-600 text-white shadow-sm">
            {discount}% OFF
          </span>
        )}

        {outOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/65 backdrop-blur-[1px]">
            <span className="rounded-full bg-gray-900/80 px-3 py-1 text-xs font-semibold text-white">
              Out of Stock
            </span>
          </div>
        )}
      </Link>

      {/* Outside the Link so the heart never triggers navigation. */}
      <div className="absolute right-2 top-2 z-10">
        <WishlistButton
          productId={product.id}
          className="rounded-full bg-white/90 p-1.5 shadow-sm backdrop-blur transition hover:bg-white"
        />
      </div>

      <div className="flex flex-1 flex-col p-3 sm:p-3.5">
        <Link href={`/products/${product.id}`} className="block">
          <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-gray-900 transition group-hover:text-brand-700">
            {product.name}
          </h3>
        </Link>

        {product.categoryName && (
          <span className="mt-0.5 truncate text-[11px] text-gray-400">{product.categoryName}</span>
        )}

        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
          <Price value={displayPrice} className="text-base font-semibold text-brand-700" />
          {onSale && (
            <Price value={product.price} className="text-xs text-gray-400 line-through" />
          )}
        </div>

        <span
          className={`mt-1 text-xs font-medium ${
            outOfStock
              ? "text-red-600"
              : product.stockStatus === "LOW_STOCK"
              ? "text-amber-600"
              : "text-green-700"
          }`}
        >
          {outOfStock
            ? "Out of Stock"
            : product.stockStatus === "LOW_STOCK"
            ? `Only ${product.stockQuantity} left`
            : "In Stock"}
        </span>

        <div className="mt-auto flex gap-2 pt-3">
          {onAddToCart ? (
            <button
              onClick={handleAdd}
              disabled={outOfStock || adding}
              className="ns-btn-primary flex-1 !px-2 !py-2 text-xs"
            >
              {adding ? <Spinner className="h-4 w-4" /> : "Add to Cart"}
            </button>
          ) : (
            <Link href={`/products/${product.id}`} className="ns-btn-primary flex-1 !px-2 !py-2 text-xs">
              View
            </Link>
          )}
          <Link
            href={`/products/${product.id}?buy=1`}
            className="ns-btn-outline flex-1 !px-2 !py-2 text-xs"
          >
            Buy Now
          </Link>
        </div>
      </div>
    </div>
  );
}

export function CategoryCard({ category }: { category: Category }) {
  return (
    <Link
      href={`/categories/${category.id}`}
      className="ns-card ns-card-hover group block overflow-hidden text-center"
    >
      <SafeImage
        src={category.imageUrl}
        alt={category.name}
        className="aspect-video"
        imgClassName="group-hover:scale-105 transition-transform duration-300"
      />
      <div className="p-2.5">
        <div className="truncate font-medium text-brand-900">{category.name}</div>
        {typeof category.productCount === "number" && (
          <div className="mt-0.5 text-xs text-gray-500">
            {category.productCount} item{category.productCount === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </Link>
  );
}

/* ===========================================================
   NAVBAR
   =========================================================== */

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const router = useRouter();
  const pathname = usePathname();

  const { appUser, loading, signOut } = useAuth();
  const { count: cartCount } = useCart();
  const { count: wishlistCount } = useWishlist();

  const accountRef = useRef<HTMLDivElement | null>(null);
  const [cartBump, setCartBump] = useState(false);
  const previousCart = useRef(cartCount);

  const links = [
    { href: "/products", label: "Products" },
    { href: "/categories", label: "Categories" },
    { href: "/customize", label: "Customize" },
  ];

  // Bump the badge whenever the cart grows.
  useEffect(() => {
    if (cartCount > previousCart.current) {
      setCartBump(true);
      const timer = setTimeout(() => setCartBump(false), 400);
      return () => clearTimeout(timer);
    }
    previousCart.current = cartCount;
  }, [cartCount]);

  // Close menus on navigation.
  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  // Click-outside + Escape for the account dropdown.
  useEffect(() => {
    if (!accountOpen) return;
    function onClick(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAccountOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = searchValue.trim();
    router.push(term ? `/products?q=${encodeURIComponent(term)}` : "/products");
    setMenuOpen(false);
  }

  const accountLinks = [
    { href: "/account", label: "My Profile" },
    { href: "/account?tab=orders", label: "My Orders" },
    { href: "/wishlist", label: "Wishlist" },
    { href: "/account?tab=addresses", label: "Addresses" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-brand-100 bg-white/95 backdrop-blur">
      <div className="h-1 bg-gradient-to-r from-brand-500 via-brand-600 to-brand-800" />

      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Namma Store home">
          {/* object-contain inside a padded circle: the source is a square
              JPEG, so object-cover was slicing its edges off. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.jpeg"
            alt="Namma Store"
            className="h-10 w-10 shrink-0 rounded-full bg-white object-contain p-0.5 ring-2 ring-brand-200"
          />
          <span className="hidden font-kannada text-xl font-semibold text-brand-800 sm:inline">
            ನಮ್ಮ Store
          </span>
        </Link>

        <form onSubmit={handleSearch} className="hidden flex-1 md:flex" role="search">
          <label htmlFor="ns-search" className="sr-only">
            Search products
          </label>
          <div className="relative flex w-full max-w-lg">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
            <input
              id="ns-search"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search for mugs, t-shirts, gifts…"
              className="w-full rounded-l-lg border border-brand-100 bg-brand-50/40 py-2 pl-9 pr-3 text-sm transition focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
            <button
              type="submit"
              className="rounded-r-lg bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              Search
            </button>
          </div>
        </form>

        <nav className="ml-auto hidden gap-5 lg:flex" aria-label="Main">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm font-medium transition hover:text-brand-700 ${
                pathname === l.href ? "text-brand-700" : "text-gray-700"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 md:ml-2 md:gap-2">
          <Link
            href="/wishlist"
            className="relative rounded-lg p-2 text-gray-700 transition hover:bg-brand-50 hover:text-brand-700"
            aria-label={`Wishlist${wishlistCount > 0 ? `, ${wishlistCount} items` : ""}`}
          >
            <HeartIcon />
            {wishlistCount > 0 && (
              <span className="absolute right-0 top-0 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                {wishlistCount > 99 ? "99+" : wishlistCount}
              </span>
            )}
          </Link>

          <Link
            href="/cart"
            className="relative rounded-lg p-2 text-gray-700 transition hover:bg-brand-50 hover:text-brand-700"
            aria-label={`Cart${cartCount > 0 ? `, ${cartCount} items` : ""}`}
          >
            <CartIcon />
            {cartCount > 0 && (
              <span
                className={`absolute right-0 top-0 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white ${
                  cartBump ? "ns-animate-cart-bump" : ""
                }`}
              >
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>

          {!loading && appUser ? (
            <div className="relative hidden md:block" ref={accountRef}>
              <button
                onClick={() => setAccountOpen((open) => !open)}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-gray-700 transition hover:bg-brand-50 hover:text-brand-700"
              >
                <UserIcon />
                <span className="max-w-[7rem] truncate">
                  {appUser.displayName?.split(" ")[0] || "Account"}
                </span>
                <ChevronIcon direction={accountOpen ? "up" : "down"} className="h-4 w-4" />
              </button>

              {accountOpen && (
                <div
                  role="menu"
                  className="ns-animate-scale-in absolute right-0 mt-2 w-52 origin-top-right overflow-hidden rounded-xl border border-brand-100 bg-white py-1 shadow-lg"
                >
                  <div className="border-b border-brand-50 px-4 py-2">
                    <p className="truncate text-sm font-medium text-brand-900">
                      {appUser.displayName || "Namma customer"}
                    </p>
                    <p className="truncate text-xs text-gray-500">{appUser.email}</p>
                  </div>
                  {accountLinks.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      role="menuitem"
                      className="block px-4 py-2 text-sm text-gray-700 transition hover:bg-brand-50 hover:text-brand-800"
                    >
                      {l.label}
                    </Link>
                  ))}
                  <button
                    role="menuitem"
                    onClick={async () => {
                      setAccountOpen(false);
                      await signOut();
                      router.push("/");
                    }}
                    className="block w-full border-t border-brand-50 px-4 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            !loading && (
              <Link href="/login" className="ns-btn-primary hidden !px-4 !py-1.5 text-sm md:inline-flex">
                Login
              </Link>
            )
          )}

          <button
            className="rounded-lg p-2 text-gray-700 transition hover:bg-brand-50 lg:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label="Toggle menu"
          >
            {menuOpen ? <CloseIcon className="h-6 w-6" /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* Search stays visible on mobile - it is the primary way people shop. */}
      <form onSubmit={handleSearch} className="px-4 pb-3 md:hidden" role="search">
        <label htmlFor="ns-search-mobile" className="sr-only">
          Search products
        </label>
        <div className="relative flex">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
          <input
            id="ns-search-mobile"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search products…"
            className="w-full rounded-l-lg border border-brand-100 bg-brand-50/40 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <button type="submit" className="rounded-r-lg bg-brand-600 px-4 text-sm text-white">
            Go
          </button>
        </div>
      </form>

      {menuOpen && (
        <nav
          className="ns-animate-fade-in border-t border-brand-100 bg-white px-4 py-3 lg:hidden"
          aria-label="Mobile"
        >
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-brand-50"
              >
                {l.label}
              </Link>
            ))}
            <Link href="/wishlist" className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-brand-50">
              Wishlist {wishlistCount > 0 && `(${wishlistCount})`}
            </Link>
            <Link href="/cart" className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-brand-50">
              Cart {cartCount > 0 && `(${cartCount})`}
            </Link>

            {!loading && appUser ? (
              <>
                <Link href="/account" className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-brand-50">
                  My Account
                </Link>
                <button
                  onClick={async () => {
                    await signOut();
                    router.push("/");
                  }}
                  className="rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link href="/login" className="ns-btn-primary mt-2 text-sm">
                Login / Register
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

/* ===========================================================
   FOOTER
   =========================================================== */

export function Footer() {
  const columns = [
    {
      title: "Shop",
      links: [
        { href: "/products", label: "All Products" },
        { href: "/categories", label: "Categories" },
        { href: "/customize", label: "Customize" },
        { href: "/wishlist", label: "Wishlist" },
      ],
    },
    {
      title: "Your Account",
      links: [
        { href: "/account", label: "My Profile" },
        { href: "/account?tab=orders", label: "My Orders" },
        { href: "/cart", label: "Cart" },
        { href: "/login", label: "Sign In" },
      ],
    },
    {
      title: "Customer Service",
      links: [
        { href: "/account?tab=orders", label: "Track Order" },
        { href: "/products", label: "Shipping" },
        { href: "/products", label: "Returns" },
        { href: "/products", label: "Contact Us" },
      ],
    },
  ];

  return (
    <footer className="mt-16 bg-brand-900 text-brand-100">
      <div className="h-1 bg-gradient-to-r from-brand-500 via-brand-600 to-brand-800" />

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.jpeg"
              alt=""
              className="h-10 w-10 rounded-full bg-white object-contain p-0.5"
            />
            <span className="font-kannada text-lg font-semibold text-white">ನಮ್ಮ Store</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-brand-200">
            Karnataka&apos;s own online store for everyday products, personalised gifts and
            corporate gifting.
          </p>
        </div>

        {columns.map((column) => (
          <div key={column.title}>
            <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-white">
              {column.title}
            </h3>
            <ul className="mt-3 space-y-2">
              {column.links.map((link, i) => (
                <li key={`${link.href}-${i}`}>
                  <Link href={link.href} className="text-sm text-brand-200 transition hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-brand-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-sm sm:flex-row">
          <p>© {new Date().getFullYear()} Namma Store. Made with ❤️ in Karnataka.</p>
          <p className="text-brand-300">Prices in ₹ INR · Dummy payments in this build</p>
        </div>
      </div>
    </footer>
  );
}

/* ===========================================================
   STORE BENEFITS STRIP
   =========================================================== */

export function BenefitsStrip() {
  const benefits = [
    { icon: "🚚", title: "Fast Delivery", text: "Across Karnataka and beyond" },
    { icon: "🔒", title: "Secure Checkout", text: "Your details stay protected" },
    { icon: "↩️", title: "Easy Returns", text: "7-day return window" },
    { icon: "❤️", title: "Trusted Store", text: "Locally made, locally loved" },
  ];

  return (
    <div className="ns-stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
      {benefits.map((benefit) => (
        <div key={benefit.title} className="ns-panel flex items-center gap-3 p-4">
          <span className="text-2xl" aria-hidden="true">
            {benefit.icon}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-brand-900">{benefit.title}</p>
            <p className="truncate text-xs text-gray-500">{benefit.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ===========================================================
   ADD TO CART HOOK
   -----------------------------------------------------------
   One place that knows the sign-in check, the cart badge refresh
   and the toast, so every "Add to Cart" button behaves the same.
   =========================================================== */

export function useAddToCart() {
  const { appUser } = useAuth();
  const { refreshCart } = useCart();
  const { success, error } = useToast();
  const router = useRouter();

  return useCallback(
    async (productId: number, quantity = 1, extras?: Record<string, unknown>) => {
      if (!appUser) {
        error("Please sign in to add items to your cart.");
        router.push("/login");
        return false;
      }
      try {
        const { addToCart } = await import("./api");
        await addToCart({ userId: appUser.id, productId, quantity, ...extras });
        await refreshCart();
        success("Added to cart");
        return true;
      } catch (e) {
        error(friendlyError(e, "Could not add this item to your cart."));
        return false;
      }
    },
    [appUser, refreshCart, success, error, router]
  );
}
