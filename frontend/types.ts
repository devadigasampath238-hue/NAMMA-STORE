// ===========================================================
// types.ts - all shared TypeScript interfaces live here.
//
// STAGE 1: these now mirror the backend DTOs in Dtos.java
// exactly (ProductDto / CategoryDto / OrderDto / AppUserDto),
// not the JPA entities. Fields the backend computes for you -
// effectivePrice, discountPercent, stockStatus, itemCount -
// are included so pages stop recalculating them.
// ===========================================================

export interface Category {
  id: number;
  name: string;
  slug?: string;
  description?: string;
  /** Absolute, browser-ready URL. Null/undefined when there is no image. */
  imageUrl?: string | null;
  active: boolean;
  /** Only present on endpoints that ask for counts. */
  productCount?: number | null;
}

export interface Product {
  id: number;
  name: string;
  description?: string;

  price: number;
  salePrice?: number | null;
  /** salePrice when on sale, otherwise price. What the customer pays. */
  effectivePrice: number;
  /** 0 when there is no sale. */
  discountPercent: number;
  onSale: boolean;

  sku?: string;
  brand?: string;
  /** Mug, T-Shirt, Hoodie, Bottle, Cap, Gift, etc. - distinct from Category. */
  productType?: string;

  /** Absolute URL of the primary image; equals images[0] when images is non-empty. */
  thumbnailUrl?: string | null;
  backgroundImageUrl?: string | null;
  /** Ordered gallery, absolute URLs, primary first. Always an array. */
  images: string[];

  stockQuantity: number;
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
  inStock: boolean;

  featured: boolean;
  active: boolean;
  customizable: boolean;

  categoryId?: number | null;
  categoryName?: string | null;
  category?: Category | null;

  variants: string[];
  createdAt?: string;
}

export interface CartItem {
  id: number;
  userId: number;
  productId?: number;
  customizableProductId?: number;
  quantity: number;
  customText?: string;
  customImageUrl?: string;
  selectedColor?: string;
  selectedSize?: string;
  printPosition?: string;
}

/** Server-computed cart totals. Never recalculate these on the client. */
export interface CartSummary {
  subtotal: number;
  discountAmount: number;
  deliveryCharge: number;
  totalAmount: number;
  couponCode?: string | null;
  couponApplied: boolean;
  couponMessage?: string | null;
  itemCount: number;
}

export interface OrderItem {
  id: number;
  productId?: number | null;
  customizableProductId?: number | null;
  productName: string;
  /** Absolute URL captured at order time; falls back to the live product. */
  productImageUrl?: string | null;
  quantity: number;
  unitPrice: number;
  finalPrice: number;
  customText?: string;
  customImageUrl?: string | null;
  selectedColor?: string;
  selectedSize?: string;
  printPosition?: string;
}

export type OrderStatus =
  | "PLACED"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

export type PaymentMethod = "COD" | "UPI" | "CARD" | "NETBANKING";

export type ReturnStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "COMPLETED";

export interface Order {
  id: number;
  /** Customer-facing reference, e.g. "NS100042". */
  orderNumber?: string | null;

  userId?: number | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;

  subtotal: number;
  discountAmount: number;
  deliveryCharge: number;
  totalAmount: number;

  couponCode?: string | null;
  paymentMethod?: PaymentMethod | null;
  paymentStatus?: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | null;
  status: OrderStatus | string;

  /** When the order first became DELIVERED - anchors the return window. */
  deliveredAt?: string | null;
  returnStatus?: ReturnStatus | null;
  returnRequestedAt?: string | null;
  returnReason?: string | null;
  /** Why the customer cancelled, recorded server-side. */
  cancellationReason?: string | null;
  cancellationComments?: string | null;
  cancelledAt?: string | null;
  /** True only while DELIVERED, no return requested yet, and the window hasn't closed. */
  returnEligible?: boolean;
  /** deliveredAt + 10 days, sent by the server so the frontend never hard-codes the window length. */
  returnWindowEndsAt?: string | null;

  shippingAddressSnapshot?: string | null;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;

  items: OrderItem[];
  itemCount?: number;
  createdAt: string;
}

export interface AppUser {
  id: number;
  firebaseUid: string;
  email: string;
  displayName?: string;
  phone?: string;
  /** Absolute URL or null. */
  photoUrl?: string | null;
  admin: boolean;
  createdAt?: string;
}

export interface Address {
  id: number;
  fullName: string;
  phone: string;
  houseBuilding: string;
  street: string;
  area?: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
  isDefault: boolean;
}

export interface CustomizableProduct {
  id: number;
  name: string;
  slug: string;
  basePrice: number;
  imageUrl?: string;
  categoryId?: number;
  minQuantity: number;
  maxQuantity: number;
  stock: number;
  active: boolean;
  enabledOptions?: string; // comma separated: TEXT,IMAGE,COLOR,SIZE,PRINT_POSITION
  availableColors?: string; // comma separated, e.g. "Red,Blue,Black"
  availableSizes?: string; // comma separated, e.g. "S,M,L,XL"
}

export interface DashboardStats {
  totalProducts: number;
  totalCategories: number;
  totalOrders: number;
  totalUsers: number;
  outOfStockProducts: number;
  lowStockProducts: number;
  pendingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  revenue: number;
  recentOrders: Order[];
}

/** Payload accepted by POST /api/checkout. The client never sends a total. */
export interface CheckoutPayload {
  userId: number;
  shippingAddressSnapshot?: string;
  couponCode?: string;
  paymentMethod?: PaymentMethod;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

/* ---------------- Stage 2: coupons ---------------- */

export type CouponType = "PERCENT" | "FIXED";

export interface Coupon {
  id: number;
  code: string;
  description?: string | null;
  discountType: CouponType;
  discountValue: number;
  minOrderValue: number;
  maxDiscount?: number | null;
  /** ISO yyyy-MM-dd, or null when it never expires. */
  expiryDate?: string | null;
  usageLimit?: number | null;
  usedCount: number;
  active: boolean;
  /** Computed by the backend: false once expired or exhausted. */
  usable: boolean;
  statusLabel: "ACTIVE" | "INACTIVE" | "EXPIRED" | "EXHAUSTED";
  /** Ready-to-render, e.g. "10% off up to Rs.150". */
  summary: string;
}

/** Result of POST-validating a coupon. PREVIEW ONLY - checkout recomputes. */
export interface CouponEvaluation {
  valid: boolean;
  discount: number;
  code?: string | null;
  message?: string | null;
  coupon?: Coupon | null;
}

export interface CouponPayload {
  code: string;
  description?: string;
  discountType: CouponType;
  discountValue: number;
  minOrderValue?: number;
  maxDiscount?: number | null;
  expiryDate?: string | null;
  usageLimit?: number | null;
  active?: boolean;
}

/* ---------------- Stage 2: wishlist ---------------- */

/** Response shape of every mutating wishlist endpoint. */
export interface WishlistStatus {
  productId: number;
  wishlisted: boolean;
  count: number;
  message: string;
}

/* ===========================================================
   BANNERS
   Admin-managed festival / seasonal hero campaigns.
   Nothing about a specific festival is typed in here - a
   banner is just scheduled content, so Deepavali, Ugadi and
   anything invented next year all use this same shape.
   =========================================================== */

export type Banner = {
  id: number;
  title: string;
  subtitle?: string | null;
  /** Absolute URL, already resolved by the backend. */
  imageUrl?: string | null;
  /** Optional narrower crop for phones; falls back to imageUrl. */
  mobileImageUrl?: string | null;
  images: string[];
  ctaText?: string | null;
  ctaUrl?: string | null;
  accentColor?: string | null;
  /** ISO-8601, or null for "no limit". */
  startDate?: string | null;
  endDate?: string | null;
  displayOrder: number;
  /** The admin's on/off switch. */
  active: boolean;
  /** active AND inside the scheduling window - computed by the backend. */
  live: boolean;
};

export type BannerPayload = {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  mobileImageUrl?: string;
  images?: string[];
  ctaText?: string;
  ctaUrl?: string;
  accentColor?: string;
  startDate?: string | null;
  endDate?: string | null;
  displayOrder?: number;
  active?: boolean;
};

/* ===========================================================
   DELIVERY SERVICEABILITY
   All values come from admin configuration - the frontend
   never guesses which state a pincode belongs to.
   =========================================================== */

export type Serviceability = {
  serviceable: boolean;
  pincode: string;
  state?: string | null;
  city?: string | null;
  deliveryCharge?: number | null;
  estimatedMinDays?: number | null;
  estimatedMaxDays?: number | null;
  message: string;
  /** False when no delivery areas have been configured yet. */
  configured: boolean;
};

export type DeliveryState = {
  id: number;
  name: string;
  deliveryCharge?: number | null;
  estimatedMinDays?: number | null;
  estimatedMaxDays?: number | null;
  pincodeRangeStart?: string | null;
  pincodeRangeEnd?: string | null;
  active: boolean;
};

export type DeliveryPincode = {
  id: number;
  pincode: string;
  state?: DeliveryState | null;
  city?: string | null;
  deliveryCharge?: number | null;
  estimatedMinDays?: number | null;
  estimatedMaxDays?: number | null;
  active: boolean;
};
