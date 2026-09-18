// ===========================================================
// api.ts - every fetch call to the backend lives here.
// Change the backend URL, headers, or error handling in ONE
// place: this file.
//
// STAGE 1 additions:
//  - resolveImageUrl() / PLACEHOLDER_IMAGE for safe image handling
//  - product + category image management endpoints (upload,
//    delete, set primary, reorder) so images are managed from
//    the admin UI instead of pgAdmin
//  - cart summary + richer checkout payload (server-priced)
//  - profile update + profile photo upload
// ===========================================================

import type {
  Product,
  Category,
  CartItem,
  CartSummary,
  Order,
  AppUser,
  Address,
  CustomizableProduct,
  DashboardStats,
  CheckoutPayload,
  Coupon,
  CouponEvaluation,
  CouponPayload,
  WishlistStatus,
  Banner,
  BannerPayload,
  Serviceability,
  DeliveryState,
  DeliveryPincode,
} from "./types";

export const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/** Inline SVG used whenever an image is missing or fails to load. */
export const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
       <rect width="400" height="400" fill="#FDF6EC"/>
       <g fill="none" stroke="#E7C9A3" stroke-width="8" stroke-linecap="round">
         <rect x="118" y="132" width="164" height="128" rx="12"/>
         <path d="M140 232l40-44 32 34 26-24 32 34"/>
       </g>
       <circle cx="168" cy="172" r="12" fill="#E7C9A3"/>
       <text x="200" y="300" font-family="system-ui,sans-serif" font-size="20"
             fill="#B08968" text-anchor="middle">No image</text>
     </svg>`
  );

/**
 * Turns whatever the API gave us into something an <img> can load.
 * The backend already returns absolute URLs, but this keeps older
 * responses (and the customizable-product endpoints) working too.
 */
export function resolveImageUrl(url?: string | null): string {
  if (!url || typeof url !== "string" || !url.trim()) return PLACEHOLDER_IMAGE;
  const value = url.trim();
  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("//")
  ) {
    return value;
  }
  return `${BASE_URL}${value.startsWith("/") ? "" : "/"}${value}`;
}

/** First usable image for a product, with a graceful fallback. */
export function productImage(product?: Partial<Product> | null): string {
  if (!product) return PLACEHOLDER_IMAGE;
  if (product.thumbnailUrl) return resolveImageUrl(product.thumbnailUrl);
  if (product.images && product.images.length > 0) {
    return resolveImageUrl(product.images[0]);
  }
  return PLACEHOLDER_IMAGE;
}

/**
 * The signed-in customer's Firebase ID token, or null.
 *
 * The backend no longer trusts the userId in a URL or request body: every
 * customer-scoped endpoint (cart, orders, wishlist, addresses, profile)
 * resolves the caller from this token and refuses to serve someone else's
 * rows. So the token has to ride along on those calls.
 *
 * firebase.ts is imported DYNAMICALLY on purpose. It initialises the client
 * SDK at module load, and api.ts is also imported by server components
 * (app/page.tsx fetches the catalog on the server). A static import would
 * pull the browser SDK into the server bundle. On the server this returns
 * null, which is correct - server-side calls only hit public endpoints.
 */
async function currentIdToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const { getIdToken } = await import("./firebase");
    return await getIdToken();
  } catch {
    // Signed out, or Firebase not configured. Public endpoints still work.
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  // An explicit Authorization header always wins - that is how the admin
  // screens pass their own verified token.
  if (!headers.Authorization) {
    const token = await currentIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `API error ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      message = parsed.error || parsed.message || message;
    } catch {
      // not JSON - fall back to raw text set above
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.text();
  return (body ? JSON.parse(body) : undefined) as T;
}

/** Multipart variant: the browser must set its own boundary Content-Type. */
async function upload<T>(
  path: string,
  formData: FormData,
  options: { method?: string; idToken?: string } = {}
): Promise<T> {
  // Never set Content-Type by hand for FormData - the browser has to add
  // the multipart boundary itself.
  const token = options.idToken ?? (await currentIdToken());

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method || "POST",
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `Upload failed (${res.status})`;
    try {
      const parsed = JSON.parse(text);
      message = parsed.error || parsed.message || message;
    } catch {
      /* raw text */
    }
    throw new Error(message);
  }
  const body = await res.text();
  return (body ? JSON.parse(body) : undefined) as T;
}

function authHeaders(idToken: string) {
  return { Authorization: `Bearer ${idToken}` };
}

// ---------------- Public catalog ----------------

export const getProducts = (
  search?: string,
  sort?: string,
  categoryId?: number,
  featured?: boolean
) => {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (sort) params.set("sort", sort);
  if (categoryId != null) params.set("categoryId", String(categoryId));
  if (featured) params.set("featured", "true");
  const qs = params.toString();
  return request<Product[]>(`/api/products${qs ? `?${qs}` : ""}`);
};

export const getProduct = (id: number) => request<Product>(`/api/products/${id}`);

export const getRelatedProducts = (id: number, limit = 8) =>
  request<Product[]>(`/api/products/${id}/related?limit=${limit}`);

export const getProductsByCategory = (categoryId: number) =>
  request<Product[]>(`/api/products/category/${categoryId}`);

export const getCategories = (withCounts = false) =>
  request<Category[]>(`/api/categories${withCounts ? "?withCounts=true" : ""}`);

export const getCategory = (id: number) => request<Category>(`/api/categories/${id}`);

// ---------------- Auth / profile ----------------

export const syncUser = (payload: {
  firebaseUid: string;
  email: string;
  displayName?: string;
  phone?: string;
}) =>
  request<AppUser>("/api/auth/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getMe = (idToken: string) =>
  request<AppUser>("/api/auth/me", { headers: authHeaders(idToken) });

export const getUserProfile = (userId: number) =>
  request<AppUser>(`/api/users/${userId}`);

export const updateProfile = (
  userId: number,
  payload: { displayName?: string; phone?: string }
) =>
  request<AppUser>(`/api/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const uploadProfilePhoto = (userId: number, file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return upload<AppUser>(`/api/users/${userId}/photo`, formData);
};

export const deleteProfilePhoto = (userId: number) =>
  request<AppUser>(`/api/users/${userId}/photo`, { method: "DELETE" });

export const getAddresses = (userId: number) =>
  request<Address[]>(`/api/users/${userId}/addresses`);

export const addAddress = (userId: number, payload: Partial<Address>) =>
  request<Address>(`/api/users/${userId}/addresses`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateAddress = (
  userId: number,
  addressId: number,
  payload: Partial<Address>
) =>
  request<Address>(`/api/users/${userId}/addresses/${addressId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const deleteAddress = (userId: number, addressId: number) =>
  request<void>(`/api/users/${userId}/addresses/${addressId}`, { method: "DELETE" });

export const setDefaultAddress = (userId: number, addressId: number) =>
  request<Address>(`/api/users/${userId}/addresses/${addressId}/default`, {
    method: "PUT",
  });

// ---------------- Cart / checkout ----------------

export const getCart = (userId: number) => request<CartItem[]>(`/api/cart/${userId}`);

export const addToCart = (payload: Partial<CartItem>) =>
  request<CartItem>("/api/cart", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const removeFromCart = (itemId: number) =>
  request<void>(`/api/cart/${itemId}`, { method: "DELETE" });

export const updateCartQuantity = (itemId: number, quantity: number) =>
  request<CartItem>(`/api/cart/${itemId}?quantity=${quantity}`, { method: "PUT" });

export const clearCart = (userId: number) =>
  request<void>(`/api/cart/user/${userId}`, { method: "DELETE" });

/** Server-computed totals. The client must never add these up itself. */
export const getCartSummary = (userId: number, couponCode?: string) => {
  const qs = couponCode ? `?couponCode=${encodeURIComponent(couponCode)}` : "";
  return request<CartSummary>(`/api/cart/${userId}/summary${qs}`);
};

export const checkout = (payload: CheckoutPayload) =>
  request<Order>("/api/checkout", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getMyOrders = (userId: number) => request<Order[]>(`/api/orders/${userId}`);

export const getOrderDetail = (orderId: number) =>
  request<Order>(`/api/orders/detail/${orderId}`);

export const getOrderByNumber = (orderNumber: string) =>
  request<Order>(`/api/orders/number/${encodeURIComponent(orderNumber)}`);

export const cancelOrder = (
  orderId: number,
  payload?: { reason?: string; comments?: string }
) =>
  request<Order>(`/api/orders/${orderId}/cancel`, {
    method: "PUT",
    // The backend still re-checks that the order is cancellable and that it
    // belongs to the caller; this body only records WHY.
    body: JSON.stringify(payload ?? {}),
  });

/** Only allowed while the order is DELIVERED and inside the 10-day return window. */
export const requestReturn = (orderId: number, reason?: string) =>
  request<Order>(`/api/orders/${orderId}/return`, {
    method: "PUT",
    body: JSON.stringify({ reason: reason ?? null }),
  });

export const adminUpdateReturnStatus = (
  idToken: string,
  id: number,
  status: "APPROVED" | "REJECTED" | "COMPLETED"
) =>
  request<Order>(`/api/admin/orders/${id}/return-status?status=${status}`, {
    method: "PUT",
    headers: authHeaders(idToken),
  });

// ---------------- Wishlist ----------------

export const getWishlist = (userId: number) =>
  request<Product[]>(`/api/wishlist/${userId}`);

export const getWishlistCount = (userId: number) =>
  request<{ count: number }>(`/api/wishlist/${userId}/count`);

export const isWishlisted = (userId: number, productId: number) =>
  request<{ wishlisted: boolean }>(`/api/wishlist/${userId}/contains/${productId}`);

export const addToWishlist = (userId: number, productId: number) =>
  request<WishlistStatus>("/api/wishlist", {
    method: "POST",
    body: JSON.stringify({ userId, productId }),
  });

/** Adds if absent, removes if present. One round trip for the heart button. */
export const toggleWishlist = (userId: number, productId: number) =>
  request<WishlistStatus>("/api/wishlist/toggle", {
    method: "POST",
    body: JSON.stringify({ userId, productId }),
  });

export const removeFromWishlist = (userId: number, productId: number) =>
  request<WishlistStatus>(`/api/wishlist/${userId}/${productId}`, { method: "DELETE" });

// ---------------- Coupons ----------------

/**
 * Preview only. Validated against the user's live cart subtotal on the
 * server; the real discount is recomputed inside POST /api/checkout.
 */
export const validateCoupon = (code: string, userId: number) =>
  request<CouponEvaluation>(
    `/api/coupons/validate?code=${encodeURIComponent(code)}&userId=${userId}`
  );

// ---------------- Payments (Razorpay - wired in a later stage) ----------------

export const createPaymentOrder = (orderId: number) =>
  request<{ razorpayOrderId: string; amount: number; keyId: string; live: boolean }>(
    "/api/payments/create-order",
    { method: "POST", body: JSON.stringify({ orderId }) }
  );

export const verifyPayment = (payload: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) =>
  request<{ verified: boolean }>("/api/payments/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });

// ---------------- Generic upload ----------------

/**
 * Generic image upload. Returns an ABSOLUTE url built by the backend.
 * Prefer the dedicated product/category endpoints below when attaching
 * an image to a row - they upload AND link in a single call.
 */
export async function uploadFile(file: File, folder = "misc"): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);
  const data = await upload<{ url: string; path: string }>("/api/upload", formData);
  return data.url;
}

// ---------------- Customize ----------------

export const getCustomizableProducts = () =>
  request<CustomizableProduct[]>("/api/customize");

export const getCustomizableProduct = (slug: string) =>
  request<CustomizableProduct>(`/api/customize/${slug}`);

// ---------------- Admin ----------------

export const adminVerify = (idToken: string) =>
  request<{ admin: boolean }>("/api/admin/verify", { headers: authHeaders(idToken) });

export const adminGetDashboard = (idToken: string) =>
  request<DashboardStats>("/api/admin/dashboard", { headers: authHeaders(idToken) });

// ---- products ----

export const adminGetProducts = (idToken: string) =>
  request<Product[]>("/api/admin/products", { headers: authHeaders(idToken) });

export const adminCreateProduct = (
  idToken: string,
  payload: Partial<Product> & { categoryId?: number }
) =>
  request<Product>("/api/admin/products", {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminUpdateProduct = (
  idToken: string,
  id: number,
  payload: Partial<Product> & { categoryId?: number }
) =>
  request<Product>(`/api/admin/products/${id}`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminDeleteProduct = (idToken: string, id: number) =>
  request<void>(`/api/admin/products/${id}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

export const adminSetStock = (idToken: string, id: number, quantity: number) =>
  request<Product>(`/api/admin/products/${id}/stock?quantity=${quantity}`, {
    method: "PUT",
    headers: authHeaders(idToken),
  });

export const adminSetProductActive = (idToken: string, id: number, active: boolean) =>
  request<Product>(`/api/admin/products/${id}/active?active=${active}`, {
    method: "PUT",
    headers: authHeaders(idToken),
  });

// ---- product images (this is what replaces pgAdmin) ----

export const adminUploadProductImages = (
  idToken: string,
  productId: number,
  files: File[]
) => {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  return upload<Product>(`/api/admin/products/${productId}/images`, formData, {
    idToken,
  });
};

export const adminDeleteProductImage = (
  idToken: string,
  productId: number,
  url: string
) =>
  request<Product>(
    `/api/admin/products/${productId}/images?url=${encodeURIComponent(url)}`,
    { method: "DELETE", headers: authHeaders(idToken) }
  );

export const adminSetPrimaryImage = (idToken: string, productId: number, url: string) =>
  request<Product>(
    `/api/admin/products/${productId}/images/primary?url=${encodeURIComponent(url)}`,
    { method: "PUT", headers: authHeaders(idToken) }
  );

export const adminReorderProductImages = (
  idToken: string,
  productId: number,
  urls: string[]
) =>
  request<Product>(`/api/admin/products/${productId}/images/reorder`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(urls),
  });

export const adminUploadProductBackground = (
  idToken: string,
  productId: number,
  file: File
) => {
  const formData = new FormData();
  formData.append("file", file);
  return upload<Product>(`/api/admin/products/${productId}/background`, formData, {
    idToken,
  });
};

// ---- categories ----

export const adminGetCategories = (idToken: string) =>
  request<Category[]>("/api/admin/categories", { headers: authHeaders(idToken) });

export const adminCreateCategory = (idToken: string, payload: Partial<Category>) =>
  request<Category>("/api/admin/categories", {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminUpdateCategory = (
  idToken: string,
  id: number,
  payload: Partial<Category>
) =>
  request<Category>(`/api/admin/categories/${id}`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminDeleteCategory = (idToken: string, id: number) =>
  request<void>(`/api/admin/categories/${id}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

export const adminUploadCategoryImage = (
  idToken: string,
  categoryId: number,
  file: File
) => {
  const formData = new FormData();
  formData.append("file", file);
  return upload<Category>(`/api/admin/categories/${categoryId}/image`, formData, {
    idToken,
  });
};

export const adminDeleteCategoryImage = (idToken: string, categoryId: number) =>
  request<Category>(`/api/admin/categories/${categoryId}/image`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

// ---- orders ----

export const adminGetOrders = (idToken: string, status?: string) =>
  request<Order[]>(`/api/admin/orders${status ? `?status=${status}` : ""}`, {
    headers: authHeaders(idToken),
  });

export const adminGetOrder = (idToken: string, id: number) =>
  request<Order>(`/api/admin/orders/${id}`, { headers: authHeaders(idToken) });

export const adminGetOrderStatuses = (idToken: string) =>
  request<string[]>("/api/admin/order-statuses", { headers: authHeaders(idToken) });

export const adminUpdateOrderStatus = (idToken: string, id: number, status: string) =>
  request<Order>(`/api/admin/orders/${id}/status?status=${status}`, {
    method: "PUT",
    headers: authHeaders(idToken),
  });

// ---- users ----

export const adminGetUsers = (idToken: string) =>
  request<AppUser[]>("/api/admin/users", { headers: authHeaders(idToken) });

export const adminSetUserRole = (idToken: string, id: number, admin: boolean) =>
  request<AppUser>(`/api/admin/users/${id}/role?admin=${admin}`, {
    method: "PUT",
    headers: authHeaders(idToken),
  });

// ---- customizable catalog ----

export const adminGetCustomizable = (idToken: string) =>
  request<CustomizableProduct[]>("/api/admin/customize", {
    headers: authHeaders(idToken),
  });

export const adminCreateCustomizable = (
  idToken: string,
  payload: Partial<CustomizableProduct>
) =>
  request<CustomizableProduct>("/api/admin/customize", {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminUpdateCustomizable = (
  idToken: string,
  id: number,
  payload: Partial<CustomizableProduct>
) =>
  request<CustomizableProduct>(`/api/admin/customize/${id}`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminDeleteCustomizable = (idToken: string, id: number) =>
  request<void>(`/api/admin/customize/${id}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

// ---- coupons ----

export const adminGetCoupons = (idToken: string) =>
  request<Coupon[]>("/api/admin/coupons", { headers: authHeaders(idToken) });

export const adminCreateCoupon = (idToken: string, payload: CouponPayload) =>
  request<Coupon>("/api/admin/coupons", {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminUpdateCoupon = (idToken: string, id: number, payload: CouponPayload) =>
  request<Coupon>(`/api/admin/coupons/${id}`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminSetCouponActive = (idToken: string, id: number, active: boolean) =>
  request<Coupon>(`/api/admin/coupons/${id}/active?active=${active}`, {
    method: "PUT",
    headers: authHeaders(idToken),
  });

export const adminDeleteCoupon = (idToken: string, id: number) =>
  request<void>(`/api/admin/coupons/${id}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

/* ===========================================================
   BANNERS
   -----------------------------------------------------------
   Public: only banners that are switched on AND inside their
   start/end window. The backend decides that, not the browser,
   so a scheduled campaign cannot be revealed early by changing
   the clock on your laptop.

   Admin: full CRUD. Every /api/admin/** call carries a real
   Firebase ID token and is re-authorised server-side.
   =========================================================== */

/** Live banners for the homepage hero. An empty array is normal. */
export const getActiveBanners = () => request<Banner[]>("/api/banners/active");

export const adminGetBanners = (idToken: string) =>
  request<Banner[]>("/api/admin/banners", { headers: authHeaders(idToken) });

export const adminCreateBanner = (idToken: string, payload: BannerPayload) =>
  request<Banner>("/api/admin/banners", {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminUpdateBanner = (idToken: string, id: number, payload: BannerPayload) =>
  request<Banner>(`/api/admin/banners/${id}`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminDeleteBanner = (idToken: string, id: number) =>
  request<void>(`/api/admin/banners/${id}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

export const adminSetBannerActive = (idToken: string, id: number, value: boolean) =>
  request<Banner>(`/api/admin/banners/${id}/active?value=${value}`, {
    method: "PUT",
    headers: authHeaders(idToken),
  });

/**
 * Uploads one image straight onto an existing banner.
 * slot: "primary" | "mobile" | "gallery".
 */
export const adminUploadBannerImage = (
  idToken: string,
  id: number,
  file: File,
  slot: "primary" | "mobile" | "gallery" = "primary"
) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("slot", slot);
  return upload<Banner>(`/api/admin/banners/${id}/image`, formData, { idToken });
};

export const adminDeleteBannerImage = (idToken: string, id: number, url: string) =>
  request<Banner>(`/api/admin/banners/${id}/image?url=${encodeURIComponent(url)}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

export const adminReorderBanners = (idToken: string, ids: number[]) =>
  request<{ updated: number }>("/api/admin/banners/reorder", {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify({ ids }),
  });

/* ===========================================================
   SERVICEABILITY
   The backend owns the answer. The frontend must never infer a
   state from a pincode prefix or decide a delivery charge.
   =========================================================== */

export const checkServiceability = (pincode: string) =>
  request<Serviceability>(`/api/serviceability?pincode=${encodeURIComponent(pincode)}`);

export const adminGetDeliveryStates = (idToken: string) =>
  request<DeliveryState[]>("/api/admin/serviceability/states", {
    headers: authHeaders(idToken),
  });

export const adminCreateDeliveryState = (
  idToken: string,
  payload: Partial<DeliveryState>
) =>
  request<DeliveryState>("/api/admin/serviceability/states", {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminUpdateDeliveryState = (
  idToken: string,
  id: number,
  payload: Partial<DeliveryState>
) =>
  request<DeliveryState>(`/api/admin/serviceability/states/${id}`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminDeleteDeliveryState = (idToken: string, id: number) =>
  request<void>(`/api/admin/serviceability/states/${id}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

export const adminGetDeliveryPincodes = (idToken: string, search?: string) =>
  request<DeliveryPincode[]>(
    `/api/admin/serviceability/pincodes${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    { headers: authHeaders(idToken) }
  );

export const adminCreateDeliveryPincode = (
  idToken: string,
  payload: { pincode: string; stateId?: number; city?: string; deliveryCharge?: number; estimatedMinDays?: number; estimatedMaxDays?: number; active?: boolean }
) =>
  request<DeliveryPincode>("/api/admin/serviceability/pincodes", {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminUpdateDeliveryPincode = (
  idToken: string,
  id: number,
  payload: Record<string, unknown>
) =>
  request<DeliveryPincode>(`/api/admin/serviceability/pincodes/${id}`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminDeleteDeliveryPincode = (idToken: string, id: number) =>
  request<void>(`/api/admin/serviceability/pincodes/${id}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });
