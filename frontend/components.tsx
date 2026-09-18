"use client";

// ===========================================================
// components.tsx - every reusable UI piece lives here.
// Navbar, Footer, ProductCard, CategoryCard, SearchBar,
// Loading, AdminSidebar, etc. Import what you need from
// this single file into your pages.
// ===========================================================

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Product, Category, AppUser, Address } from "./types";
import {
  syncUser,
  getCart,
  uploadFile,
  resolveImageUrl,
  productImage,
  adminVerify,
  PLACEHOLDER_IMAGE,
} from "./api";
import { watchAuthState, logout as firebaseLogout, type FirebaseUser } from "./firebase";

// ---------------- Auth context ----------------
// Wraps the whole app (see layout.tsx). Listens to Firebase auth state,
// and syncs/creates the matching AppUser row in our own database so the
// rest of the app can just use appUser.id as the "userId" everywhere.

type AuthContextValue = {
  firebaseUser: FirebaseUser | null;
  appUser: AppUser | null;
  loading: boolean;
  refreshAppUser: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: null,
  appUser: null,
  loading: true,
  refreshAppUser: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const syncCurrentUser = useCallback(async (fbUser: FirebaseUser) => {
    try {
      const synced = await syncUser({
        firebaseUid: fbUser.uid,
        email: fbUser.email ?? "",
        displayName: fbUser.displayName ?? undefined,
        phone: fbUser.phoneNumber ?? undefined,
      });
      setAppUser(synced);
    } catch {
      setAppUser(null);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = watchAuthState(async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        await syncCurrentUser(fbUser);
      } else {
        setAppUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [syncCurrentUser]);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        appUser,
        loading,
        refreshAppUser: async () => {
          if (firebaseUser) await syncCurrentUser(firebaseUser);
        },
        signOut: async () => {
          await firebaseLogout();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// ---------------- Cart count context ----------------
// Small shared counter so the navbar badge updates whenever any page adds,
// removes, or changes cart items - pages just call refreshCart() after.

type CartContextValue = { count: number; refreshCart: () => Promise<void> };

const CartContext = createContext<CartContextValue>({ count: 0, refreshCart: async () => {} });

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { appUser } = useAuth();
  const [count, setCount] = useState(0);

  const refreshCart = useCallback(async () => {
    if (!appUser) {
      setCount(0);
      return;
    }
    try {
      const items = await getCart(appUser.id);
      setCount(items.reduce((sum, item) => sum + item.quantity, 0));
    } catch {
      setCount(0);
    }
  }, [appUser]);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  return <CartContext.Provider value={{ count, refreshCart }}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}

// ---------------- Layout pieces ----------------
// Navbar and Footer now live in ui.tsx, because they need wishlist state
// and this file must not import from ui.tsx (that would be a cycle).

export function Loading({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-gray-500">
      {label}
    </div>
  );
}

// ---------------- Image primitives ----------------

/**
 * <SafeImage> is the ONLY way images should be rendered in this app.
 *
 * It solves the three problems the old <img> tags had:
 *  - a missing/empty url rendered a broken-image icon
 *  - a url that 404s (deleted file, stale row) rendered a broken-image icon
 *  - images of different aspect ratios made the grid jump around
 *
 * It always reserves its box, shows a shimmer while loading, and falls
 * back to an inline placeholder on error. `fit` defaults to "cover"
 * (fills the box, used on cards) - pass "contain" where the whole
 * product must be visible and must not be cropped.
 */
export function SafeImage({
  src,
  alt,
  className = "",
  imgClassName = "",
  fit = "cover",
  sizes,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  imgClassName?: string;
  fit?: "cover" | "contain";
  sizes?: string;
}) {
  const resolved = resolveImageUrl(src);
  const [current, setCurrent] = useState(resolved);
  const [loaded, setLoaded] = useState(false);

  // Follow prop changes (gallery navigation, admin re-upload).
  useEffect(() => {
    setCurrent(resolveImageUrl(src));
    setLoaded(false);
  }, [src]);

  return (
    <div className={`relative overflow-hidden bg-brand-50 ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-brand-50 via-brand-100/60 to-brand-50" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current}
        alt={alt}
        sizes={sizes}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (current !== PLACEHOLDER_IMAGE) setCurrent(PLACEHOLDER_IMAGE);
          setLoaded(true);
        }}
        className={`w-full h-full transition-opacity duration-300 ${
          fit === "contain" ? "object-contain" : "object-cover"
        } ${loaded ? "opacity-100" : "opacity-0"} ${imgClassName}`}
      />
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-brand-100/70 ${className}`} />;
}

/** Card-shaped placeholder used while a product grid is loading. */
export function ProductCardSkeleton() {
  return (
    <div className="ns-card overflow-hidden">
      <Skeleton className="aspect-square rounded-none" />
      <div className="p-3.5 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

// ---------------- Catalog pieces ----------------
// ProductCard and CategoryCard live in ui.tsx for the same reason as
// Navbar/Footer: they render the wishlist heart.

// ---------------- Image upload widgets ----------------
// Shared by Admin > Add/Edit Product (multiple product images) and the
// customer-facing product customization panel (single design upload).
// Both use the existing public POST /api/upload endpoint via uploadFile()
// in api.ts - no separate storage system.

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_IMAGE_MB = 5;

function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return `"${file.name}" isn't a supported image type. Use PNG, JPG, JPEG or WEBP.`;
  }
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
    return `"${file.name}" is larger than ${MAX_IMAGE_MB}MB.`;
  }
  return null;
}

// Admin multi-image manager. Treats thumbnailUrl + images[] as one ordered
// gallery where position 0 is always the primary/main image - matches how
// the backend already models a product (a single thumbnailUrl plus an
// ordered images list), so no new API shape is needed.
export function MultiImageUploader({
  thumbnailUrl,
  images,
  onChange,
}: {
  thumbnailUrl: string;
  images: string[];
  onChange: (next: { thumbnailUrl: string; images: string[] }) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const all = [thumbnailUrl, ...images].filter(Boolean);

  function applyAll(nextAll: string[]) {
    const [first, ...rest] = nextAll;
    onChange({ thumbnailUrl: first ?? "", images: rest });
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");
    const valid: File[] = [];
    for (const file of Array.from(files)) {
      const problem = validateImageFile(file);
      if (problem) {
        setError(problem);
        continue;
      }
      valid.push(file);
    }
    if (valid.length === 0) return;

    setUploading(true);
    try {
      const uploaded = await Promise.all(valid.map((f) => uploadFile(f, "products")));
      applyAll([...all, ...uploaded]);
    } catch (e: any) {
      setError(e.message ?? "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleRemove(index: number) {
    applyAll(all.filter((_, i) => i !== index));
  }

  function handleSetPrimary(index: number) {
    if (index === 0) return;
    applyAll([all[index], ...all.filter((_, i) => i !== index)]);
  }

  function handleDrop(index: number) {
    if (dragIndex === null || dragIndex === index) return;
    const next = [...all];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    applyAll(next);
    setDragIndex(null);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-2">
        {all.map((url, i) => (
          <div
            key={`${url}-${i}`}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(i)}
            className={`relative w-24 h-24 rounded-lg overflow-hidden border-2 cursor-move group bg-gray-50 ${
              i === 0 ? "border-orange-600" : "border-gray-200"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveImageUrl(url)}
              alt={`Product image ${i + 1}`}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_IMAGE;
              }}
            />
            {i === 0 && (
              <span className="absolute top-1 left-1 bg-orange-700 text-white text-[10px] px-1.5 py-0.5 rounded">
                Main
              </span>
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-1">
              {i !== 0 && (
                <button
                  type="button"
                  onClick={() => handleSetPrimary(i)}
                  className="text-[10px] bg-white text-gray-900 rounded px-1.5 py-0.5"
                >
                  Set primary
                </button>
              )}
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="text-[10px] bg-red-600 text-white rounded px-1.5 py-0.5"
              >
                Remove
              </button>
            </div>
          </div>
        ))}

        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFiles(e.dataTransfer.files);
          }}
          className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 text-xs text-center cursor-pointer hover:border-orange-500 hover:text-orange-600 transition"
        >
          + Add Images
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      </div>

      {uploading && <p className="text-xs text-gray-500 mb-1">Uploading...</p>}
      {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
      {all.length > 0 && (
        <p className="text-xs text-gray-400">
          Drag to reorder · first image is the main image · hover an image to set primary or remove.
        </p>
      )}
    </div>
  );
}

// Customer-facing single design upload for customizable products. Kept
// deliberately simple (one image, no crop/position UI yet) but designed to
// be extended later with positioning/scaling/rotation/multiple design areas
// without changing this component's public props.
export function ProductDesignUpload({
  designUrl,
  onDesignChange,
}: {
  designUrl: string | null;
  onDesignChange: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    const problem = validateImageFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadFile(file, "designs");
      onDesignChange(url);
    } catch (e: any) {
      setError(e.message ?? "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {!designUrl ? (
        <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-300 rounded-lg py-8 px-4 text-center cursor-pointer hover:border-orange-500 transition">
          <span className="text-2xl" aria-hidden>
            ⬆️
          </span>
          <span className="text-sm font-medium text-gray-700">Upload Your Design</span>
          <span className="text-xs text-gray-400">PNG / JPG / JPEG / WEBP, up to {MAX_IMAGE_MB}MB</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
      ) : (
        <div className="flex items-center gap-3 border border-gray-200 rounded-lg p-3">
          <div className="w-16 h-16 rounded border border-gray-200 overflow-hidden bg-gray-50 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resolveImageUrl(designUrl)} alt="Your uploaded design" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-green-700">✓ Design uploaded</span>
            <div className="flex gap-3">
              <label className="text-sm text-orange-700 underline cursor-pointer">
                Change Image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </label>
              <button
                type="button"
                onClick={() => onDesignChange(null)}
                className="text-sm text-red-600 underline"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
      {uploading && <p className="text-xs text-gray-500 mt-2">Uploading...</p>}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}

// Overlays the customer's uploaded design centered on whatever product
// image container this is placed inside (parent needs position: relative).
// Extensible on purpose: later positioning/scaling/rotation controls can
// just change the inline style passed here instead of reworking callers.
export function DesignPreviewOverlay({
  designUrl,
  style,
}: {
  designUrl: string | null;
  style?: React.CSSProperties;
}) {
  if (!designUrl) return null;
  return (
    <div
      className="absolute w-24 h-24 border-2 border-white shadow-lg rounded overflow-hidden bg-white/80"
      style={style ?? { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={resolveImageUrl(designUrl)} alt="Your design preview" className="w-full h-full object-contain" />
    </div>
  );
}

export function SearchBar({
  defaultValue = "",
  onSearch,
}: {
  defaultValue?: string;
  onSearch: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(value);
      }}
      className="flex gap-2"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search products..."
        className="flex-1 border border-gray-300 rounded px-3 py-2"
      />
      <button type="submit" className="bg-orange-700 text-white px-4 py-2 rounded">
        Search
      </button>
    </form>
  );
}

export function StockBadge({ quantity }: { quantity: number }) {
  let label = "In Stock";
  let color = "text-green-600";
  if (quantity <= 0) {
    label = "Out of Stock";
    color = "text-red-600";
  } else if (quantity <= 5) {
    label = "Low Stock";
    color = "text-yellow-600";
  }
  return <span className={`text-sm font-medium ${color}`}>{label}</span>;
}

// ---------------- Cart / address pieces ----------------

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="inline-flex items-center border border-gray-300 rounded">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="px-2 py-1 text-gray-600 hover:bg-gray-100"
        aria-label="Decrease quantity"
      >
        −
      </button>
      <span className="px-3 text-sm font-medium min-w-[2rem] text-center">{value}</span>
      <button
        type="button"
        onClick={() => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1)}
        className="px-2 py-1 text-gray-600 hover:bg-gray-100"
        aria-label="Increase quantity"
        disabled={max !== undefined && value >= max}
      >
        +
      </button>
    </div>
  );
}

export function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  address: Address;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
}) {
  return (
    <div className={`border rounded-lg p-4 ${address.isDefault ? "border-orange-600 bg-orange-50" : "border-gray-200"}`}>
      <div className="flex justify-between items-start">
        <div>
          <div className="font-medium">
            {address.fullName}{" "}
            {address.isDefault && (
              <span className="text-xs bg-orange-700 text-white rounded px-2 py-0.5 ml-1">Default</span>
            )}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            {address.houseBuilding}, {address.street}
            {address.area ? `, ${address.area}` : ""}
            <br />
            {address.city}, {address.state} - {address.pincode}
            {address.landmark ? <><br />Landmark: {address.landmark}</> : null}
            <br />
            Phone: {address.phone}
          </div>
        </div>
      </div>
      <div className="flex gap-4 mt-3 text-sm">
        <button onClick={onEdit} className="text-orange-700 underline">
          Edit
        </button>
        <button onClick={onDelete} className="text-red-600 underline">
          Delete
        </button>
        {!address.isDefault && (
          <button onClick={onSetDefault} className="text-gray-600 underline">
            Set as default
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------- App shell ----------------
// The admin panel must not look like the storefront. Previously the root
// layout wrapped EVERY route in the customer Navbar, Footer and a
// max-w-6xl <main>, so /admin/* inherited customer branding and the
// dashboard was squeezed into a 1152px column.
//
// This splits the two chromes at one place. Admin routes render edge to
// edge with no customer navigation; everything else is unchanged.

export function AppShell({
  navbar,
  footer,
  children,
}: {
  navbar: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAdmin) {
    return (
      <main id="main-content" className="min-h-screen bg-slate-50">
        {children}
      </main>
    );
  }

  return (
    <>
      {navbar}
      <main id="main-content" className="mx-auto min-h-[70vh] max-w-6xl px-4 py-6">
        {children}
      </main>
      {footer}
    </>
  );
}

// ---------------- Admin session ----------------
// Separate from customer auth on purpose. Two things changed here:
//
// 1. The bearer token is now a REAL Firebase ID token fetched fresh from
//    the SDK, not the raw Firebase UID. The backend verifies it with the
//    Firebase Admin SDK, so knowing someone's UID is no longer enough to
//    impersonate them.
//
// 2. A non-secret marker cookie is set alongside it so middleware.ts can
//    redirect /admin/* BEFORE the admin HTML is ever rendered. The cookie
//    carries no privileges - every admin API call is re-authorised by
//    AdminAuthFilter against the ADMIN flag in PostgreSQL.

export const ADMIN_TOKEN_KEY = "namma_admin_token";
export const ADMIN_SESSION_COOKIE = "namma_admin_session";

/** Marker cookie read by middleware.ts. Contains no token and no secret. */
export function setAdminSessionCookie() {
  if (typeof document === "undefined") return;
  // Session cookie: cleared when the browser closes. SameSite=Lax blocks
  // it from riding along on cross-site requests.
  document.cookie = `${ADMIN_SESSION_COOKIE}=1; path=/; SameSite=Lax`;
}

export function clearAdminSessionCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${ADMIN_SESSION_COOKIE}=; path=/; Max-Age=0; SameSite=Lax`;
}

export function useAdminSession() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const signOutAdmin = useCallback(async () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    clearAdminSessionCookie();
    try {
      await firebaseLogout();
    } catch {
      // Already signed out - nothing to undo.
    }
    router.replace("/admin/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    // watchAuthState fires once Firebase has restored the persisted session,
    // which is why we cannot simply read auth.currentUser on mount.
    const unsubscribe = watchAuthState(async (user) => {
      if (cancelled) return;

      if (!user) {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        clearAdminSessionCookie();
        setToken(null);
        setChecked(true);
        router.replace("/admin/login");
        return;
      }

      try {
        // Fresh token on every mount: Firebase ID tokens expire after ~1 hour,
        // so caching one in localStorage would start failing mid-session.
        const idToken = await user.getIdToken();
        await adminVerify(idToken);
        if (cancelled) return;
        localStorage.setItem(ADMIN_TOKEN_KEY, idToken);
        setAdminSessionCookie();
        setToken(idToken);
      } catch {
        if (cancelled) return;
        // Signed into Firebase, but not an admin (403) or token rejected (401).
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        clearAdminSessionCookie();
        setToken(null);
        router.replace("/admin/login?error=not-admin");
      } finally {
        if (!cancelled) setChecked(true);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router]);

  function logoutAdmin() {
    void signOutAdmin();
  }

  return { token, checked, logoutAdmin };
}

// ---------------- Admin pieces ----------------

export function AdminSidebar() {
  const { logoutAdmin } = useAdminSession();
  const [open, setOpen] = useState(false);

  const links = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/products", label: "Products" },
    { href: "/admin/categories", label: "Categories" },
    { href: "/admin/banners", label: "Banners & Offers" },
    { href: "/admin/coupons", label: "Coupons" },
    { href: "/admin/orders", label: "Orders" },
    { href: "/admin/serviceability", label: "Delivery & Serviceability" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/customize", label: "Customize Catalog" },
  ];

  const nav = (
    <>
      <div className="mb-6 flex items-center gap-2 font-kannada text-lg font-semibold text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.jpeg"
          alt=""
          className="h-8 w-8 shrink-0 rounded-full bg-white object-contain p-0.5 ring-2 ring-brand-500"
        />
        ನಮ್ಮ Admin
      </div>

      <nav className="flex flex-1 flex-col gap-1" aria-label="Admin sections">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-2 text-sm font-medium text-brand-100/90 transition hover:bg-brand-800 hover:text-white"
          >
            {l.label}
          </Link>
        ))}
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="mt-2 rounded-lg px-3 py-2 text-sm text-brand-200 transition hover:bg-brand-800 hover:text-white"
        >
          ← Back to store
        </Link>
      </nav>

      <button
        onClick={logoutAdmin}
        className="rounded-lg px-3 py-2 text-left text-sm text-brand-200 transition hover:bg-brand-800 hover:text-white"
      >
        Log out
      </button>
    </>
  );

  return (
    <>
      {/* Mobile: a top bar with a slide-in drawer, because a fixed 224px
          sidebar squeezed the admin tables off-screen on phones. */}
      <div className="flex items-center justify-between bg-brand-900 px-4 py-3 md:hidden">
        <span className="font-kannada font-semibold text-white">ನಮ್ಮ Admin</span>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open admin menu"
          className="rounded-lg p-2 text-brand-100 transition hover:bg-brand-800"
        >
          ☰
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[70] bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-0 flex h-full w-64 max-w-[80vw] flex-col bg-brand-900 p-4 text-brand-100 shadow-xl"
          >
            {nav}
          </aside>
        </div>
      )}

      <aside className="hidden min-h-screen w-56 shrink-0 flex-col bg-brand-900 p-4 text-brand-100 md:flex">
        {nav}
      </aside>
    </>
  );
}

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="ns-card p-5">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-heading font-bold text-brand-800 mt-1">{value}</div>
    </div>
  );
}

export function AdminTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="ns-card overflow-x-auto">
      <table className="w-full border-collapse min-w-[640px]">
        <thead>
          <tr className="bg-brand-50/60 text-left">
            {headers.map((h) => (
              <th key={h} className="py-3 px-4 text-xs font-semibold uppercase tracking-wide text-brand-800">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-brand-50 hover:bg-brand-50/40 transition">
              {row.map((cell, j) => (
                <td key={j} className="py-3 px-4 text-sm">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
