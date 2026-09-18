"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminGetDashboard, adminGetOrders } from "../../api";
import { AdminSidebar, StatCard, useAdminSession } from "../../components";
import {
  ErrorState,
  SkeletonBlock,
  OrderStatusBadge,
  Price,
  formatDate,
  friendlyError,
} from "../../ui";
import type { DashboardStats, Order } from "../../types";

export default function AdminDashboardPage() {
  const { token, checked } = useAdminSession();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      // Both charts below are built from REAL orders. Nothing is invented:
      // if there are no orders, the charts say so rather than drawing a
      // pleasant-looking fake trend.
      const [dashboard, allOrders] = await Promise.all([
        adminGetDashboard(token),
        adminGetOrders(token).catch(() => [] as Order[]),
      ]);
      setStats(dashboard);
      setOrders(allOrders);
    } catch (e) {
      setError(friendlyError(e, "Could not load dashboard statistics."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  /* ---- last 14 days of real order data ---- */
  const series = useMemo(() => {
    const days: Array<{ label: string; revenue: number; orders: number }> = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 13; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      days.push({
        label: day.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        revenue: 0,
        orders: 0,
      });
    }

    const firstDay = new Date(today);
    firstDay.setDate(firstDay.getDate() - 13);

    for (const order of orders) {
      if (order.status === "CANCELLED") continue;
      const created = new Date(order.createdAt);
      if (Number.isNaN(created.getTime())) continue;
      created.setHours(0, 0, 0, 0);

      const index = Math.round(
        (created.getTime() - firstDay.getTime()) / (24 * 60 * 60 * 1000)
      );
      if (index >= 0 && index < days.length) {
        days[index].revenue += Number(order.totalAmount) || 0;
        days[index].orders += 1;
      }
    }
    return days;
  }, [orders]);

  const hasChartData = series.some((d) => d.orders > 0);
  const rupees = (v?: number) =>
    `₹${Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  if (!checked || !token) return <SkeletonBlock className="h-64 w-full" />;

  return (
    <div className="flex flex-col md:flex-row">
      <AdminSidebar />

      <div className="min-h-screen flex-1 bg-sandal p-4 md:p-8">
        <h1 className="ns-section-title mb-6">Dashboard</h1>

        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading || !stats ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-24" />
            ))}
          </div>
        ) : (
          <>
            <div className="ns-stagger grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
              <StatCard label="Total Sales" value={rupees(stats.revenue)} />
              <StatCard label="Orders" value={stats.totalOrders} />
              <StatCard label="Products" value={stats.totalProducts} />
              <StatCard label="Users" value={stats.totalUsers} />
              <StatCard label="Pending Orders" value={stats.pendingOrders} />
              <StatCard label="Completed" value={stats.completedOrders} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Categories" value={stats.totalCategories} />
              <StatCard label="Low Stock" value={stats.lowStockProducts} />
              <StatCard label="Out of Stock" value={stats.outOfStockProducts} />
              <StatCard label="Cancelled" value={stats.cancelledOrders} />
            </div>

            {/* ---- charts ---- */}
            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              <ChartCard title="Revenue — last 14 days" empty={!hasChartData}>
                <BarChart
                  data={series.map((d) => ({ label: d.label, value: d.revenue }))}
                  formatValue={rupees}
                />
              </ChartCard>

              <ChartCard title="Orders — last 14 days" empty={!hasChartData}>
                <BarChart
                  data={series.map((d) => ({ label: d.label, value: d.orders }))}
                  formatValue={(v) => String(Math.round(v ?? 0))}
                  accent="#7C2D12"
                />
              </ChartCard>
            </div>

            {/* ---- recent orders ---- */}
            <h2 className="ns-section-title mb-3 mt-8 !text-lg">Recent orders</h2>
            {stats.recentOrders.length === 0 ? (
              <p className="text-sm text-gray-500">No orders yet.</p>
            ) : (
              <div className="ns-card divide-y divide-brand-50">
                {stats.recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    href="/admin/orders"
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition hover:bg-brand-50/50"
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-brand-900">
                        #{order.orderNumber ?? order.id}
                      </span>
                      <span className="ml-2 text-sm text-gray-500">
                        {order.customerName || "Customer"} ·{" "}
                        {order.itemCount ?? order.items.length} item(s) ·{" "}
                        {formatDate(order.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <OrderStatusBadge status={order.status} />
                      <Price value={order.totalAmount} className="font-semibold text-brand-800" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="ns-card p-5">
      <h3 className="mb-4 font-heading text-sm font-semibold uppercase tracking-wide text-brand-900">
        {title}
      </h3>
      {empty ? (
        <p className="py-10 text-center text-sm text-gray-400">
          No orders in this period yet.
        </p>
      ) : (
        children
      )}
    </div>
  );
}

/**
 * Inline SVG bar chart. A charting library would be a heavy dependency for
 * two bar charts, and recharts is not installed in this project.
 */
function BarChart({
  data,
  formatValue,
  accent = "#E97A0C",
}: {
  data: Array<{ label: string; value: number }>;
  formatValue: (value: number) => string;
  accent?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const width = 520;
  const height = 180;
  const padding = { top: 10, bottom: 28, left: 8, right: 8 };
  const chartHeight = height - padding.top - padding.bottom;
  const slot = (width - padding.left - padding.right) / data.length;
  const barWidth = Math.max(6, slot * 0.55);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-44 w-full min-w-[420px]"
        role="img"
        aria-label={data.map((d) => `${d.label}: ${formatValue(d.value)}`).join(", ")}
      >
        {/* gridlines */}
        {[0, 0.5, 1].map((fraction) => (
          <line
            key={fraction}
            x1={padding.left}
            x2={width - padding.right}
            y1={padding.top + chartHeight * fraction}
            y2={padding.top + chartHeight * fraction}
            stroke="#f0e2d2"
            strokeWidth="1"
          />
        ))}

        {data.map((d, i) => {
          const barHeight = (d.value / max) * chartHeight;
          const x = padding.left + i * slot + (slot - barWidth) / 2;
          const y = padding.top + chartHeight - barHeight;
          return (
            <g key={d.label}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, d.value > 0 ? 2 : 0)}
                rx="3"
                fill={accent}
                opacity={0.85}
              >
                <title>{`${d.label}: ${formatValue(d.value)}`}</title>
              </rect>
              {/* label every other tick so they never overlap */}
              {i % 2 === 0 && (
                <text
                  x={x + barWidth / 2}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#9a8574"
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
