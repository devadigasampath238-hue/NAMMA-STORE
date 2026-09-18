# Namma Store — Stage 1: Backend Foundation

Next.js + TypeScript frontend **preserved**. Spring Boot + PostgreSQL backend **fixed and extended**.
Nothing was rewritten in vanilla JS. No working page was deleted.

---

## 1. Files changed

### Backend — new
| File | Purpose |
|---|---|
| `backend/src/main/java/com/nammastore/Storage.java` | Storage service (R2/S3 **or** local disk) + `/api/upload` |
| `backend/src/main/java/com/nammastore/Dtos.java` | `ProductDto`, `CategoryDto`, `OrderDto`, `OrderItemDto`, `AppUserDto`, `DtoMapper` |
| `backend/.env.example` | Every configurable value. **No secrets in source.** |
| `database/002_stage1_orders_and_images.sql` | The **one** migration you need to run |

### Backend — rewritten / edited
| File | What changed |
|---|---|
| `Products.java` | DTO responses; product + category image endpoints; search across name/description/brand/type/category; `/products/{id}/related`; sale-price sanity check; slug uniqueness now ignores the row being edited |
| `Orders.java` | Order money breakdown persisted; `@Transactional` checkout; order numbers; 7-status lifecycle; shared pricing engine; stock re-validation; coupon maths fixed |
| `Auth.java` | `photoUrl` on `AppUser`; profile edit + avatar upload/delete; DTO responses; **honest security note on the auth stub** |
| `Admin.java` | Dashboard revenue / pending / completed; DTO responses; order-status validation; CORS origin from config |
| `Payments.java` | Aligned with the new status + `paymentStatus` fields |
| `NammaStoreApplication.java` | Config-driven CORS and upload folder; nested `/uploads/**` serving |
| `application.properties` | Multipart limits, storage config, delivery pricing, `open-in-view=false` |

### Frontend — rewritten / edited
| File | What changed |
|---|---|
| `types.ts` | Mirrors the backend DTOs exactly, including `effectivePrice`, `discountPercent`, `stockStatus`, `itemCount` |
| `api.ts` | `resolveImageUrl()` / `PLACEHOLDER_IMAGE`; product + category image endpoints; cart summary; profile endpoints |
| `components.tsx` | `SafeImage`, `Skeleton`, `ProductCardSkeleton`; equal-height product cards; logo crop fixed |
| `app/admin/categories/page.tsx` | Category image upload / preview / replace / delete |
| `app/admin/page.tsx` | Revenue, pending, completed, recent orders |
| `app/admin/orders/page.tsx` | New statuses, customer + payment + money breakdown |
| `app/admin/products/page.tsx` | `SafeImage` thumbnails, `effectivePrice` |
| `app/cart/page.tsx`, `app/products/[id]/page.tsx`, `app/customize/*` | Image fallbacks, no distortion, URL resolution |
| `globals.d.ts` (new) | Makes `tsc --noEmit` clean |

---

## 2. The three real bugs this fixes

**1. Jackson infinite recursion.**
`Order → items → OrderItem.order → Order → …` had no cycle break. `GET /api/orders/{userId}`
and `GET /api/admin/orders` produced a `StackOverflowError` surfaced as a blank 500.
Fixed by DTOs, plus `@JsonIgnore` on the back-reference as a second line of defence.

**2. Coupon maths threw on ordinary input.**
`total.multiply(percent).divide(BigDecimal.valueOf(100))` with no scale raises
`ArithmeticException` for any non-terminating decimal — a 33% coupon crashed checkout.
Now `divide(…, 2, RoundingMode.HALF_UP)`.

**3. The pgAdmin problem — root cause.**
`uploadFile()` prefixed the backend host and wrote
`http://localhost:8080/uploads/x.jpg` into PostgreSQL, so every host change broke every image.
Now the database stores `/uploads/products/x.jpg` and the API builds the absolute URL at
response time from `app.public.base-url`. **Legacy absolute rows still work untouched.**

---

## 3. Authentication — read this

`FirebaseAuthService.verifyTokenAndGetUid()` **verifies nothing.** It takes whatever string is
in the `Authorization` header and treats it as a trusted Firebase UID.

Concretely:
- Anyone who knows or guesses an admin's Firebase UID can send
  `Authorization: Bearer <that-uid>` and get full access to `/api/admin/**`.
- Order, address and profile endpoints identify the user by a **path parameter**, so any
  signed-in user can read another user's data by changing the id in the URL.

Behaviour was preserved as requested, and the limitation is documented in `Auth.java`.
**Do not deploy this to the internet as-is.** The steps to make it real are written out in
the file — it is a separate, deliberate change because it alters the frontend login flow.

---

## 4. Commands

### Database (run ONCE)
```bash
# Start the backend once first so Hibernate adds the new columns, then:
psql -U postgres -d namma_store_dev -f database/002_stage1_orders_and_images.sql
```
Safe to re-run. Nothing is deleted.

### Backend
```bash
cd backend
cp .env.example .env        # edit DB_PASSWORD etc.
export $(grep -v '^#' .env | xargs)
mvn clean spring-boot:run
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## 5. Testing steps

**Health / storage mode**
```bash
curl http://localhost:8080/api/health
# {"status":"UP","service":"Namma Store Backend","storage":"local"}
```

**Orders no longer blow up** (this was the 500)
```bash
curl http://localhost:8080/api/orders/1
```
Expect a JSON array with `subtotal`, `discountAmount`, `deliveryCharge`, `totalAmount`,
`orderNumber`, `items[]` — and no stack trace.

**Product images are absolute**
```bash
curl -s http://localhost:8080/api/products | head -c 600
```
Every `thumbnailUrl` / `images[]` entry starts with `http://localhost:8080/uploads/…`.

**Category image upload — no pgAdmin**
1. `/admin/categories` → Edit a category → *Replace image* → pick a file.
2. The image appears immediately in the form, the table, and on `/categories`.

**Product images — no pgAdmin**
```bash
curl -X POST -H "Authorization: Bearer <admin-firebase-uid>" \
  -F "files=@a.jpg" -F "files=@b.jpg" \
  http://localhost:8080/api/admin/products/1/images

curl -X PUT -H "Authorization: Bearer <admin-firebase-uid>" \
  "http://localhost:8080/api/admin/products/1/images/primary?url=<one-of-the-returned-urls>"
```
`thumbnailUrl` always equals `images[0]`.

**Coupon that used to crash**
Create a coupon with `discountPercent = 33`, apply it at checkout. Previously
`ArithmeticException` → 500. Now it discounts correctly.

**Order actually lands in PostgreSQL before success**
```sql
SELECT id, order_number, subtotal, discount_amount, delivery_charge,
       total_amount, payment_method, status FROM orders ORDER BY id DESC LIMIT 1;
```

**Broken image fallback**
Delete a file from `backend/uploads/` and reload the catalog — you get the inline
placeholder, not a broken-image icon.

---

## 6. Verification performed

- `npx tsc --noEmit` — **clean, zero errors** (a pre-existing `TS2882` on the CSS import
  was fixed with `globals.d.ts`).
- Java: structural validation (brace/paren balance), method-resolution cross-check of every
  bean call, accessor call and repository method, duplicate-type scan, request-mapping
  collision review, unused-import scan.
- **Not done:** `mvn compile` and `next build`. This environment has a JRE but no `javac`,
  no Maven, and no network, and `next build` needs to download the SWC native binary.
  Run both locally before Stage 2.

---

## 7. Notes

- `_scaffold_unused_namma-store/` is the empty duplicate scaffold from your original zip.
  It is **not** part of the build. Kept rather than deleted, since you asked me not to
  remove things unnecessarily.
- Coupon *management* UI, wishlist, the product-detail redesign, the dummy payment flow and
  the animated success page are Stages 2–4. Stage 1 deliberately stops here so you can
  confirm it compiles and runs before anything else is layered on top.
