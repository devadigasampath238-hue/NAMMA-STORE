"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCustomizableProducts, resolveImageUrl } from "../../api";
import { Loading } from "../../components";
import type { CustomizableProduct } from "../../types";

export default function CustomizeListPage() {
  const [products, setProducts] = useState<CustomizableProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCustomizableProducts()
      .then(setProducts)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Customize Your Own</h1>
      <p className="text-gray-600 mb-6">
        Corporate gifts, personalized mugs, apparel and more — designed your way.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {products.map((p) => (
          <Link
            key={p.id}
            href={`/customize/${p.slug}`}
            className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition block"
          >
            <div className="aspect-square bg-gray-100">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveImageUrl(p.imageUrl)}
                  alt={p.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  No image
                </div>
              )}
            </div>
            <div className="p-3">
              <h3 className="font-medium">{p.name}</h3>
              <span className="text-orange-700 font-semibold">From ₹{p.basePrice}</span>
            </div>
          </Link>
        ))}
        {products.length === 0 && (
          <p className="text-gray-500 col-span-full">
            No customizable products yet — add some from /admin/customize.
          </p>
        )}
      </div>
    </div>
  );
}
