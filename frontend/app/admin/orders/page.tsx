"use client";

import { useEffect, useState } from "react";
import { adminGetOrders, adminUpdateOrderStatus, adminUpdateReturnStatus } from "../../../api";
import { AdminSidebar, AdminTable, Loading, useAdminSession } from "../../../components";
import type { Order } from "../../../types";

// Matches OrderStatus in the backend (Orders.java). Legacy PENDING/PAID
// rows are migrated to PLACED/CONFIRMED by database/002_*.sql.
const STATUSES = [
  "PLACED",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];

export default function AdminOrdersPage() {
  const { token, checked } = useAdminSession();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    setOrders(await adminGetOrders(token));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!checked || !token) return <Loading />;

  return (
    <div className="flex">
      <AdminSidebar />
      <div className="flex-1 p-6 md:p-8 bg-sandal min-h-screen">
        <h1 className="text-2xl font-bold mb-6">Orders</h1>
        {loading ? (
          <Loading />
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div key={order.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                    className="font-medium text-left"
                  >
                    Order #{order.orderNumber ?? order.id} — ₹{Number(order.totalAmount).toLocaleString("en-IN")}
                    {order.returnStatus && (
                      <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        Return: {order.returnStatus}
                      </span>
                    )}
                  </button>
                  <select
                    value={order.status}
                    onChange={async (e) => {
                      await adminUpdateOrderStatus(token, order.id, e.target.value);
                      load();
                    }}
                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                {expanded === order.id && (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <div className="mb-3 grid gap-1 text-sm text-gray-600 sm:grid-cols-2">
                      <p>
                        <span className="font-medium text-gray-800">Customer:</span>{" "}
                        {order.customerName || "-"}
                        {order.customerPhone ? ` · ${order.customerPhone}` : ""}
                      </p>
                      <p>
                        <span className="font-medium text-gray-800">Payment:</span>{" "}
                        {order.paymentMethod || "COD"} ({order.paymentStatus || "PENDING"})
                      </p>
                      <p className="sm:col-span-2">
                        <span className="font-medium text-gray-800">Shipping:</span>{" "}
                        {order.shippingAddressSnapshot || "-"}
                      </p>
                      <p className="sm:col-span-2 text-gray-500">
                        Subtotal ₹{order.subtotal} · Discount ₹{order.discountAmount} · Delivery ₹
                        {order.deliveryCharge} · <span className="font-medium text-gray-800">Total ₹{order.totalAmount}</span>
                      </p>
                    </div>
                    {order.couponCode && (
                      <p className="text-sm text-gray-500 mb-2">Coupon: {order.couponCode}</p>
                    )}
                    {order.returnStatus && (
                      <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm">
                        <p className="mb-2">
                          <span className="font-medium text-amber-900">Return requested</span>
                          {order.returnReason && <> — reason: "{order.returnReason}"</>}
                        </p>
                        {order.returnStatus === "REQUESTED" && (
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                await adminUpdateReturnStatus(token, order.id, "APPROVED");
                                load();
                              }}
                              className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white"
                            >
                              Approve return
                            </button>
                            <button
                              onClick={async () => {
                                await adminUpdateReturnStatus(token, order.id, "REJECTED");
                                load();
                              }}
                              className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white"
                            >
                              Reject return
                            </button>
                          </div>
                        )}
                        {order.returnStatus === "APPROVED" && (
                          <button
                            onClick={async () => {
                              await adminUpdateReturnStatus(token, order.id, "COMPLETED");
                              load();
                            }}
                            className="rounded bg-brand-700 px-3 py-1 text-xs font-medium text-white"
                          >
                            Mark return completed
                          </button>
                        )}
                      </div>
                    )}
                    <AdminTable
                      headers={["Product", "Qty", "Customization", "Price"]}
                      rows={order.items.map((item) => [
                        item.productName,
                        item.quantity,
                        <div key={item.id} className="text-sm">
                          <div>
                            {[
                              item.customText && `Text: "${item.customText}"`,
                              item.selectedColor && `Color: ${item.selectedColor}`,
                              item.selectedSize && `Size: ${item.selectedSize}`,
                              item.printPosition && `Position: ${item.printPosition}`,
                            ]
                              .filter(Boolean)
                              .join(" · ") || (item.customImageUrl ? "" : "-")}
                          </div>
                          {item.customImageUrl && (
                            <a
                              href={item.customImageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 mt-1 text-orange-700 underline"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.customImageUrl}
                                alt="Uploaded design"
                                className="w-8 h-8 object-cover rounded border border-gray-200"
                              />
                              View design
                            </a>
                          )}
                        </div>,
                        `₹${item.finalPrice}`,
                      ])}
                    />
                  </div>
                )}
              </div>
            ))}
            {orders.length === 0 && <p className="text-gray-500">No orders yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
