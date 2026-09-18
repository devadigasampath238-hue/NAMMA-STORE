"use client";

// ===========================================================
// /admin/banners
//
// Create and schedule festival / seasonal hero campaigns.
//
// There is no festival dropdown on purpose. A banner is just a
// title, artwork, a CTA and a date window, so Deepavali, Ugadi,
// Sankranti, Back to College and anything invented next year
// are all created here without a code change.
//
// Route protection: middleware.ts blocks this URL before the
// page renders, useAdminSession() re-checks with the backend,
// and AdminAuthFilter re-authorises every API call below.
// ===========================================================

import { useCallback, useEffect, useState } from "react";
import {
  adminCreateBanner,
  adminDeleteBanner,
  adminDeleteBannerImage,
  adminGetBanners,
  adminReorderBanners,
  adminSetBannerActive,
  adminUpdateBanner,
  adminUploadBannerImage,
} from "../../../api";
import { AdminSidebar, SafeImage, useAdminSession } from "../../../components";
import type { Banner, BannerPayload } from "../../../types";

/** Turns an ISO instant into the value <input type="datetime-local"> wants. */
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

type FormState = {
  title: string;
  subtitle: string;
  ctaText: string;
  ctaUrl: string;
  accentColor: string;
  startDate: string;
  endDate: string;
  displayOrder: number;
  active: boolean;
};

const emptyForm: FormState = {
  title: "",
  subtitle: "",
  ctaText: "Shop the offer",
  ctaUrl: "/products",
  accentColor: "#C2410C",
  startDate: "",
  endDate: "",
  displayOrder: 0,
  active: true,
};

function toPayload(form: FormState, imageUrl?: string | null): BannerPayload {
  return {
    title: form.title.trim(),
    subtitle: form.subtitle.trim(),
    ctaText: form.ctaText.trim(),
    ctaUrl: form.ctaUrl.trim(),
    accentColor: form.accentColor,
    // Empty string means "no limit", which the backend stores as null.
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    displayOrder: form.displayOrder,
    active: form.active,
    ...(imageUrl ? { imageUrl } : {}),
  };
}

export default function AdminBannersPage() {
  const { token, checked } = useAdminSession();

  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      setBanners(await adminGetBanners(token));
    } catch (e: any) {
      setError(e?.message ?? "Could not load banners.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Release the object URL so repeated file picks do not leak blobs.
  useEffect(() => {
    return () => {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    };
  }, [pendingPreview]);

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setPendingFile(null);
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingPreview("");
  }

  function startEdit(banner: Banner) {
    setEditingId(banner.id);
    setForm({
      title: banner.title ?? "",
      subtitle: banner.subtitle ?? "",
      ctaText: banner.ctaText ?? "",
      ctaUrl: banner.ctaUrl ?? "",
      accentColor: banner.accentColor ?? "#C2410C",
      startDate: toLocalInput(banner.startDate),
      endDate: toLocalInput(banner.endDate),
      displayOrder: banner.displayOrder ?? 0,
      active: banner.active,
    });
    setPendingFile(null);
    setPendingPreview("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function pickFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file is not an image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Banner artwork must be under 10MB.");
      return;
    }
    setError("");
    setPendingFile(file);
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingPreview(URL.createObjectURL(file));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!token || saving) return;

    if (!form.title.trim()) {
      setError("Give the campaign a title.");
      return;
    }

    const editing = banners.find((b) => b.id === editingId);
    if (!editingId && !pendingFile) {
      setError("Upload the banner artwork before saving.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      if (editingId) {
        // Image first: the backend refuses to save a banner with no artwork,
        // so uploading before the field update keeps both paths valid.
        if (pendingFile) {
          await adminUploadBannerImage(token, editingId, pendingFile, "primary");
        }
        await adminUpdateBanner(token, editingId, toPayload(form));
        setNotice("Campaign updated.");
      } else {
        // Create needs an imageUrl, but the file can only be attached to an
        // existing row. Create with a temporary marker, upload, then save
        // the real fields.
        const created = await adminCreateBanner(token, {
          ...toPayload(form),
          imageUrl: "/uploads/banners/pending",
          active: false,
        });
        await adminUploadBannerImage(token, created.id, pendingFile!, "primary");
        await adminUpdateBanner(token, created.id, toPayload(form));
        setNotice("Campaign created.");
      }

      resetForm();
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not save the campaign.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(banner: Banner) {
    if (!token) return;
    setBusyId(banner.id);
    try {
      await adminSetBannerActive(token, banner.id, !banner.active);
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not change the banner status.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(banner: Banner) {
    if (!token) return;
    if (!window.confirm(`Delete "${banner.title}"? This cannot be undone.`)) return;
    setBusyId(banner.id);
    try {
      await adminDeleteBanner(token, banner.id);
      if (editingId === banner.id) resetForm();
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not delete the banner.");
    } finally {
      setBusyId(null);
    }
  }

  async function move(banner: Banner, direction: -1 | 1) {
    if (!token) return;
    const ordered = [...banners];
    const from = ordered.findIndex((b) => b.id === banner.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ordered.length) return;

    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    setBanners(ordered); // optimistic: the carousel order is low-risk

    try {
      await adminReorderBanners(token, ordered.map((b) => b.id));
    } catch (err: any) {
      setError(err?.message ?? "Could not save the new order.");
      await load();
    }
  }

  async function removeImage(banner: Banner, url: string) {
    if (!token) return;
    setBusyId(banner.id);
    try {
      await adminDeleteBannerImage(token, banner.id, url);
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not remove the image.");
    } finally {
      setBusyId(null);
    }
  }

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Checking your session…
      </div>
    );
  }
  if (!token) return null; // useAdminSession is already redirecting

  const previewSrc = pendingPreview || banners.find((b) => b.id === editingId)?.imageUrl;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AdminSidebar />

      <div className="flex-1 p-4 md:p-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Banners &amp; Festival Offers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Schedule any campaign. Banners appear in the homepage carousel only while
            they are switched on and inside their date window.
          </p>
        </header>

        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {notice && (
          <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </p>
        )}

        {/* ---------------- EDITOR ---------------- */}
        <form
          onSubmit={handleSave}
          className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="mb-4 font-medium text-slate-900">
            {editingId ? "Edit campaign" : "New campaign"}
          </h2>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <Field label="Title">
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Deepavali Dhamaka"
                  className={inputClass}
                />
              </Field>

              <Field label="Subtitle">
                <input
                  value={form.subtitle}
                  onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                  placeholder="Up to 40% off gifting"
                  className={inputClass}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Button text">
                  <input
                    value={form.ctaText}
                    onChange={(e) => setForm({ ...form, ctaText: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Button link">
                  <input
                    value={form.ctaUrl}
                    onChange={(e) => setForm({ ...form, ctaUrl: e.target.value })}
                    placeholder="/products"
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Starts (blank = immediately)">
                  <input
                    type="datetime-local"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Ends (blank = never)">
                  <input
                    type="datetime-local"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Accent colour">
                  <input
                    type="color"
                    value={form.accentColor}
                    onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                    className="h-11 w-full cursor-pointer rounded-lg border border-slate-300 p-1"
                  />
                </Field>
                <Field label="Display order">
                  <input
                    type="number"
                    value={form.displayOrder}
                    onChange={(e) =>
                      setForm({ ...form, displayOrder: Number(e.target.value) || 0 })
                    }
                    className={inputClass}
                  />
                </Field>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Active (still respects the dates above)
              </label>
            </div>

            {/* ---- artwork + live preview ---- */}
            <div className="space-y-3">
              <Field label="Artwork (wide image works best — 1920×640)">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-white"
                />
              </Field>

              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Preview
              </p>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="relative aspect-[3/1] bg-slate-100">
                  {previewSrc ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewSrc}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/35 to-transparent" />
                      <div className="absolute inset-0 flex flex-col justify-center px-5">
                        <p className="text-lg font-bold text-white">
                          {form.title || "Campaign title"}
                        </p>
                        {form.subtitle && (
                          <p className="mt-1 text-sm text-white/90">{form.subtitle}</p>
                        )}
                        {form.ctaText && (
                          <span
                            className="mt-3 w-fit rounded-lg px-4 py-1.5 text-sm font-semibold text-white"
                            style={{ backgroundColor: form.accentColor }}
                          >
                            {form.ctaText}
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">
                      Upload artwork to preview
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:bg-slate-400"
            >
              {saving ? "Saving…" : editingId ? "Save changes" : "Create campaign"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm text-slate-700 transition hover:bg-slate-100"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {/* ---------------- LIST ---------------- */}
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200" />
            ))}
          </div>
        ) : banners.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="font-medium text-slate-700">No campaigns yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Create one above. Until then the homepage shows its default hero.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {banners.map((banner, i) => (
              <li
                key={banner.id}
                className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center"
              >
                <SafeImage
                  src={banner.imageUrl}
                  alt={banner.title}
                  className="h-24 w-full shrink-0 rounded-lg sm:w-40"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium text-slate-900">{banner.title}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        banner.live
                          ? "bg-emerald-100 text-emerald-700"
                          : banner.active
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {banner.live ? "Live" : banner.active ? "Scheduled" : "Off"}
                    </span>
                  </div>

                  {banner.subtitle && (
                    <p className="truncate text-sm text-slate-500">{banner.subtitle}</p>
                  )}

                  <p className="mt-1 text-xs text-slate-400">
                    {banner.startDate
                      ? new Date(banner.startDate).toLocaleString("en-IN")
                      : "Always"}
                    {" → "}
                    {banner.endDate
                      ? new Date(banner.endDate).toLocaleString("en-IN")
                      : "No end"}
                    {" · position "}
                    {i + 1}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => move(banner, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="rounded border border-slate-300 px-2 py-1 text-sm disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(banner, 1)}
                    disabled={i === banners.length - 1}
                    aria-label="Move down"
                    className="rounded border border-slate-300 px-2 py-1 text-sm disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => toggleActive(banner)}
                    disabled={busyId === banner.id}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition hover:bg-slate-100 disabled:opacity-50"
                  >
                    {banner.active ? "Turn off" : "Turn on"}
                  </button>
                  <button
                    onClick={() => startEdit(banner)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition hover:bg-slate-100"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(banner)}
                    disabled={busyId === banner.id}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
