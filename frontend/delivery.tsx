"use client";

// ===========================================================
// delivery.tsx
//
// Two pieces the brief asked for by name:
//   1. PincodeCheck  - the "Check delivery" widget for the
//      product page, cart and checkout.
//   2. CancelOrderModal - a real modal replacing the browser's
//      confirm() dialog.
//
// Both defer to the backend for every decision. PincodeCheck
// never infers a state from a pincode prefix, and the modal
// never decides whether an order is still cancellable - it
// collects a reason and lets the API refuse if it must.
// ===========================================================

import { useEffect, useRef, useState } from "react";
import { checkServiceability } from "./api";
import type { Order, Serviceability } from "./types";

/* =========================================================
   PINCODE CHECK
   ========================================================= */

const PINCODE_STORAGE_KEY = "namma_last_pincode";

export function PincodeCheck({
  compact = false,
  onResult,
}: {
  compact?: boolean;
  /** Lets the cart/checkout react to the charge and ETA. */
  onResult?: (result: Serviceability | null) => void;
}) {
  const [pincode, setPincode] = useState("");
  const [result, setResult] = useState<Serviceability | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Remember the last pincode so the customer does not retype it on every
  // product page. It is a convenience only - the answer is always re-fetched.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PINCODE_STORAGE_KEY);
      if (saved) setPincode(saved);
    } catch {
      // Storage can be disabled; the widget still works.
    }
  }, []);

  async function check(e?: React.FormEvent) {
    e?.preventDefault();
    const value = pincode.trim();

    if (!/^[1-9][0-9]{5}$/.test(value)) {
      setError("Enter a valid 6-digit pincode.");
      setResult(null);
      onResult?.(null);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await checkServiceability(value);
      setResult(data);
      onResult?.(data);
      try {
        localStorage.setItem(PINCODE_STORAGE_KEY, value);
      } catch {
        /* ignore */
      }
    } catch {
      setError("Could not check delivery right now. Please try again.");
      setResult(null);
      onResult?.(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={compact ? "" : "rounded-xl border border-brand-100 bg-white p-4"}>
      {!compact && (
        <p className="mb-2 text-sm font-semibold text-brand-900">Check delivery</p>
      )}

      <form onSubmit={check} className="flex gap-2">
        <input
          inputMode="numeric"
          maxLength={6}
          value={pincode}
          onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
          placeholder="Enter pincode"
          aria-label="Delivery pincode"
          className="w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={loading}
          className="shrink-0 rounded-lg border border-brand-600 px-4 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-50 disabled:opacity-50"
        >
          {loading ? "Checking…" : "Check"}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {result && !error && (
        <div
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            result.serviceable
              ? "bg-emerald-50 text-emerald-800"
              : "bg-amber-50 text-amber-800"
          }`}
        >
          {result.serviceable ? (
            <>
              <p className="font-medium">
                ✓ Delivery available{result.state ? ` — ${result.state}` : ""}
              </p>
              {result.estimatedMinDays != null && result.estimatedMaxDays != null && (
                <p className="mt-0.5 text-emerald-700">
                  Estimated delivery: {result.estimatedMinDays}–{result.estimatedMaxDays} days
                </p>
              )}
              {result.deliveryCharge != null && (
                <p className="text-emerald-700">
                  Delivery charge:{" "}
                  {Number(result.deliveryCharge) === 0
                    ? "FREE"
                    : `₹${Number(result.deliveryCharge)}`}
                </p>
              )}
            </>
          ) : (
            // Covers both "not serviceable" and "nothing configured yet".
            <p>{result.message}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   CANCEL ORDER MODAL
   ========================================================= */

const CANCEL_REASONS = [
  "Ordered by mistake",
  "Found a better price",
  "Delivery is taking too long",
  "Changed my mind",
  "No longer needed",
  "Ordered the wrong product",
  "Payment issue",
  "Other",
];

export function CancelOrderModal({
  order,
  onClose,
  onConfirm,
}: {
  order: Order;
  onClose: () => void;
  /** Should perform the API call and throw on failure. */
  onConfirm: (payload: { reason: string; comments: string }) => Promise<void>;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState("");
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape closes, and focus moves into the dialog so keyboard users are not
  // left behind on the page underneath.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    // Stop the page behind from scrolling under the overlay.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, submitting]);

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      await onConfirm({ reason, comments: comments.trim() });
      onClose();
    } catch (e: any) {
      // The backend is the authority: it may refuse because the order has
      // already shipped since this screen was rendered.
      setError(e?.message ?? "Could not cancel this order. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-order-title"
        onClick={(e) => e.stopPropagation()}
        className="ns-animate-fade-up max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl outline-none sm:rounded-2xl"
      >
        {step === 1 ? (
          <>
            <h2 id="cancel-order-title" className="text-lg font-semibold text-brand-900">
              Cancel your order?
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Order #{order.orderNumber ?? order.id}
            </p>

            <fieldset className="mt-4">
              <legend className="mb-2 text-sm font-medium text-gray-700">
                Why are you cancelling?
              </legend>
              <div className="space-y-1.5">
                {CANCEL_REASONS.map((option) => (
                  <label
                    key={option}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                      reason === option
                        ? "border-brand-500 bg-brand-50 text-brand-900"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="cancel-reason"
                      value={option}
                      checked={reason === option}
                      onChange={() => setReason(option)}
                      className="h-4 w-4"
                    />
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                Additional comments (optional)
              </span>
              <textarea
                rows={3}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                maxLength={1000}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </label>

            <div className="mt-5 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Keep Order
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!reason}
                className="flex-1 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="cancel-order-title" className="text-lg font-semibold text-brand-900">
              Confirm cancellation
            </h2>

            <dl className="mt-4 space-y-2 rounded-lg bg-gray-50 p-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Order</dt>
                <dd className="font-medium">#{order.orderNumber ?? order.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Total</dt>
                <dd className="font-medium">₹{Number(order.totalAmount ?? 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Payment</dt>
                <dd className="font-medium">{order.paymentMethod ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-gray-500">Reason</dt>
                <dd className="text-right font-medium">{reason}</dd>
              </div>
            </dl>

            <p className="mt-4 text-sm text-gray-600">
              Are you sure you want to cancel this order? This cannot be undone.
              {order.paymentStatus === "PAID" &&
                " Any amount paid will be refunded to your original payment method."}
            </p>

            {error && (
              <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setStep(1)}
                disabled={submitting}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Go Back
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:bg-red-300"
              >
                {submitting && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {submitting ? "Cancelling…" : "Cancel Order"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
