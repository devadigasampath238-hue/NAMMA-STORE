"use client";

import { useEffect, useRef, useState } from "react";
import {
  adminGetCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
  adminUploadCategoryImage,
  adminDeleteCategoryImage,
} from "../../../api";
import {
  AdminSidebar,
  AdminTable,
  Loading,
  SafeImage,
  useAdminSession,
} from "../../../components";
import type { Category } from "../../../types";

/* =========================================================
   STAGE 1: category images are uploaded here, not in pgAdmin.

   Flow:
     - editing an existing category -> the file is uploaded and
       linked in ONE call (POST /api/admin/categories/{id}/image)
     - creating a new category -> save first, then the image
       upload runs against the row that was just created
========================================================= */

const emptyForm = { name: "", description: "", imageUrl: "", active: true };

export default function AdminCategoriesPage() {
  const { token, checked } = useAdminSession();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Image chosen before the category exists yet (create flow).
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      setCategories(await adminGetCategories(token));
      setError("");
    } catch (e: any) {
      setError(e?.message ?? "Could not load categories.");
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Revoke the object URL when the preview changes, so we don't leak blobs.
  useEffect(() => {
    return () => {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    };
  }, [pendingPreview]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    clearPendingFile();
  }

  function clearPendingFile() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFilePicked(file: File | undefined) {
    if (!file) return;
    setError("");
    if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.type)) {
      setError("Please choose a PNG, JPG, JPEG or WEBP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("That image is larger than 5MB.");
      return;
    }
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
  }

  /** Editing an existing category: upload immediately. */
  async function uploadNow(categoryId: number, file: File) {
    if (!token) return;
    setUploading(true);
    try {
      const updated = await adminUploadCategoryImage(token, categoryId, file);
      setForm((f) => ({ ...f, imageUrl: updated.imageUrl ?? "" }));
      clearPendingFile();
      setNotice("Image uploaded.");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(categoryId: number) {
    if (!token) return;
    if (!confirm("Remove this category image?")) return;
    setUploading(true);
    try {
      await adminDeleteCategoryImage(token, categoryId);
      setForm((f) => ({ ...f, imageUrl: "" }));
      setNotice("Image removed.");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Could not remove the image.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!token) return;
    if (!form.name.trim()) {
      setError("Category name is required.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = editingId
        ? await adminUpdateCategory(token, editingId, form)
        : await adminCreateCategory(token, form);

      // New category + a picked file: attach it now that we have an id.
      if (pendingFile && saved?.id) {
        await adminUploadCategoryImage(token, saved.id, pendingFile);
      }

      resetForm();
      setNotice(editingId ? "Category updated." : "Category created.");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Could not save the category.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!token) return;
    if (!confirm("Delete this category? Its image will be deleted too.")) return;
    try {
      await adminDeleteCategory(token, id);
      if (editingId === id) resetForm();
      setNotice("Category deleted.");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Could not delete the category.");
    }
  }

  if (!checked || !token) return <Loading />;

  const previewSrc = pendingPreview || form.imageUrl;

  return (
    <div className="flex flex-col md:flex-row">
      <AdminSidebar />

      <div className="min-h-screen flex-1 bg-sandal p-4 md:p-8">
        <h1 className="ns-section-title mb-6">Categories</h1>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {notice && !error && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {notice}
          </div>
        )}

        <div className="ns-card mb-8 max-w-2xl p-5">
          <h2 className="mb-4 font-heading text-lg font-semibold text-brand-900">
            {editingId ? "Edit Category" : "Add Category"}
          </h2>

          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <div>
              <label className="ns-label">Name</label>
              <input
                className="ns-input mb-3"
                value={form.name}
                placeholder="e.g. Mugs"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />

              <label className="ns-label">Description</label>
              <textarea
                className="ns-input mb-3 min-h-[80px]"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                Active (visible on the storefront)
              </label>
            </div>

            {/* ---- image panel ---- */}
            <div className="md:w-48">
              <label className="ns-label">Category image</label>

              <SafeImage
                src={previewSrc}
                alt={form.name || "Category image"}
                className="aspect-video w-full rounded-lg border border-brand-100"
              />

              <div className="mt-2 flex flex-col gap-2">
                <label className="ns-btn-outline cursor-pointer !px-3 !py-1.5 text-sm">
                  {previewSrc ? "Replace image" : "Choose image"}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      handleFilePicked(file);
                      if (editingId && file) uploadNow(editingId, file);
                    }}
                  />
                </label>

                {editingId && form.imageUrl && (
                  <button
                    type="button"
                    onClick={() => removeImage(editingId)}
                    className="text-sm text-red-600 underline"
                  >
                    Remove image
                  </button>
                )}

                {pendingFile && !editingId && (
                  <p className="text-xs text-gray-500">
                    Will be uploaded when you save this new category.
                  </p>
                )}
                {uploading && <p className="text-xs text-gray-500">Uploading…</p>}
              </div>
            </div>
          </div>

          <div className="mt-5 flex gap-3">
            <button onClick={handleSave} disabled={saving} className="ns-btn-primary">
              {saving ? "Saving…" : editingId ? "Save changes" : "Create category"}
            </button>
            {editingId && (
              <button onClick={resetForm} className="ns-btn-outline">
                Cancel
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <Loading label="Loading categories…" />
        ) : categories.length === 0 ? (
          <p className="text-gray-500">No categories yet. Create your first one above.</p>
        ) : (
          <AdminTable
            headers={["Image", "Name", "Slug", "Products", "Active", "Actions"]}
            rows={categories.map((c) => [
              <SafeImage
                key={`img-${c.id}`}
                src={c.imageUrl}
                alt={c.name}
                className="h-12 w-16 rounded-md border border-brand-100"
              />,
              c.name,
              <span key={`slug-${c.id}`} className="text-xs text-gray-500">
                {c.slug}
              </span>,
              c.productCount ?? 0,
              c.active ? "Yes" : "No",
              <div key={`act-${c.id}`} className="flex gap-3">
                <button
                  onClick={() => {
                    clearPendingFile();
                    setEditingId(c.id);
                    setError("");
                    setNotice("");
                    setForm({
                      name: c.name,
                      description: c.description || "",
                      imageUrl: c.imageUrl || "",
                      active: c.active,
                    });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="text-sm text-brand-700 underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="text-sm text-red-600 underline"
                >
                  Delete
                </button>
              </div>,
            ])}
          />
        )}
      </div>
    </div>
  );
}
