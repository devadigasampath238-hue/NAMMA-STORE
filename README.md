# Namma Store

A full-stack Indian e-commerce platform.

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend:** Java 21 + Spring Boot 3.3 + PostgreSQL
- **Auth:** Firebase (client) — see the security note below
- **Payments:** simulated for now, structured for Razorpay later

---

## 1. Run it

### Database (one time)

```bash
createdb namma_store_dev            # if it does not exist yet
```

Start the backend **once** so Hibernate creates the tables, then run the migrations
in order. They are idempotent and delete nothing:

```bash
psql -U postgres -d namma_store_dev -f database/001_align_product_schema.sql
psql -U postgres -d namma_store_dev -f database/002_stage1_orders_and_images.sql
psql -U postgres -d namma_store_dev -f database/003_stage2_wishlist_and_coupons.sql
```

That is the **only** SQL you should ever need to run. Products, categories,
coupons, images, wishlist and orders are all managed from the admin dashboard.

### Backend

```bash
cd backend
cp .env.example .env          # edit DB_PASSWORD etc.
export $(grep -v '^#' .env | xargs)
mvn clean spring-boot:run     # http://localhost:8080
```

### Frontend

```bash
cd frontend
cp .env.local.example .env.local   # fill in your Firebase web config
npm install
npm run dev                        # http://localhost:3000
```

### Environment variables

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `DB_URL` | backend | `jdbc:postgresql://localhost:5432/namma_store_dev` | JDBC URL |
| `DB_USERNAME` / `DB_PASSWORD` | backend | `postgres` / `postgres` | DB credentials |
| `APP_PUBLIC_BASE_URL` | backend | `http://localhost:8080` | Used to build absolute image URLs |
| `APP_CORS_ORIGIN` | backend | `http://localhost:3000` | Origin allowed to call the API |
| `APP_DELIVERY_CHARGE` | backend | `49` | Flat delivery fee |
| `APP_FREE_DELIVERY_ABOVE` | backend | `499` | Free-delivery threshold |
| `STORAGE_*` | backend | blank | Leave blank for local `./uploads`; fill in for Cloudflare R2 / S3 |
| `RAZORPAY_*` | backend | blank | Not used yet |
| `NEXT_PUBLIC_API_URL` | frontend | `http://localhost:8080` | Backend origin |
| `NEXT_PUBLIC_FIREBASE_*` | frontend | — | Firebase web config |

No secrets are committed. `frontend/.env.local` was **removed** from this zip —
recreate it from `.env.local.example` (your original values are in the zip you
first sent me).

### Making yourself an admin

Admin status is a flag on your user row. Register through the UI first so the
row exists, then promote yourself **once**:

```sql
UPDATE app_users SET admin = TRUE WHERE email = 'you@example.com';
```

After that, `/admin/users` lets you grant or revoke admin from the dashboard —
no more SQL. Log in at `/admin/login` using your Firebase UID.

---

## 2. Authentication — please read

`FirebaseAuthService.verifyTokenAndGetUid()` in `Auth.java` **verifies nothing**.
It takes whatever string is in the `Authorization` header and trusts it as a
Firebase UID.

What that means concretely:

- Anyone who knows or guesses an admin's Firebase UID can send
  `Authorization: Bearer <that-uid>` and get full access to `/api/admin/**`.
- Order, wishlist, address and profile endpoints identify the user by a **path
  parameter**, so any signed-in user can read another user's data by changing
  the id in the URL.

This was preserved deliberately — replacing it changes the login flow — and it is
documented in the source. **Do not deploy this to the internet as-is.** The steps
to make it real are written out in `Auth.java`.

---

## 3. What changed in Stage 2

### Backend — new files

| File | Purpose |
|---|---|
| `Wishlist.java` | Entity, repository, service, controller. Duplicates prevented by a DB unique constraint *and* a friendly service check. Deleting a product purges its wishlist rows. |
| `Coupons.java` | Coupon entity upgraded (type, min order, cap, expiry, usage limit), `CouponService` as the single source of truth for discounts, public `/validate` preview, full admin CRUD. |
| `database/003_stage2_wishlist_and_coupons.sql` | Wishlist table + coupon columns, backfilled from the legacy percentage-only columns. Adds two starter coupons only if the table is empty. |

### Backend — edited

- `Orders.java` — coupon entity moved out; `applyCoupon()` now delegates to
  `CouponService`; redemptions are counted inside the checkout transaction.
- `Admin.java` — the old minimal coupon endpoints removed (superseded by
  `AdminCouponController`).
- `Products.java` — product deletion purges wishlist rows.

### Frontend — new files

| File | Purpose |
|---|---|
| `ui.tsx` | Toasts, wishlist context, icons, empty/error states, skeletons, product gallery, order timeline, modal, success animation, confetti, Navbar, Footer, product/category cards. |
| `app/wishlist/page.tsx` | Wishlist page with move-to-cart and an empty state. |
| `globals.d.ts` | CSS module declarations so `tsc --noEmit` is clean. |

### Frontend — rebuilt

`globals.css` (design system + **logo watermark**), `layout.tsx` (providers, skip
link), home, products (filters + sort), categories, category detail, product
detail (gallery, tabs, PIN check, related), cart (server totals), checkout
(4 steps + dummy payment + animated success), account (profile / orders /
addresses), admin dashboard (real-data charts), admin coupons (full CRUD),
admin categories, admin orders, admin products.

### The logo watermark

`body::before` in `globals.css` paints `/logo.jpeg` fixed and centred. The
opacity (`0.035`) lives **only** on that pseudo-element, never on `body` or any
content wrapper, so text keeps full contrast. `background-size: <n>px auto`
means it is never cropped or stretched, and it scales down at 1024px and 640px.
`mix-blend-mode: multiply` matters — the asset is a JPEG with a solid light
background, and without blending you would see a faint rectangle instead of just
the mark.

### Animations

Plain CSS keyframes in `globals.css`. **`framer-motion` is not a dependency of
this project and there was no network access to add one**, so entrance fades,
the heart pop, the cart bump, the success tick, the confetti and the skeleton
shimmer are all CSS. `prefers-reduced-motion: reduce` is honoured globally.
Toasts are a small in-project provider for the same reason (`react-hot-toast`
is not installed). Icons are inline SVG; charts are inline SVG.

---

## 4. Verification — what I did and did not check

**Verified:**
- `npx tsc --noEmit` → **zero errors** across the whole frontend.
- Java: brace/paren structural validation, resolution of every bean call,
  accessor and repository method against its declaration, duplicate-type scan,
  request-mapping collision review.

**Not verified:**
- `mvn compile` — this environment has a JRE but no `javac` and no Maven.
- `next build` — it needs to download the `@next/swc-linux-x64-gnu` native
  binary and the network is blocked (HTTP 403).

Please run both locally before relying on this. Type-checking is strong evidence
the frontend is sound, but it is not the same as a production build.

---

## 5. Testing checklist

**Auth** — register, login, logout, account loads.

**Products** — listing; search by name/brand/category; each sort option; category,
price, discount and availability filters; filters drawer on mobile.

**Product detail** — gallery thumbnails, prev/next, `1 / n` counter, arrow keys,
mobile swipe, Zoom lightbox (Esc closes); quantity; Add to Cart; Buy Now;
wishlist heart; description/specification tabs; related products.

**Images** — delete a file from `backend/uploads/` and reload: you get the inline
placeholder, not a broken-image icon. Product images are never distorted
(`object-contain` on detail, `object-cover` in fixed-ratio card boxes).

**Wishlist** — heart on a card and on detail; navbar badge; `/wishlist` page;
Move to Cart; Remove; refresh the page and the state persists; double-click the
heart rapidly and the count stays correct.

**Coupons (admin)** — create percentage and fixed coupons; edit; enable/disable;
delete; set a minimum order, a cap, an expiry and a usage limit.

**Coupons (checkout)** — apply a valid code (`NAMMA10`, `FLAT100` ship with the
migration); an invalid code; an expired one; one below its minimum order; check
the cap applies; remove the coupon and watch the total recalculate.

**Checkout** — all four steps; address validation errors; COD confirm; UPI ID +
placeholder QR; card number/name/expiry/CVV validation; net banking bank list;
"Processing payment…" then the animated success screen.

**Order** — confirm the row exists before success is shown:

```sql
SELECT id, order_number, subtotal, discount_amount, delivery_charge,
       total_amount, payment_method, status FROM orders ORDER BY id DESC LIMIT 1;
```

**Order history** — `/account?tab=orders`, status timeline, full price breakdown,
cancel an order that has not shipped.

**Profile** — edit name and phone; upload, replace and remove a profile photo.

**Admin** — dashboard stats and both charts; product CRUD + multi-image upload,
set primary, delete image; category CRUD + image; coupon CRUD; order status
updates; user role changes.

**Responsive** — 1920 / 1440 / 1280 / 1024 / 768 / 480 / 390 / 360. No horizontal
scrolling (`overflow-x: hidden` on `html, body`; wide admin tables scroll inside
their own container).

**Accessibility** — Tab through the site; the skip link appears first; focus
rings are visible; the account dropdown and lightbox close on Escape; badges
carry aria-labels.

---

## 6. Known gaps

- **Ratings and reviews** are referenced in the brief but have no backend
  support, so no rating UI was invented.
- **PIN serviceability** on the product page validates the format and shows the
  standard estimate. There is no serviceability endpoint, so nothing more is
  claimed.
- **"Trending" and "Best Sellers"** have no analytics behind them. Trending
  shows in-stock products and there is no separate Best Sellers section, rather
  than inventing a popularity ranking.
- `_scaffold_unused_namma-store/` is the empty duplicate scaffold from your
  original zip. It is not part of the build; kept rather than deleted.

See `STAGE_1.md` for the Stage 1 backend changes (DTOs, image storage, order model).

---

# Update — September 2026

Four things changed. Everything else in this README still applies.

## 1. Admin authentication is now real

**Before:** `FirebaseAuthService.verifyTokenAndGetUid()` returned the
`Authorization` header verbatim. The frontend sent the raw Firebase **UID** as
the bearer token, and the backend trusted it. Anyone who learned an admin's UID
could send `Authorization: Bearer <uid>` and get full admin access to every
`/api/admin/**` endpoint.

**Now:** the frontend sends a real Firebase **ID token**
(`user.getIdToken()`), and the backend verifies it with
`FirebaseAuth.verifyIdToken()` before looking up the `admin` flag in
PostgreSQL.

**This means the backend now needs a service account.**

```bash
# Firebase console → Project settings → Service accounts → Generate new private key
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccount.json
```

Keep that JSON **outside** the repository. Without it the backend still starts,
but every `/api/admin/**` call returns `401` and nobody can log into the admin
panel. Startup logs tell you which mode you are in:

```
Firebase Admin initialised - ID tokens will be verified.     ← good
Firebase Admin NOT initialised (...)                          ← set the env var
```

There is a local-only escape hatch, `APP_AUTH_ALLOW_INSECURE_UID_FALLBACK=true`,
which restores the old trust-the-client behaviour so you can work without
credentials. It logs a warning on every request. Do not enable it anywhere
reachable from the internet.

### Making an account an admin

```sql
-- 1. Register/sign in once as a normal customer so the row exists.
-- 2. Then:
UPDATE app_users SET admin = true WHERE email = 'you@example.com';
```

## 2. `/admin/*` is blocked before it renders

`frontend/middleware.ts` redirects any `/admin/*` request without an admin
session cookie to `/admin/login?next=...`, at the edge, before admin HTML is
generated. Previously the only guard was a `useEffect` inside a client
component, so the panel painted for a moment before redirecting — and did not
redirect at all with JavaScript disabled.

Layered, from outside in:

| Layer | File | Stops |
|---|---|---|
| Edge redirect | `frontend/middleware.ts` | The admin page being rendered or sent |
| Session check | `useAdminSession()` in `components.tsx` | A stale/non-admin session using the UI |
| **API authorisation** | `AdminAuthFilter` in `Admin.java` | **Everything that matters** |

The cookie carries no privileges. Forging it gets you an empty shell whose every
request comes back `401`/`403`.

Verify it yourself:

```
incognito → http://localhost:3000/admin/products   → /admin/login
sign in as a customer → /admin/products            → /admin/login?error=not-admin
sign in as an admin   → /admin/products            → works
```

## 3. Festival / seasonal banners (new)

Admin-managed hero campaigns at **`/admin/banners`**. Create a banner with a
title, subtitle, artwork, CTA text/link, accent colour, display order and an
optional start/end window.

The homepage carousel (`frontend/hero.tsx`) shows only banners that are both
switched on **and** inside their date window — decided by the backend, so a
scheduled campaign cannot be revealed early by changing the clock on the client.
With no live banners the carousel renders nothing and the original static hero
takes over.

No festival is hard-coded anywhere. Deepavali, Dasara, Ugadi, Sankranti,
Republic Day and anything invented in five years are all just rows.

```
GET    /api/banners/active           public
GET    /api/admin/banners            admin
POST   /api/admin/banners
PUT    /api/admin/banners/{id}
DELETE /api/admin/banners/{id}
PUT    /api/admin/banners/{id}/active?value=true|false
POST   /api/admin/banners/{id}/image     multipart, slot=primary|mobile|gallery
DELETE /api/admin/banners/{id}/image?url=...
PUT    /api/admin/banners/reorder
```

Schema: `database/005_banners.sql`. Optional — `ddl-auto=update` creates the
tables on the next start.

## 4. Watermark is visible again

`--ns-watermark-opacity` went from `0.035` to `0.1` (`0.075` on phones) in
`app/globals.css`. It sits on `body::before` only, so body-text contrast is
untouched.

## Commands

```bash
# frontend
cd frontend && npm install && npm run dev      # http://localhost:3000

# backend
cd backend && mvn spring-boot:run              # http://localhost:8080
# (no Maven wrapper is committed - use a local Maven 3.9+ and JDK 21)
```

Admin login: **http://localhost:3000/admin/login**

---

# Update 2 — September 2026

## Critical bug #1: images — root cause found and fixed

The image pipeline was never the problem. `StorageService` stored correct
relative paths, `DtoMapper` returned correct absolute URLs, and
`resolveImageUrl()` in `api.ts` already handled absolute/relative/null/blank.

The bug was one line of static-resource config in `NammaStoreApplication.java`:

```java
String location = Path.of(localDir).toAbsolutePath().toUri().toString();
```

`Path.toUri()` stats the filesystem and **only appends a trailing `/` when the
directory already exists**. On a fresh checkout `./uploads` does not exist at
startup, so the location resolved as `file:/app/uploads` with no slash, and
Spring joined `/uploads/products/x.jpg` onto it as
`file:/app/uploadsproducts/x.jpg` → **404**.

So: upload succeeded, database row was right, API response was right, and the
browser got a 404 for every image — which `SafeImage` correctly rendered as the
"No image" placeholder. The resource mapping is built once at startup, so it
stayed broken for the life of the process even after the first upload created
the folder.

Fixed by creating the directory before mapping it and forcing the trailing
slash. Startup now logs `Serving /uploads/** from file:/.../uploads/` so you can
confirm it.

**Verify:** upload a product image, then open the URL from the API response
directly in a browser. It should return the image, not a 404.

## Critical security: IDOR holes closed

Customer-scoped endpoints identified the caller **purely by a path parameter**,
with no token required and no ownership check:

```
GET /api/orders/42            → anyone's order history
GET /api/users/42/addresses   → anyone's home address and phone
PUT /api/orders/99/cancel     → cancel a stranger's order
GET /api/wishlist/42          → anyone's wishlist
```

Changing a number in the URL was enough. New `CurrentUserService` (in
`Auth.java`) resolves the caller from a **verified Firebase ID token** and
compares it to the row being touched. Enforced on every cart, order, wishlist,
address and profile endpoint, plus `/api/checkout` — which previously let the
request body decide whose cart was charged.

`api.ts` now attaches the signed-in customer's ID token to every request
automatically (dynamic import of `firebase.ts`, so the browser SDK stays out of
the server bundle).

`401` means "not signed in", `403` means "not yours". Both return a plain JSON
message, never a stack trace.

## Order total showing ₹0 (feature #37)

Orders written before the money columns existed have `NULL` subtotal/total,
which serialised as `null` and rendered as ₹0 next to real line items. The DTO
now derives them from the order's **own line items** when the column is NULL —
the stored value is still authoritative, and nothing is recalculated from
client input. `database/006_security_and_cancellation.sql` repairs the rows
permanently.

## Cancellation reasons

`PUT /api/orders/{id}/cancel` accepts an optional `{reason, comments}` body and
persists it with a `cancelledAt` timestamp. The eligibility rule (nothing at or
past SHIPPED) is unchanged and still enforced server-side.

## Migration

```bash
psql -d namma_store_dev -f database/006_security_and_cancellation.sql
```

---

# Update 3 — September 2026

## Pincode / serviceability — why it "wasn't working"

There was no serviceability system. `app/products/[id]/page.tsx` had this:

```ts
function checkPin() {
  if (!/^\d{6}$/.test(pin.trim())) { ... }
  setPinResult(`Delivers to ${pin.trim()} by ${deliveryWindow()}`);
}
```

Any valid 6-digit number got "Delivers to … by …", with a date invented from
today's clock. No state lookup, no coverage check, no backend call. It was a
frontend mock.

Replaced with a real system:

- `backend/.../Serviceability.java` — `DeliveryState` and `DeliveryPincode`
  entities, `GET /api/serviceability?pincode=…`, admin CRUD under
  `/api/admin/serviceability/**`.
- `frontend/delivery.tsx` → `<PincodeCheck />`, used on the product page.
- `/admin/serviceability` — states and pincodes tabs, ranges, per-pincode
  charge and ETA overrides, pause/resume, search.

Lookup order: exact pincode row → state pincode range → not serviceable.
Pausing a state pauses every pincode under it.

**The tables start empty on purpose — Karnataka is not seeded.** With nothing
configured the API returns `configured: false` and the widget says delivery
isn't set up, rather than inventing an answer. Add coverage at
`/admin/serviceability` before testing.

## Banded delivery charge

Calculated in `OrdersController.priceCart()`, server-side, from configuration:

| Order value (after discount) | Delivery |
|---|---|
| under `app.delivery.small-order-threshold` (200) | `small-order-charge` (₹40) |
| 200 up to `free-above` (499) | `app.delivery.charge` (₹49) |
| at or above 499 | free |

So ₹150 + ₹40 = ₹190, as specified. The client never sends a delivery charge.

## Cancellation — custom modal

`confirm("Cancel this order?")` is gone from the order flow. `CancelOrderModal`
in `delivery.tsx` is a two-step dialog: reason radio list + comments, then a
confirmation showing order number, total, payment method and chosen reason,
with a loading state and inline errors. Escape closes it, focus moves into it,
and the body stops scrolling behind it.

The reason and comments are persisted (`cancellation_reason`,
`cancellation_comments`, `cancelled_at`). Eligibility is still decided by the
backend — if the order ships between page load and confirmation, the API
refuses and the error appears inside the modal.

## /api/auth/sync impersonation closed

It took `firebaseUid` from the request body and wrote an `AppUser` row for it.
Posting someone else's UID created or overwrote their row — including its email
— and the rest of the app keys off that row. The UID now comes from the
verified ID token; the body field is ignored for identity.

## Migrations

```bash
psql -d namma_store_dev -f database/006_security_and_cancellation.sql
psql -d namma_store_dev -f database/007_serviceability.sql
```
