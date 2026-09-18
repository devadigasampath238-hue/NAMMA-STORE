# Namma Store

A deliberately SIMPLE-structured full-stack e-commerce + product-customization
store. Few large files instead of hundreds of tiny ones — see "Philosophy" below.

## Stack

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS
- **Backend:** Java 21 + Spring Boot + Spring Data JPA + Hibernate + Maven
- **Database:** PostgreSQL
- **Auth:** Firebase Authentication (stubbed — see Auth.java)
- **Payments:** Razorpay (stubbed — see Payments.java)
- **File storage:** Cloudflare R2 / any S3-compatible bucket (not yet wired — see notes below)

## Folder structure

```
namma-store/
├── frontend/          Next.js app
│   ├── app/            all routes/pages
│   ├── components.tsx  ALL shared UI components
│   ├── api.ts          ALL backend fetch calls
│   └── types.ts        ALL shared TypeScript interfaces
├── backend/
│   └── src/main/java/com/nammastore/
│       ├── NammaStoreApplication.java   startup, CORS, health check
│       ├── Auth.java                    users, addresses, Firebase auth
│       ├── Products.java                categories, products, catalog APIs
│       ├── Orders.java                  cart, checkout, orders, coupons
│       ├── Payments.java                Razorpay integration
│       └── Admin.java                   admin auth, dashboard, customize catalog
└── database/           (Hibernate auto-creates tables — no manual SQL needed)
```

**Philosophy:** every backend feature area is ONE file. Every frontend
component is in ONE file. If you need to change pricing logic, open
`Products.java`. If you need to change the UI, open `components.tsx` or the
relevant page. Nothing is scattered across dozens of tiny files.

## Getting started

### 1. Database
```bash
psql -U postgres -c "CREATE DATABASE nammastore;"
```

### 2. Backend
```bash
cd backend
./mvnw spring-boot:run
```
Test: `http://localhost:8080/api/health` → `{"status":"UP","service":"Namma Store Backend"}`

### 3. Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```
Visit: `http://localhost:3000`

## What's fully working right now

- Products & categories: full CRUD from `/admin/products` and `/admin/categories`,
  instantly reflected on the customer-facing `/products` and `/categories/[id]` pages
- Customer accounts: `/register`, `/login`, `/account` using real Firebase email/password
  authentication, synced into our own `app_users` table
- Address book: add/edit/delete/set-default, full fields (name, phone, house/building,
  street, area, city, state, pincode, landmark) — used to pick a delivery address at checkout
- Cart: real add/remove/quantity +/- backed by the database, with stock-aware validation
  (can't add or bump quantity past what's in stock), correctly handling both catalog
  products and customized products as separate line types
- Checkout, orders, coupons
- **Real Razorpay payments**: `/api/payments/create-order` calls the actual Razorpay
  Orders API when `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are set, the checkout page opens
  the real Razorpay modal, signatures are verified with HMAC-SHA256, and the webhook
  endpoint independently verifies + applies `payment.captured`/`payment.failed` events.
  Without keys set, it falls back to a simulated instant-success payment so the rest of
  the app is still testable end-to-end.
- Admin login (`/admin/login`, separate from the customer UI) backed by the
  `AdminAuthFilter` on `/api/admin/**`
- **Full customization system**: `/admin/customize` lets admin define a customizable
  product's name/price/stock, which options are on (text/image/color/size/print
  position), and the actual color/size choices offered. `/customize/[slug]` gives
  customers a live preview (text + uploaded design overlaid on the product image),
  real color swatches and size buttons, and a real file upload (see below) - all the way
  through cart → checkout → the admin order detail page, which shows a clickable
  thumbnail of the uploaded design.
- **Real file uploads**: `POST /api/upload` pushes to S3/R2 when `STORAGE_*` env vars
  are set, otherwise saves to `backend/uploads/` and serves it locally - used by product
  images, the customizable-product base image, and customer design uploads.
- Admin dashboard stats
- Health check, CORS, Postgres wiring

## Making an account an admin (local dev)

There's no seed data, so the first admin has to be promoted by hand:

1. Register a normal account at `/register`.
2. In Postgres: `UPDATE app_users SET admin = true WHERE email = 'you@example.com';`
3. Log in with that same email/password at `/admin/login`.

## What's stubbed and needs your credentials (clearly marked with `TODO` in code)

| Feature | File(s) | What to do |
|---|---|---|
| Real Firebase token verification | `Auth.java` (`FirebaseAuthService`), `Admin.java` (`AdminAuthFilter`) | Today the backend trusts whatever UID string the frontend sends as the bearer token (that's why the frontend sends `firebaseUser.uid` directly instead of a real ID token for admin calls). Add the Firebase Admin SDK (already a pom.xml dependency) and verify a real ID JWT server-side instead. |
| Razorpay going live | `Payments.java` | Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` env vars - the code path is already real, it just needs credentials. Also register the webhook URL (`/api/payments/webhook`) in your Razorpay dashboard. |
| S3/R2 uploads going live | `Products.java` (`upload()`) | Set `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` - until then, uploads are saved locally under `backend/uploads/`, which is fine for local dev but won't survive a redeploy. |
| Wishlist | — | Navbar has a placeholder icon; the feature itself (backend table + APIs + page) hasn't been built yet |

## Environment variables

**Backend** (`backend/src/main/resources/application.properties` already reads these):
```
DB_USERNAME, DB_PASSWORD
RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY
GOOGLE_APPLICATION_CREDENTIALS (path to Firebase service account JSON)
```

**Frontend** (`frontend/.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```
(No Razorpay key needed on the frontend - the checkout page gets it from the backend's
`/api/payments/create-order` response.)

## Editing cheat-sheet

- "Change product price logic" → open `Products.java`
- "Change payment" → open `Payments.java`
- "Change login" → open `Auth.java`
- "Change admin" → open `Admin.java`
- "Change order" → open `Orders.java`
- "Change the UI" → open `components.tsx` or the relevant page under `app/`
