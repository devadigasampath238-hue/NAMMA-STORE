"use client";

import { useCallback, useEffect, useState } from "react";
import {
  adminGetCoupons,
  adminCreateCoupon,
  adminUpdateCoupon,
  adminDeleteCoupon,
  adminSetCouponActive,
} from "../../../api";
import { AdminSidebar, AdminTable, useAdminSession } from "../../../components";
import {
  ListSkeleton,
  ErrorState,
  EmptyState,
  Modal,
  Price,
  useToast,
  friendlyError,
} from "../../../ui";
import type { Coupon, CouponPayload, CouponType } from "../../../types";

/* =========================================================
   STAGE 2: full coupon CRUD from the dashboard.
   Nothing here needs pgAdmin.

   Discounts are still calculated server-side at checkout -
   this screen only configures the rules.
========================================================= */

const emptyForm = {
  code: "",
  description: "",
  discountType: "PERCENT" as CouponType,
  discountValue: "",
  minOrderValue: "",
  maxDiscount: "",
  expiryDate: "",
  usageLimit: "",
  active: true,
};

type FormState = typeof emptyForm;

export default function AdminCouponsPage() {
  const { token, checked } = useAdminSession();
  const { success, error: toastError } = useToast();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      setCoupons(await adminGetCoupons(token));
    } catch (e) {
      setError(friendlyError(e, "Could not load coupons."));
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(coupon: Coupon) {
    setEditingId(coupon.id);
    setForm({
      code: coupon.code,
      description: coupon.description ?? "",
      discountType: coupon.discountType,
      discountValue: String(coupon.discountValue ?? ""),
      minOrderValue: coupon.minOrderValue ? String(coupon.minOrderValue) : "",
      maxDiscount: coupon.maxDiscount != null ? String(coupon.maxDiscount) : "",
      expiryDate: coupon.expiryDate ?? "",
      usageLimit: coupon.usageLimit != null ? String(coupon.usageLimit) : "",
      active: coupon.active,
    });
    setFormError("");
    setModalOpen(true);
  }

  function validate(): string | null {
    if (!/^[A-Z0-9_-]{3,32}$/.test(form.code.trim().toUpperCase())) {
      return "Code must be 3–32 characters: letters, numbers, - or _.";
    }
    const value = Number(form.discountValue);
    if (!Number.isFinite(value) || value <= 0) {
      return "Discount value must be greater than zero.";
    }
    if (form.discountType === "PERCENT" && value > 100) {
      return "A percentage discount cannot exceed 100%.";
    }
    if (form.minOrderValue && Number(form.minOrderValue) < 0) {
      return "Minimum order value cannot be negative.";
    }
    if (form.expiryDate && Number.isNaN(Date.parse(form.expiryDate))) {
      return "Expiry date is not valid.";
    }
    return null;
  }

  async function save() {
    if (!token) return;
    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }

    const payload: CouponPayload = {
      code: form.code.trim().toUpperCase(),
      description: form.description.trim() || undefined,
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      minOrderValue: form.minOrderValue ? Number(form.minOrderValue) : 0,
      // A cap only means anything for a percentage coupon.
      maxDiscount:
        form.discountType === "PERCENT" && form.maxDiscount ? Number(form.maxDiscount) : null,
      expiryDate: form.expiryDate || null,
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
      active: form.active,
    };

    setSaving(true);
    setFormError("");
    try {
      if (editingId) {
        await adminUpdateCoupon(token, editingId, payload);
        success("Coupon updated");
      } else {
        await adminCreateCoupon(token, payload);
        success("Coupon created");
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      setFormError(friendlyError(e, "Could not save this coupon."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(coupon: Coupon) {
    if (!token) return;
    try {
      await adminSetCouponActive(token, coupon.id, !coupon.active);
      await load();
      success(coupon.active ? `${coupon.code} disabled` : `${coupon.code} enabled`);
    } catch (e) {
      toastError(friendlyError(e, "Could not change that coupon."));
    }
  }

  async function remove(coupon: Coupon) {
    if (!token) return;
    if (!confirm(`Delete coupon ${coupon.code}? This cannot be undone.`)) return;
    try {
      await adminDeleteCoupon(token, coupon.id);
      await load();
      success("Coupon deleted");
    } catch (e) {
      toastError(friendlyError(e, "Could not delete that coupon."));
    }
  }

  if (!checked || !token) return <ListSkeleton rows={4} />;

  return (
    <div className="flex flex-col md:flex-row">
      <AdminSidebar />

      <div className="min-h-screen flex-1 bg-sandal p-4 md:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="ns-section-title">Coupons</h1>
            <p className="mt-1 text-sm text-gray-500">
              Discounts are validated and applied by the server at checkout.
            </p>
          </div>
          <button onClick={openCreate} className="ns-btn-primary">
            Add Coupon
          </button>
        </div>

        {loading ? (
          <ListSkeleton rows={4} height="h-16" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : coupons.length === 0 ? (
          <EmptyState
            title="No coupons yet"
            message="Create one and it becomes usable at checkout straight away."
          />
        ) : (
          <AdminTable
            headers={[
              "Code",
              "Type",
              "Discount",
              "Min order",
              "Expiry",
              "Used",
              "Status",
              "Actions",
            ]}
            rows={coupons.map((c) => [
              <div key={`code-${c.id}`}>
                <span className="font-mono font-semibold text-brand-800">{c.code}</span>
                {c.description && (
                  <p className="mt-0.5 max-w-[16rem] truncate text-xs text-gray-400">
                    {c.description}
                  </p>
                )}
              </div>,
              c.discountType === "PERCENT" ? "Percentage" : "Fixed",
              <span key={`d-${c.id}`}>
                {c.discountType === "PERCENT" ? (
                  <>
                    {c.discountValue}%
                    {c.maxDiscount != null && (
                      <span className="text-xs text-gray-400">
                        {" "}
                        (max <Price value={c.maxDiscount} />)
                      </span>
                    )}
                  </>
                ) : (
                  <Price value={c.discountValue} />
                )}
              </span>,
              Number(c.minOrderValue) > 0 ? <Price key={`m-${c.id}`} value={c.minOrderValue} /> : "—",
              c.expiryDate ?? "Never",
              c.usageLimit != null ? `${c.usedCount} / ${c.usageLimit}` : String(c.usedCount),
              <StatusPill key={`s-${c.id}`} status={c.statusLabel} />,
              <div key={`a-${c.id}`} className="flex flex-wrap gap-3">
                <button onClick={() => openEdit(c)} className="text-sm text-brand-700 underline">
                  Edit
                </button>
                <button
                  onClick={() => toggleActive(c)}
                  className="text-sm text-gray-600 underline"
                >
                  {c.active ? "Disable" : "Enable"}
                </button>
                <button onClick={() => remove(c)} className="text-sm text-red-600 underline">
                  Delete
                </button>
              </div>,
            ])}
          />
        )}

        <Modal
          open={modalOpen}
          title={editingId ? "Edit coupon" : "New coupon"}
          onClose={() => setModalOpen(false)}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="ns-label" htmlFor="coupon-code">
                Coupon code
              </label>
              <input
                id="coupon-code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="NAMMA10"
                className="ns-input font-mono uppercase"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="ns-label" htmlFor="coupon-desc">
                Description (optional)
              </label>
              <input
                id="coupon-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="10% off your first order"
                className="ns-input"
              />
            </div>

            <div>
              <label className="ns-label" htmlFor="coupon-type">
                Discount type
              </label>
              <select
                id="coupon-type"
                value={form.discountType}
                onChange={(e) =>
                  setForm({ ...form, discountType: e.target.value as CouponType })
                }
                className="ns-input"
              >
                <option value="PERCENT">Percentage (%)</option>
                <option value="FIXED">Fixed amount (₹)</option>
              </select>
            </div>

            <div>
              <label className="ns-label" htmlFor="coupon-value">
                {form.discountType === "PERCENT" ? "Discount (%)" : "Discount (₹)"}
              </label>
              <input
                id="coupon-value"
                value={form.discountValue}
                inputMode="decimal"
                onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                className="ns-input"
              />
            </div>

            <div>
              <label className="ns-label" htmlFor="coupon-min">
                Minimum order (₹)
              </label>
              <input
                id="coupon-min"
                value={form.minOrderValue}
                inputMode="decimal"
                placeholder="0"
                onChange={(e) => setForm({ ...form, minOrderValue: e.target.value })}
                className="ns-input"
              />
            </div>

            <div>
              <label className="ns-label" htmlFor="coupon-max">
                Maximum discount (₹)
              </label>
              <input
                id="coupon-max"
                value={form.maxDiscount}
                inputMode="decimal"
                disabled={form.discountType !== "PERCENT"}
                placeholder={form.discountType === "PERCENT" ? "No cap" : "N/A for fixed"}
                onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                className="ns-input disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            <div>
              <label className="ns-label" htmlFor="coupon-expiry">
                Expiry date
              </label>
              <input
                id="coupon-expiry"
                type="date"
                value={form.expiryDate}
                onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                className="ns-input"
              />
              <p className="mt-1 text-xs text-gray-400">Leave blank for no expiry.</p>
            </div>

            <div>
              <label className="ns-label" htmlFor="coupon-limit">
                Usage limit
              </label>
              <input
                id="coupon-limit"
                value={form.usageLimit}
                inputMode="numeric"
                placeholder="Unlimited"
                onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                className="ns-input"
              />
            </div>

            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="h-4 w-4 accent-brand-600"
              />
              Active (customers can use this coupon)
            </label>
          </div>

          {formError && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}

          <div className="mt-6 flex gap-3">
            <button onClick={save} disabled={saving} className="ns-btn-primary">
              {saving ? "Saving…" : editingId ? "Save changes" : "Create coupon"}
            </button>
            <button onClick={() => setModalOpen(false)} className="ns-btn-outline">
              Cancel
            </button>
          </div>
        </Modal>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Coupon["statusLabel"] }) {
  const tone =
    status === "ACTIVE"
      ? "bg-green-100 text-green-800"
      : status === "EXPIRED"
      ? "bg-red-100 text-red-700"
      : status === "EXHAUSTED"
      ? "bg-amber-100 text-amber-800"
      : "bg-gray-100 text-gray-600";
  return <span className={`ns-badge ${tone}`}>{status}</span>;
}
