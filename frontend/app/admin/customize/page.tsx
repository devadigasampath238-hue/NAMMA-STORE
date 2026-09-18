"use client";

import { useEffect, useState } from "react";
import {
  adminGetCustomizable,
  adminCreateCustomizable,
  adminUpdateCustomizable,
  adminDeleteCustomizable,
  uploadFile,
} from "../../../api";
import { AdminSidebar, AdminTable, Loading, useAdminSession } from "../../../components";
import type { CustomizableProduct } from "../../../types";

const OPTION_CHOICES = ["TEXT", "IMAGE", "COLOR", "SIZE", "PRINT_POSITION"];

const emptyForm = {
  name: "",
  slug: "",
  basePrice: 0,
  imageUrl: "",
  minQuantity: 1,
  maxQuantity: 100,
  stock: 0,
  active: true,
  enabledOptions: [] as string[],
  availableColors: "",
  availableSizes: "",
};

export default function AdminCustomizePage() {
  const { token, checked } = useAdminSession();
  const [items, setItems] = useState<CustomizableProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    setItems(await adminGetCustomizable(token));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function toggleOption(opt: string) {
    setForm((f) => ({
      ...f,
      enabledOptions: f.enabledOptions.includes(opt)
        ? f.enabledOptions.filter((o) => o !== opt)
        : [...f.enabledOptions, opt],
    }));
  }

  async function handleSave() {
    const payload = { ...form, enabledOptions: form.enabledOptions.join(",") };
    if (editingId) {
      await adminUpdateCustomizable(token!, editingId, payload);
    } else {
      await adminCreateCustomizable(token!, payload);
    }
    setForm(emptyForm);
    setEditingId(null);
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this customizable product?")) return;
    await adminDeleteCustomizable(token!, id);
    load();
  }

  if (!checked || !token) return <Loading />;

  return (
    <div className="flex">
      <AdminSidebar />
      <div className="flex-1 p-6 md:p-8 bg-sandal min-h-screen">
        <h1 className="text-2xl font-bold mb-6">Customize Catalog</h1>

        <div className="border border-gray-200 rounded-lg p-4 mb-8 max-w-xl">
          <h2 className="font-semibold mb-4">
            {editingId ? "Edit Customizable Product" : "Add Customizable Product"}
          </h2>

          <label className="block text-sm mb-1">Product Name</label>
          <input
            className="w-full border border-gray-300 rounded px-3 py-2 mb-3"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <label className="block text-sm mb-1">Slug (used in URL /customize/[slug])</label>
          <input
            className="w-full border border-gray-300 rounded px-3 py-2 mb-3"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder="e.g. mug, tshirt, keychain"
          />

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm mb-1">Base Price</label>
              <input
                type="number"
                className="w-full border border-gray-300 rounded px-3 py-2"
                value={form.basePrice}
                onChange={(e) => setForm({ ...form, basePrice: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Stock</label>
              <input
                type="number"
                className="w-full border border-gray-300 rounded px-3 py-2"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm mb-1">Min Quantity</label>
              <input
                type="number"
                className="w-full border border-gray-300 rounded px-3 py-2"
                value={form.minQuantity}
                onChange={(e) => setForm({ ...form, minQuantity: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Max Quantity</label>
              <input
                type="number"
                className="w-full border border-gray-300 rounded px-3 py-2"
                value={form.maxQuantity}
                onChange={(e) => setForm({ ...form, maxQuantity: Number(e.target.value) })}
              />
            </div>
          </div>

          <label className="block text-sm mb-1">Product Image</label>
          <input
            className="w-full border border-gray-300 rounded px-3 py-2 mb-2"
            value={form.imageUrl}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            placeholder="Paste an image URL, or upload a file below"
          />
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setImageUploading(true);
              try {
                const url = await uploadFile(file, "customize");
                setForm((f) => ({ ...f, imageUrl: url }));
              } finally {
                setImageUploading(false);
              }
            }}
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-gray-800 file:text-white file:text-xs hover:file:bg-gray-900 mb-3"
          />
          {imageUploading && <p className="text-xs text-gray-500 -mt-2 mb-3">Uploading...</p>}

          <label className="block text-sm mb-2">Customization Options Available</label>
          <div className="flex flex-wrap gap-3 mb-4">
            {OPTION_CHOICES.map((opt) => (
              <label key={opt} className="flex items-center gap-2 text-sm border border-gray-300 rounded px-3 py-1">
                <input
                  type="checkbox"
                  checked={form.enabledOptions.includes(opt)}
                  onChange={() => toggleOption(opt)}
                />
                {opt}
              </label>
            ))}
          </div>

          {form.enabledOptions.includes("COLOR") && (
            <div className="mb-3">
              <label className="block text-sm mb-1">Available Colors (comma separated)</label>
              <input
                className="w-full border border-gray-300 rounded px-3 py-2"
                value={form.availableColors}
                onChange={(e) => setForm({ ...form, availableColors: e.target.value })}
                placeholder="e.g. Red,Blue,Black,White"
              />
            </div>
          )}

          {form.enabledOptions.includes("SIZE") && (
            <div className="mb-3">
              <label className="block text-sm mb-1">Available Sizes (comma separated)</label>
              <input
                className="w-full border border-gray-300 rounded px-3 py-2"
                value={form.availableSizes}
                onChange={(e) => setForm({ ...form, availableSizes: e.target.value })}
                placeholder="e.g. S,M,L,XL"
              />
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleSave} className="bg-orange-700 text-white px-4 py-2 rounded">
              Save
            </button>
            {editingId && (
              <button
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                }}
                className="border border-gray-300 px-4 py-2 rounded"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <Loading />
        ) : (
          <AdminTable
            headers={["Name", "Slug", "Base Price", "Stock", "Actions"]}
            rows={items.map((item) => [
              item.name,
              item.slug,
              `₹${item.basePrice}`,
              item.stock,
              <div key={item.id} className="flex gap-3">
                <button
                  onClick={() => {
                    setEditingId(item.id);
                    setForm({
                      name: item.name,
                      slug: item.slug,
                      basePrice: item.basePrice,
                      imageUrl: item.imageUrl || "",
                      minQuantity: item.minQuantity,
                      maxQuantity: item.maxQuantity,
                      stock: item.stock,
                      active: item.active,
                      enabledOptions: (item.enabledOptions || "").split(",").filter(Boolean),
                      availableColors: item.availableColors || "",
                      availableSizes: item.availableSizes || "",
                    });
                  }}
                  className="text-orange-700 text-sm"
                >
                  Edit
                </button>
                <button onClick={() => handleDelete(item.id)} className="text-red-600 text-sm">
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
