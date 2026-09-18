"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getCustomizableProduct,
  addToCart,
  uploadFile,
  resolveImageUrl,
} from "../../../api";
import { Loading, useAuth, useCart } from "../../../components";
import type { CustomizableProduct } from "../../../types";

// Admin decides which options are on via `enabledOptions`, a comma-separated
// string like "TEXT,IMAGE,COLOR,SIZE,PRINT_POSITION" set in /admin/customize,
// and which color/size choices are offered via `availableColors`/`availableSizes`.

const PRINT_POSITIONS = ["Front", "Back", "Left Sleeve", "Right Sleeve"];

// Rough on-canvas placement for the live preview overlay - good enough to
// show the customer roughly where their text/design will sit, not a
// pixel-accurate mockup.
const POSITION_STYLES: Record<string, React.CSSProperties> = {
  Front: { top: "40%", left: "50%", transform: "translate(-50%, -50%)" },
  Back: { top: "30%", left: "50%", transform: "translate(-50%, -50%)" },
  "Left Sleeve": { top: "55%", left: "20%", transform: "translate(-50%, -50%)" },
  "Right Sleeve": { top: "55%", left: "80%", transform: "translate(-50%, -50%)" },
};

export default function CustomizeConfiguratorPage() {
  const params = useParams();
  const router = useRouter();
  const slug = String(params.slug);
  const { appUser, loading: authLoading } = useAuth();
  const { refreshCart } = useCart();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [product, setProduct] = useState<CustomizableProduct | null>(null);
  const [loading, setLoading] = useState(true);

  const [customText, setCustomText] = useState("");
  const [customImageUrl, setCustomImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [printPosition, setPrintPosition] = useState("Front");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    getCustomizableProduct(slug)
      .then((p) => {
        setProduct(p);
        setQuantity(p.minQuantity || 1);
        const colors = (p.availableColors || "").split(",").map((c) => c.trim()).filter(Boolean);
        if (colors.length) setColor(colors[0]);
        const sizes = (p.availableSizes || "").split(",").map((s) => s.trim()).filter(Boolean);
        if (sizes.length) setSize(sizes[0]);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading || authLoading) return <Loading />;
  if (!product) return <p className="text-gray-500">Customizable product not found.</p>;

  const options = (product.enabledOptions || "").split(",").map((o) => o.trim());
  const showText = options.includes("TEXT");
  const showImage = options.includes("IMAGE");
  const showColor = options.includes("COLOR");
  const showSize = options.includes("SIZE");
  const showPrintPosition = options.includes("PRINT_POSITION");

  const colorChoices = (product.availableColors || "").split(",").map((c) => c.trim()).filter(Boolean);
  const sizeChoices = (product.availableSizes || "").split(",").map((s) => s.trim()).filter(Boolean);

  const outOfStock = product.stock <= 0;
  const estimatedPrice = product.basePrice * quantity;

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    setUploading(true);
    try {
      const url = await uploadFile(file, "designs");
      setCustomImageUrl(url);
    } catch (err: any) {
      setUploadError(err.message ?? "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleAddToCart(buyNow: boolean) {
    if (!appUser) {
      router.push("/login");
      return;
    }
    setError("");
    setAdding(true);
    try {
      await addToCart({
        userId: appUser.id,
        customizableProductId: product!.id,
        quantity,
        customText: showText && customText ? customText : undefined,
        customImageUrl: showImage && customImageUrl ? customImageUrl : undefined,
        selectedColor: showColor && color ? color : undefined,
        selectedSize: showSize && size ? size : undefined,
        printPosition: showPrintPosition ? printPosition : undefined,
      });
      await refreshCart();
      router.push(buyNow ? "/checkout" : "/cart");
    } catch (e: any) {
      setError(e.message ?? "Couldn't add to cart.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-8">
      {/* ---- Live preview ---- */}
      <div>
        <div className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolveImageUrl(product.imageUrl)}
              alt={product.name}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">No image</div>
          )}

          {showImage && customImageUrl && (
            <div
              className="absolute w-20 h-20 border-2 border-white shadow-md rounded overflow-hidden bg-white/70"
              style={POSITION_STYLES[printPosition] || POSITION_STYLES.Front}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageUrl(customImageUrl)}
                alt="Your design"
                className="w-full h-full object-contain"
              />
            </div>
          )}

          {showText && customText && (
            <div
              className="absolute px-2 py-1 bg-white/80 rounded text-sm font-medium text-gray-900 max-w-[80%] text-center"
              style={
                showImage && customImageUrl
                  ? { top: "72%", left: "50%", transform: "translate(-50%, -50%)" }
                  : POSITION_STYLES[printPosition] || POSITION_STYLES.Front
              }
            >
              {customText}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">
          Preview is approximate — the print team will confirm exact placement before production.
        </p>
      </div>

      {/* ---- Options ---- */}
      <div>
        <h1 className="text-2xl font-bold">{product.name}</h1>
        <p className="text-orange-700 font-semibold text-xl mt-2">Base price: ₹{product.basePrice}</p>
        {outOfStock && <p className="text-red-600 text-sm mt-1">Currently out of stock</p>}

        {showText && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Custom Text</label>
            <input
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
              placeholder="e.g. Happy Birthday Ravi!"
              maxLength={60}
            />
          </div>
        )}

        {showImage && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Upload Design / Logo</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:bg-orange-700 file:text-white file:text-sm hover:file:bg-orange-800"
            />
            {uploading && <p className="text-sm text-gray-500 mt-1">Uploading...</p>}
            {uploadError && <p className="text-sm text-red-600 mt-1">{uploadError}</p>}
            {customImageUrl && !uploading && (
              <p className="text-sm text-green-700 mt-1">✓ Design uploaded</p>
            )}
          </div>
        )}

        {showColor && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
            {colorChoices.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {colorChoices.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`px-3 py-1.5 rounded border text-sm ${
                      color === c ? "border-orange-700 bg-orange-50 text-orange-800" : "border-gray-300 text-gray-700"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            ) : (
              <input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2"
                placeholder="e.g. Red"
              />
            )}
          </div>
        )}

        {showSize && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
            {sizeChoices.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {sizeChoices.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSize(s)}
                    className={`px-3 py-1.5 rounded border text-sm ${
                      size === s ? "border-orange-700 bg-orange-50 text-orange-800" : "border-gray-300 text-gray-700"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <input
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2"
                placeholder="e.g. M"
              />
            )}
          </div>
        )}

        {showPrintPosition && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Print Position</label>
            <select
              value={printPosition}
              onChange={(e) => setPrintPosition(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
            >
              {PRINT_POSITIONS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
          <input
            type="number"
            min={product.minQuantity}
            max={Math.min(product.maxQuantity, product.stock)}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="border border-gray-300 rounded w-24 px-2 py-1"
          />
          <span className="text-sm text-gray-500 ml-2">
            (min {product.minQuantity}, max {product.maxQuantity}, {product.stock} in stock)
          </span>
        </div>

        <p className="mt-4 font-semibold">Estimated price: ₹{estimatedPrice.toFixed(2)}</p>

        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

        <div className="flex gap-3 mt-6">
          <button
            disabled={outOfStock || adding || uploading}
            onClick={() => handleAddToCart(false)}
            className="bg-orange-700 disabled:bg-gray-300 text-white px-6 py-3 rounded-lg"
          >
            {adding ? "Adding..." : "Add Customized Product to Cart"}
          </button>
          <button
            disabled={outOfStock || adding || uploading}
            onClick={() => handleAddToCart(true)}
            className="border border-orange-700 disabled:border-gray-300 disabled:text-gray-300 text-orange-700 px-6 py-3 rounded-lg"
          >
            Buy Now
          </button>
        </div>
      </div>
    </div>
  );
}
