"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loginWithEmail, logout as firebaseLogout } from "../../../firebase";
import { syncUser, adminVerify } from "../../../api";
import {
  ADMIN_TOKEN_KEY,
  setAdminSessionCookie,
  clearAdminSessionCookie,
} from "../../../components";

// Admin login is deliberately separate from the customer /login page and
// shares none of its UI.
//
// WHAT CHANGED
//  - It now sends a real Firebase ID token (user.getIdToken()) instead of
//    the raw Firebase UID. The backend verifies that token with the
//    Firebase Admin SDK, so knowing a UID no longer grants admin access.
//  - A non-secret marker cookie is set so middleware.ts can redirect
//    /admin/* before any admin HTML is rendered.
//  - If the account signs in but is not staff, we sign it straight back
//    out. Leaving a half-session behind is how people end up stuck on a
//    redirect loop.
//
// To make an account an admin locally:
//   1. Register/log in once as a normal customer so the app_users row exists.
//   2. UPDATE app_users SET admin = true WHERE email = 'you@example.com';
//   3. Sign in here with that same email and password.

function AdminLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params?.get("next") ?? "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(
    params?.get("error") === "not-admin"
      ? "That account does not have admin access."
      : ""
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const fbUser = await loginWithEmail(email, password);
      const idToken = await fbUser.getIdToken();

      await syncUser({
        firebaseUid: fbUser.uid,
        email: fbUser.email ?? email,
        displayName: fbUser.displayName ?? undefined,
      });

      // The single source of truth: the backend re-checks the ADMIN flag.
      await adminVerify(idToken);

      localStorage.setItem(ADMIN_TOKEN_KEY, idToken);
      setAdminSessionCookie();

      // Only ever redirect inside this app - never to an attacker's URL.
      const safeNext = nextPath.startsWith("/admin") ? nextPath : "/admin";
      router.replace(safeNext);
    } catch (err: any) {
      const message = String(err?.message ?? "");
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      clearAdminSessionCookie();

      if (message.includes("403")) {
        // Signed in fine, just not staff. Do not leave them logged in.
        await firebaseLogout().catch(() => {});
        setError("That account does not have admin access.");
      } else if (message.includes("401")) {
        await firebaseLogout().catch(() => {});
        setError("Your session could not be verified. Please try again.");
      } else if (message.includes("Failed to fetch")) {
        setError("Cannot reach the server. Is the backend running on port 8080?");
      } else {
        setError("Incorrect email or password.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.jpeg"
            alt="Namma Store"
            className="h-16 w-16 rounded-full bg-white object-contain p-1 ring-2 ring-amber-500"
          />
          <h1 className="mt-4 text-2xl font-semibold text-white">Admin Login</h1>
          <p className="mt-1 text-sm text-slate-400">Namma Store staff access only.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl bg-white p-6 shadow-xl"
          noValidate
        >
          <div>
            <label htmlFor="admin-email" className="mb-1 block text-sm font-medium text-slate-700">
              Admin email
            </label>
            <input
              id="admin-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <div className="relative">
              <input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-16 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-slate-500 transition hover:text-slate-800"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {submitting && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {submitting ? "Verifying…" : "Login to Admin"}
          </button>

          <p className="text-center text-xs text-slate-500">
            Lost your password? Reset it from the customer sign-in page, then
            return here.
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Looking for the shop?{" "}
          <a href="/" className="underline hover:text-slate-300">
            Go to Namma Store
          </a>
        </p>
      </div>
    </div>
  );
}

// useSearchParams needs a Suspense boundary, otherwise `next build`
// fails this route with a prerender error.
export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen bg-slate-900" aria-busy="true" />}
    >
      <AdminLoginForm />
    </Suspense>
  );
}
