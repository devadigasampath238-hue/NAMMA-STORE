"use client";

// ===========================================================
// /admin/serviceability
//
// Where Namma Store delivers. The tables start EMPTY - no
// state is seeded, not even Karnataka - so whatever is here
// is what the admin configured.
//
// Two ways to cover an area:
//   - a pincode range on a state (560000-560110), good for
//     broad coverage in one row
//   - individual pincode rows, which override the state and
//     can carry their own charge and ETA
// ===========================================================

import { useCallback, useEffect, useState } from "react";
import {
  adminCreateDeliveryPincode,
  adminCreateDeliveryState,
  adminDeleteDeliveryPincode,
  adminDeleteDeliveryState,
  adminGetDeliveryPincodes,
  adminGetDeliveryStates,
  adminUpdateDeliveryPincode,
  adminUpdateDeliveryState,
} from "../../../api";
import { AdminSidebar, useAdminSession } from "../../../components";
import type { DeliveryPincode, DeliveryState } from "../../../types";

const input =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200";

export default function AdminServiceabilityPage() {
  const { token, checked } = useAdminSession();

  const [tab, setTab] = useState<"states" | "pincodes">("states");
  const [states, setStates] = useState<DeliveryState[]>([]);
  const [pincodes, setPincodes] = useState<DeliveryPincode[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [stateForm, setStateForm] = useState({
    name: "",
    deliveryCharge: "",
    estimatedMinDays: "2",
    estimatedMaxDays: "5",
    pincodeRangeStart: "",
    pincodeRangeEnd: "",
  });

  const [pinForm, setPinForm] = useState({
    pincode: "",
    stateId: "",
    city: "",
    deliveryCharge: "",
    estimatedMinDays: "",
    estimatedMaxDays: "",
  });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [s, p] = await Promise.all([
        adminGetDeliveryStates(token),
        adminGetDeliveryPincodes(token, search || undefined),
      ]);
      setStates(s);
      setPincodes(p);
    } catch (e: any) {
      setError(e?.message ?? "Could not load delivery settings.");
    } finally {
      setLoading(false);
    }
  }, [token, search]);

  useEffect(() => {
    load();
  }, [load]);

  /** "" -> undefined, so a blank field means "inherit", not "zero". */
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

  async function addState(e: React.FormEvent) {
    e.preventDefault();
    if (!token || busy) return;
    setBusy(true);
    setError("");
    try {
      await adminCreateDeliveryState(token, {
        name: stateForm.name,
        deliveryCharge: num(stateForm.deliveryCharge),
        estimatedMinDays: num(stateForm.estimatedMinDays),
        estimatedMaxDays: num(stateForm.estimatedMaxDays),
        pincodeRangeStart: stateForm.pincodeRangeStart || null,
        pincodeRangeEnd: stateForm.pincodeRangeEnd || null,
      });
      setStateForm({
        name: "",
        deliveryCharge: "",
        estimatedMinDays: "2",
        estimatedMaxDays: "5",
        pincodeRangeStart: "",
        pincodeRangeEnd: "",
      });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Could not add that state.");
    } finally {
      setBusy(false);
    }
  }

  async function addPincode(e: React.FormEvent) {
    e.preventDefault();
    if (!token || busy) return;
    setBusy(true);
    setError("");
    try {
      await adminCreateDeliveryPincode(token, {
        pincode: pinForm.pincode,
        stateId: pinForm.stateId ? Number(pinForm.stateId) : undefined,
        city: pinForm.city || undefined,
        deliveryCharge: num(pinForm.deliveryCharge),
        estimatedMinDays: num(pinForm.estimatedMinDays),
        estimatedMaxDays: num(pinForm.estimatedMaxDays),
      });
      setPinForm({
        pincode: "",
        stateId: pinForm.stateId,
        city: "",
        deliveryCharge: "",
        estimatedMinDays: "",
        estimatedMaxDays: "",
      });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Could not add that pincode.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleState(s: DeliveryState) {
    if (!token) return;
    try {
      await adminUpdateDeliveryState(token, s.id, { active: !s.active });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Could not update that state.");
    }
  }

  async function togglePincode(p: DeliveryPincode) {
    if (!token) return;
    try {
      await adminUpdateDeliveryPincode(token, p.id, { active: !p.active });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Could not update that pincode.");
    }
  }

  async function removeState(s: DeliveryState) {
    if (!token) return;
    try {
      await adminDeleteDeliveryState(token, s.id);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Could not delete that state.");
    }
  }

  async function removePincode(p: DeliveryPincode) {
    if (!token) return;
    try {
      await adminDeleteDeliveryPincode(token, p.id);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Could not delete that pincode.");
    }
  }

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Checking your session…
      </div>
    );
  }
  if (!token) return null;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AdminSidebar />

      <div className="flex-1 p-4 md:p-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Delivery &amp; Serviceability</h1>
          <p className="mt-1 text-sm text-slate-500">
            Nothing is delivered until you add it here. Customers checking a
            pincode you have not configured are told delivery is not available
            yet.
          </p>
        </header>

        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mb-5 flex gap-2 border-b border-slate-200">
          {(["states", "pincodes"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize transition ${
                tab === t
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t} ({t === "states" ? states.length : pincodes.length})
            </button>
          ))}
        </div>

        {tab === "states" ? (
          <>
            <form
              onSubmit={addState}
              className="mb-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-3 lg:grid-cols-6"
            >
              <label className="sm:col-span-3 lg:col-span-2">
                <span className="mb-1 block text-xs font-medium text-slate-600">State name</span>
                <input
                  required
                  value={stateForm.name}
                  onChange={(e) => setStateForm({ ...stateForm, name: e.target.value })}
                  placeholder="Karnataka"
                  className={input}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-600">Charge (₹)</span>
                <input
                  type="number"
                  value={stateForm.deliveryCharge}
                  onChange={(e) => setStateForm({ ...stateForm, deliveryCharge: e.target.value })}
                  placeholder="default"
                  className={input}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-600">Min days</span>
                <input
                  type="number"
                  value={stateForm.estimatedMinDays}
                  onChange={(e) => setStateForm({ ...stateForm, estimatedMinDays: e.target.value })}
                  className={input}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-600">Max days</span>
                <input
                  type="number"
                  value={stateForm.estimatedMaxDays}
                  onChange={(e) => setStateForm({ ...stateForm, estimatedMaxDays: e.target.value })}
                  className={input}
                />
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:bg-slate-400"
                >
                  Add state
                </button>
              </div>

              <label className="sm:col-span-3">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  Pincode range start (optional)
                </span>
                <input
                  value={stateForm.pincodeRangeStart}
                  onChange={(e) =>
                    setStateForm({ ...stateForm, pincodeRangeStart: e.target.value })
                  }
                  placeholder="560000"
                  className={input}
                />
              </label>
              <label className="sm:col-span-3">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  Pincode range end (optional)
                </span>
                <input
                  value={stateForm.pincodeRangeEnd}
                  onChange={(e) => setStateForm({ ...stateForm, pincodeRangeEnd: e.target.value })}
                  placeholder="560110"
                  className={input}
                />
              </label>
              <p className="text-xs text-slate-400 sm:col-span-3 lg:col-span-6">
                A range covers every pincode between the two values. Leave both
                blank to serve only the individual pincodes you add.
              </p>
            </form>

            {loading ? (
              <div className="h-40 animate-pulse rounded-xl bg-slate-200" />
            ) : states.length === 0 ? (
              <Empty what="states" />
            ) : (
              <ul className="space-y-2">
                {states.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">
                        {s.name}{" "}
                        <span
                          className={`ml-1 rounded-full px-2 py-0.5 text-xs ${
                            s.active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {s.active ? "Delivering" : "Paused"}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {s.deliveryCharge != null ? `₹${s.deliveryCharge}` : "default charge"}
                        {" · "}
                        {s.estimatedMinDays}–{s.estimatedMaxDays} days
                        {s.pincodeRangeStart && s.pincodeRangeEnd
                          ? ` · ${s.pincodeRangeStart}–${s.pincodeRangeEnd}`
                          : " · no range"}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleState(s)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
                    >
                      {s.active ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => removeState(s)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <form
              onSubmit={addPincode}
              className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-3 lg:grid-cols-6"
            >
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-600">Pincode</span>
                <input
                  required
                  maxLength={6}
                  value={pinForm.pincode}
                  onChange={(e) =>
                    setPinForm({ ...pinForm, pincode: e.target.value.replace(/\D/g, "") })
                  }
                  placeholder="560001"
                  className={input}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-600">State</span>
                <select
                  value={pinForm.stateId}
                  onChange={(e) => setPinForm({ ...pinForm, stateId: e.target.value })}
                  className={input}
                >
                  <option value="">—</option>
                  {states.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-600">City</span>
                <input
                  value={pinForm.city}
                  onChange={(e) => setPinForm({ ...pinForm, city: e.target.value })}
                  className={input}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-600">Charge (₹)</span>
                <input
                  type="number"
                  value={pinForm.deliveryCharge}
                  onChange={(e) => setPinForm({ ...pinForm, deliveryCharge: e.target.value })}
                  placeholder="inherit"
                  className={input}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-600">Days min–max</span>
                <div className="flex gap-1">
                  <input
                    type="number"
                    value={pinForm.estimatedMinDays}
                    onChange={(e) => setPinForm({ ...pinForm, estimatedMinDays: e.target.value })}
                    className={input}
                  />
                  <input
                    type="number"
                    value={pinForm.estimatedMaxDays}
                    onChange={(e) => setPinForm({ ...pinForm, estimatedMaxDays: e.target.value })}
                    className={input}
                  />
                </div>
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:bg-slate-400"
                >
                  Add pincode
                </button>
              </div>
            </form>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search pincode, city or state"
              className={`mb-4 max-w-sm ${input}`}
            />

            {loading ? (
              <div className="h-40 animate-pulse rounded-xl bg-slate-200" />
            ) : pincodes.length === 0 ? (
              <Empty what="pincodes" />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Pincode</th>
                      <th className="px-4 py-3">State</th>
                      <th className="px-4 py-3">City</th>
                      <th className="px-4 py-3">Charge</th>
                      <th className="px-4 py-3">ETA</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pincodes.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-3 font-medium">{p.pincode}</td>
                        <td className="px-4 py-3">{p.state?.name ?? "—"}</td>
                        <td className="px-4 py-3">{p.city ?? "—"}</td>
                        <td className="px-4 py-3">
                          {p.deliveryCharge != null ? `₹${p.deliveryCharge}` : "inherit"}
                        </td>
                        <td className="px-4 py-3">
                          {p.estimatedMinDays != null && p.estimatedMaxDays != null
                            ? `${p.estimatedMinDays}–${p.estimatedMaxDays}d`
                            : "inherit"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${
                              p.active
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {p.active ? "Active" : "Paused"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => togglePincode(p)}
                              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                            >
                              {p.active ? "Pause" : "Resume"}
                            </button>
                            <button
                              onClick={() => removePincode(p)}
                              className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Empty({ what }: { what: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="font-medium text-slate-700">No {what} configured</p>
      <p className="mt-1 text-sm text-slate-500">
        Until you add some, every pincode check tells the customer delivery is
        not available in their area yet.
      </p>
    </div>
  );
}
