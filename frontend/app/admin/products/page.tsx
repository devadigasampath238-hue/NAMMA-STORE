"use client";

import { useEffect, useState } from "react";

import {
  getProducts,
  getCategories,
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
} from "../../../api";

import {
  AdminSidebar,
  AdminTable,
  Loading,
  MultiImageUploader,
  SafeImage,
  useAdminSession,
} from "../../../components";

import type { Product, Category } from "../../../types";

/* =========================================================
   PRODUCT TYPES
   Product Type is NOT the same as Category.
========================================================= */

const PRODUCT_TYPES = [
  "T-Shirt",
  "Shirt",
  "Hoodie",
  "Sweatshirt",
  "Mug",
  "Bottle",
  "Cap",
  "Keychain",
  "Photo Frame",
  "Poster",
  "Tote Bag",
  "Sticker",
  "Notebook",
  "Phone Case",
  "Other",
];

/* =========================================================
   EMPTY FORM
========================================================= */

const emptyForm = {
  name: "",
  description: "",

  productType: "",

  price: 0,

  salePrice: undefined as number | undefined,

  sku: "",

  brand: "",

  stockQuantity: 0,

  featured: false,

  active: true,

  customizable: false,

  categoryId: undefined as number | undefined,

  thumbnailUrl: "",

  backgroundImageUrl: "",

  images: [] as string[],

  variants: [] as string[],
};

/* =========================================================
   PAGE
========================================================= */

export default function AdminProductsPage() {
  const { token, checked } = useAdminSession();

  const [products, setProducts] = useState<Product[]>([]);

  const [categories, setCategories] = useState<Category[]>([]);

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(emptyForm);

  const [editingId, setEditingId] = useState<number | null>(null);

  const [error, setError] = useState("");

  /* =========================================================
     LOAD PRODUCTS
  ========================================================= */

  async function loadProducts() {
    try {
      const data = await getProducts();

      setProducts(
        Array.isArray(data) ? data : []
      );
    } catch (err: any) {
      console.error("Failed to load products:", err);

      setProducts([]);

      setError(
        err?.message ||
          "Failed to load products."
      );
    }
  }

  /* =========================================================
     LOAD CATEGORIES
  ========================================================= */

  async function loadCategories() {
    try {
      const data = await getCategories();

      console.log(
        "Categories received:",
        data
      );

      if (Array.isArray(data)) {
        setCategories(data);
      } else {
        setCategories([]);
      }
    } catch (err: any) {
      console.error(
        "Failed to load categories:",
        err
      );

      setCategories([]);

      setError(
        err?.message ||
          "Failed to load categories."
      );
    }
  }

  /* =========================================================
     LOAD EVERYTHING
  ========================================================= */

  async function load() {
    setLoading(true);

    setError("");

    /*
     * IMPORTANT:
     * Products and categories are loaded separately.
     *
     * If products fail, categories can still load.
     * If categories fail, products can still load.
     */

    await Promise.all([
      loadProducts(),
      loadCategories(),
    ]);

    setLoading(false);
  }

  useEffect(() => {
    if (checked && token) {
      load();
    }
  }, [checked, token]);

  /* =========================================================
     VALIDATE FORM
  ========================================================= */

  function validateForm() {
    if (!form.name.trim()) {
      return "Please enter a product name.";
    }

    if (!form.productType) {
      return "Please select a product type.";
    }

    if (!form.categoryId) {
      return "Please select a category.";
    }

    if (!form.price || form.price <= 0) {
      return "Please enter a valid price.";
    }

    if (form.salePrice !== undefined) {
      if (form.salePrice < 0) {
        return "Discount price cannot be negative.";
      }

      if (form.salePrice > form.price) {
        return "Discount price cannot be greater than the original price.";
      }
    }

    if (form.stockQuantity < 0) {
      return "Stock quantity cannot be negative.";
    }

    return null;
  }

  /* =========================================================
     SAVE PRODUCT
  ========================================================= */

  async function handleSave() {
    if (!token) {
      setError("Admin session not found.");
      return;
    }

    const validationError =
      validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);

    setError("");

    try {
      const payload = {
        name: form.name.trim(),

        description:
          form.description.trim(),

        productType:
          form.productType,

        price:
          form.price,

        salePrice:
          form.salePrice === undefined
            ? null
            : form.salePrice,

        sku:
          form.sku.trim(),

        brand:
          form.brand.trim(),

        stockQuantity:
          form.stockQuantity,

        featured:
          form.featured,

        active:
          form.active,

        customizable:
          form.customizable,

        categoryId:
          form.categoryId,

        thumbnailUrl:
          form.thumbnailUrl,

        backgroundImageUrl:
          form.backgroundImageUrl,

        images:
          form.images,

        variants:
          form.variants,
      };

      console.log(
        "Saving product:",
        payload
      );

      if (editingId !== null) {
        await adminUpdateProduct(
          token,
          editingId,
          payload
        );
      } else {
        await adminCreateProduct(
          token,
          payload
        );
      }

      /*
       * Reset form after successful save.
       */

      setForm({
        ...emptyForm,
      });

      setEditingId(null);

      /*
       * Reload products and categories.
       */

      await load();
    } catch (err: any) {
      console.error(
        "Product save error:",
        err
      );

      setError(
        err?.message ||
          "Failed to save product."
      );
    } finally {
      setSaving(false);
    }
  }

  /* =========================================================
     EDIT PRODUCT
  ========================================================= */

  function handleEdit(
    product: Product
  ) {
    setEditingId(product.id);

    setError("");

    const productType =
      product.productType || "";

    setForm({
      name:
        product.name || "",

      description:
        product.description || "",

      productType:
        productType,

      price:
        Number(product.price) || 0,

      salePrice:
        product.salePrice === null ||
        product.salePrice === undefined
          ? undefined
          : Number(product.salePrice),

      sku:
        product.sku || "",

      brand:
        product.brand || "",

      stockQuantity:
        Number(product.stockQuantity) || 0,

      featured:
        Boolean(product.featured),

      active:
        product.active !== false,

      customizable:
        Boolean(product.customizable),

      categoryId:
        product.category?.id,

      thumbnailUrl:
        product.thumbnailUrl || "",

      backgroundImageUrl:
        product.backgroundImageUrl || "",

      images:
        Array.isArray(product.images)
          ? product.images
          : [],

      variants:
        Array.isArray(product.variants)
          ? product.variants
          : [],
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  /* =========================================================
     DELETE PRODUCT
  ========================================================= */

  async function handleDelete(
    id: number
  ) {
    if (!token) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this product?"
    );

    if (!confirmed) {
      return;
    }

    try {
      setError("");

      await adminDeleteProduct(
        token,
        id
      );

      await load();
    } catch (err: any) {
      console.error(
        "Delete product error:",
        err
      );

      setError(
        err?.message ||
          "Failed to delete product."
      );
    }
  }

  /* =========================================================
     RESET
  ========================================================= */

  function resetForm() {
    setForm({
      ...emptyForm,
    });

    setEditingId(null);

    setError("");
  }

  /* =========================================================
     ADMIN SESSION
  ========================================================= */

  if (!checked || !token) {
    return <Loading />;
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="flex min-h-screen">

      {/* =====================================================
          SIDEBAR
      ===================================================== */}

      <AdminSidebar />

      {/* =====================================================
          MAIN CONTENT
      ===================================================== */}

      <div className="flex-1 p-6 md:p-8 bg-sandal min-h-screen">

        <h1 className="ns-section-title mb-6">
          Products
        </h1>

        {/* ===================================================
            ERROR MESSAGE
        =================================================== */}

        {error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* ===================================================
            PRODUCT FORM
        =================================================== */}

        <div className="ns-card p-6 mb-8 max-w-5xl">

          {/* FORM TITLE */}

          <div className="flex items-center justify-between mb-6">

            <h2 className="text-lg font-heading font-semibold text-brand-900">
              {editingId !== null
                ? "Edit Product"
                : "Add Product"}
            </h2>

            {editingId !== null && (
              <button
                type="button"
                onClick={resetForm}
                className="text-sm text-gray-500 hover:text-black"
              >
                Cancel Edit
              </button>
            )}

          </div>

          {/* =================================================
              PRODUCT NAME
          ================================================= */}

          <label className="ns-label">
            Product Name
          </label>

          <input
            type="text"
            className="ns-input mb-5"
            placeholder="Example: Namma Store Premium Mug"
            value={form.name}
            onChange={(e) =>
              setForm({
                ...form,
                name: e.target.value,
              })
            }
          />

          {/* =================================================
              DESCRIPTION
          ================================================= */}

          <label className="ns-label">
            Description
          </label>

          <textarea
            rows={4}
            className="ns-input mb-5"
            placeholder="Describe your product..."
            value={form.description}
            onChange={(e) =>
              setForm({
                ...form,
                description:
                  e.target.value,
              })
            }
          />

          {/* =================================================
              PRODUCT TYPE + CATEGORY
          ================================================= */}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">

            {/* PRODUCT TYPE */}

            <div>

              <label className="ns-label">
                Product Type
              </label>

              <select
                value={form.productType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    productType:
                      e.target.value,
                  })
                }
                className="ns-input"
              >

                <option value="">
                  Select Product Type
                </option>

                {PRODUCT_TYPES.map(
                  (type) => (
                    <option
                      key={type}
                      value={type}
                    >
                      {type}
                    </option>
                  )
                )}

              </select>

              <p className="text-xs text-gray-400 mt-1">
                Example: Mug, T-Shirt, Hoodie, Bottle
              </p>

            </div>

            {/* CATEGORY */}

            <div>

              <label className="ns-label">
                Category
              </label>

              <select
                value={
                  form.categoryId ?? ""
                }
                onChange={(e) => {

                  const value =
                    e.target.value;

                  setForm({
                    ...form,
                    categoryId:
                      value
                        ? Number(value)
                        : undefined,
                  });
                }}
                className="ns-input"
              >

                <option value="">
                  Select Category
                </option>

                {categories
                  .filter(
                    (category) =>
                      category.active !== false
                  )
                  .map(
                    (category) => (
                      <option
                        key={category.id}
                        value={category.id}
                      >
                        {category.name}
                      </option>
                    )
                  )}

              </select>

              {categories.length === 0 && (
                <p className="text-xs text-red-500 mt-1">
                  No categories loaded. Check the browser console.
                </p>
              )}

            </div>

          </div>

          {/* =================================================
              BRAND
          ================================================= */}

          <label className="ns-label">
            Brand
          </label>

          <input
            type="text"
            className="ns-input mb-5"
            placeholder="Optional"
            value={form.brand}
            onChange={(e) =>
              setForm({
                ...form,
                brand: e.target.value,
              })
            }
          />

          {/* =================================================
              PRICE / DISCOUNT / STOCK
          ================================================= */}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">

            {/* PRICE */}

            <div>

              <label className="ns-label">
                Price (₹)
              </label>

              <input
                type="number"
                min="0"
                className="ns-input"
                value={form.price}
                onChange={(e) =>
                  setForm({
                    ...form,
                    price:
                      Number(
                        e.target.value
                      ),
                  })
                }
              />

            </div>

            {/* DISCOUNT PRICE */}

            <div>

              <label className="ns-label">
                Discount Price (₹)
              </label>

              <input
                type="number"
                min="0"
                className="ns-input"
                placeholder="Optional"
                value={
                  form.salePrice ??
                  ""
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    salePrice:
                      e.target.value === ""
                        ? undefined
                        : Number(
                            e.target.value
                          ),
                  })
                }
              />

            </div>

            {/* STOCK */}

            <div>

              <label className="ns-label">
                Stock Quantity
              </label>

              <input
                type="number"
                min="0"
                className="ns-input"
                value={
                  form.stockQuantity
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    stockQuantity:
                      Math.max(
                        0,
                        Number(
                          e.target.value
                        )
                      ),
                  })
                }
              />

            </div>

          </div>

          {/* =================================================
              SKU
          ================================================= */}

          <label className="ns-label">
            SKU
          </label>

          <input
            type="text"
            className="ns-input mb-5"
            placeholder="Optional"
            value={form.sku}
            onChange={(e) =>
              setForm({
                ...form,
                sku: e.target.value,
              })
            }
          />

          {/* =================================================
              PRODUCT IMAGES
          ================================================= */}

          <div className="mb-6">

            <label className="ns-label">
              Product Images
            </label>

            <MultiImageUploader
              thumbnailUrl={
                form.thumbnailUrl
              }
              images={
                form.images
              }
              onChange={({
                thumbnailUrl,
                images,
              }) =>
                setForm({
                  ...form,
                  thumbnailUrl:
                    thumbnailUrl || "",
                  images:
                    images || [],
                })
              }
            />

            <p className="text-xs text-gray-400 mt-2">
              The first image is used as the main product image.
            </p>

          </div>

          {/* =================================================
              VARIANTS
          ================================================= */}

          <div className="mb-6">

            <label className="ns-label">
              Variants
            </label>

            <p className="text-xs text-gray-400 mb-2">
              Enter variants separated by commas.
              Example: Small, Medium, Large
            </p>

            <input
              type="text"
              className="ns-input"
              placeholder="Small, Medium, Large"
              value={
                form.variants.join(
                  ", "
                )
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  variants:
                    e.target.value
                      .split(",")
                      .map(
                        (value) =>
                          value.trim()
                      )
                      .filter(Boolean),
                })
              }
            />

          </div>

          {/* =================================================
              CHECKBOXES
          ================================================= */}

          <div className="flex flex-wrap gap-6 mb-6">

            {/* FEATURED */}

            <label className="flex items-center gap-2 text-sm">

              <input
                type="checkbox"
                checked={
                  form.featured
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    featured:
                      e.target.checked,
                  })
                }
              />

              Featured

            </label>

            {/* ACTIVE */}

            <label className="flex items-center gap-2 text-sm">

              <input
                type="checkbox"
                checked={
                  form.active
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    active:
                      e.target.checked,
                  })
                }
              />

              Active

            </label>

            {/* CUSTOMIZABLE */}

            <label className="flex items-center gap-2 text-sm">

              <input
                type="checkbox"
                checked={
                  form.customizable
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    customizable:
                      e.target.checked,
                  })
                }
              />

              Customizable

            </label>

          </div>

          {/* =================================================
              SAVE BUTTON
          ================================================= */}

          <div className="flex gap-3">

            <button
              type="button"
              onClick={
                handleSave
              }
              disabled={saving}
              className="ns-btn-primary"
            >
              {saving
                ? "Saving..."
                : editingId !== null
                ? "Save Changes"
                : "Save Product"}
            </button>

            {editingId !== null && (
              <button
                type="button"
                onClick={
                  resetForm
                }
                disabled={saving}
                className="ns-btn-outline"
              >
                Cancel
              </button>
            )}

          </div>

        </div>

        {/* ===================================================
            PRODUCT TABLE
        =================================================== */}

        {loading ? (
          <Loading />
        ) : (
          <AdminTable
            headers={[
              "Image",
              "Name",
              "Product Type",
              "Category",
              "Price",
              "Stock",
              "Customizable",
              "Actions",
            ]}
            rows={products.map(
              (product) => [

                /* IMAGE */

                <SafeImage
                  key={`image-${product.id}`}
                  src={product.thumbnailUrl}
                  alt={product.name}
                  className="h-12 w-12 rounded-md border border-brand-100"
                />,

                /* NAME */

                product.name,

                /* PRODUCT TYPE */

                product.productType ||
                  "-",

                /* CATEGORY */

                product.category
                  ?.name ||
                  "-",

                /* PRICE */

                `₹${
                  product.effectivePrice ??
                  product.salePrice ??
                  product.price
                }`,

                /* STOCK */

                product.stockQuantity,

                /* CUSTOMIZABLE */

                product.customizable
                  ? "Yes"
                  : "No",

                /* ACTIONS */

                <div
                  key={`actions-${product.id}`}
                  className="flex gap-3"
                >

                  <button
                    type="button"
                    onClick={() =>
                      handleEdit(
                        product
                      )
                    }
                    className="text-brand-700 hover:text-brand-900 text-sm font-medium"
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleDelete(
                        product.id
                      )
                    }
                    className="text-red-600 text-sm"
                  >
                    Delete
                  </button>

                </div>,
              ]
            )}
          />
        )}

      </div>
    </div>
  );
}