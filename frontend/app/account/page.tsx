"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getMyOrders,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  updateProfile,
  uploadProfilePhoto,
  deleteProfilePhoto,
  cancelOrder,
  requestReturn,
} from "../../api";
import { Loading, AddressCard, SafeImage, useAuth } from "../../components";
import { CancelOrderModal } from "../../delivery";
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  OrderStatusBadge,
  OrderStatusTimeline,
  UserIcon,
  CartIcon,
  HeartIcon,
  Price,
  formatDate,
  useToast,
  friendlyError,
} from "../../ui";
import type { Order, Address } from "../../types";

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "orders", label: "Orders" },
  { id: "addresses", label: "Addresses" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const emptyAddressForm = {
  fullName: "",
  phone: "",
  houseBuilding: "",
  street: "",
  area: "",
  city: "",
  state: "",
  pincode: "",
  landmark: "",
  isDefault: false,
};

function AccountPageInner() {
  const { appUser, loading: authLoading, signOut, refreshAppUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: toastError } = useToast();

  const tabFromUrl = (searchParams.get("tab") as TabId) || "profile";
  const [tab, setTab] = useState<TabId>(
    TABS.some((t) => t.id === tabFromUrl) ? tabFromUrl : "profile"
  );

  const [orders, setOrders] = useState<Order[]>([]);
  /** The order whose cancellation modal is open, or null. */
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState("");

  // profile
  const [profileForm, setProfileForm] = useState({ displayName: "", phone: "" });
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  // addresses
  const [formOpen, setFormOpen] = useState<"new" | number | null>(null);
  const [form, setForm] = useState(emptyAddressForm);
  const [savingAddress, setSavingAddress] = useState(false);

  // orders
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);

  useEffect(() => {
    setTab(TABS.some((t) => t.id === tabFromUrl) ? tabFromUrl : "profile");
  }, [tabFromUrl]);

  useEffect(() => {
    if (appUser) {
      setProfileForm({
        displayName: appUser.displayName ?? "",
        phone: appUser.phone ?? "",
      });
    }
  }, [appUser]);

  // Release the object URL when the preview changes, so blobs do not leak.
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const loadAll = useCallback(async (userId: number) => {
    setLoadingData(true);
    setDataError("");
    try {
      const [o, a] = await Promise.all([getMyOrders(userId), getAddresses(userId)]);
      setOrders(o);
      setAddresses(a);
    } catch (e) {
      setDataError(friendlyError(e, "We could not load your account details."));
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (appUser) loadAll(appUser.id);
  }, [appUser, loadAll]);

  function switchTab(next: TabId) {
    setTab(next);
    router.replace(`/account?tab=${next}`, { scroll: false });
  }

  /* ---------------- profile ---------------- */

  async function saveProfile() {
    if (!appUser) return;
    if (!profileForm.displayName.trim()) {
      toastError("Please enter your name.");
      return;
    }
    setSavingProfile(true);
    try {
      await updateProfile(appUser.id, {
        displayName: profileForm.displayName.trim(),
        phone: profileForm.phone.trim(),
      });
      await refreshAppUser();
      setEditingProfile(false);
      success("Profile updated");
    } catch (e) {
      toastError(friendlyError(e, "Could not save your profile."));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePhoto(file: File | undefined) {
    if (!file || !appUser) return;
    if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.type)) {
      toastError("Please choose a PNG, JPG or WEBP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toastError("That image is larger than 5MB.");
      return;
    }

    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoBusy(true);
    try {
      await uploadProfilePhoto(appUser.id, file);
      await refreshAppUser();
      success("Profile photo updated");
    } catch (e) {
      setPhotoPreview("");
      toastError(friendlyError(e, "Could not upload that photo."));
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePhoto() {
    if (!appUser) return;
    setPhotoBusy(true);
    try {
      await deleteProfilePhoto(appUser.id);
      setPhotoPreview("");
      await refreshAppUser();
      success("Profile photo removed");
    } catch (e) {
      toastError(friendlyError(e, "Could not remove that photo."));
    } finally {
      setPhotoBusy(false);
    }
  }

  /* ---------------- addresses ---------------- */

  async function saveAddress() {
    if (!appUser) return;
    if (!form.fullName.trim() || !form.phone.trim() || !form.city.trim() || !form.pincode.trim()) {
      toastError("Name, phone, city and PIN code are required.");
      return;
    }
    setSavingAddress(true);
    try {
      if (formOpen === "new") {
        await addAddress(appUser.id, form);
      } else if (typeof formOpen === "number") {
        await updateAddress(appUser.id, formOpen, form);
      }
      setFormOpen(null);
      setForm(emptyAddressForm);
      await loadAll(appUser.id);
      success("Address saved");
    } catch (e) {
      toastError(friendlyError(e, "Could not save that address."));
    } finally {
      setSavingAddress(false);
    }
  }

  async function removeAddress(addressId: number) {
    if (!appUser || !confirm("Delete this address?")) return;
    try {
      await deleteAddress(appUser.id, addressId);
      await loadAll(appUser.id);
      success("Address deleted");
    } catch (e) {
      toastError(friendlyError(e, "Could not delete that address."));
    }
  }

  async function makeDefault(addressId: number) {
    if (!appUser) return;
    try {
      await setDefaultAddress(appUser.id, addressId);
      await loadAll(appUser.id);
    } catch (e) {
      toastError(friendlyError(e, "Could not update your default address."));
    }
  }

  /* ---------------- orders ---------------- */

  // The browser confirm() dialog is gone. CancelOrderModal collects a reason
  // and comments over two steps; this just performs the call and refreshes.
  // The backend still decides whether the cancellation is allowed, so a race
  // against the order shipping surfaces as an error inside the modal.
  async function performCancel(
    orderId: number,
    payload: { reason: string; comments: string }
  ) {
    if (!appUser) return;
    await cancelOrder(orderId, payload);
    await loadAll(appUser.id);
    success("Order cancelled successfully.");
  }

  async function handleReturn(orderId: number) {
    if (!appUser) return;
    const reason = window.prompt("What's the reason for the return? (optional)") ?? undefined;
    try {
      await requestReturn(orderId, reason);
      await loadAll(appUser.id);
      success("Return requested — we'll review it shortly.");
    } catch (e) {
      toastError(friendlyError(e, "This order can no longer be returned."));
    }
  }

  /* ---------------- render ---------------- */

  if (authLoading) return <Loading />;

  if (!appUser) {
    return (
      <EmptyState
        title="Please sign in"
        message="Your profile, orders and addresses live here."
        actionLabel="Sign In"
        actionHref="/login"
        icon={<UserIcon className="h-9 w-9" />}
      />
    );
  }

  const avatarSrc = photoPreview || appUser.photoUrl || "";

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
      {/* ---------------- sidebar ---------------- */}
      <aside>
        <div className="ns-panel p-4">
          <div className="mb-4 flex items-center gap-3">
            <SafeImage
              src={avatarSrc}
              alt=""
              className="h-12 w-12 shrink-0 rounded-full border border-brand-100"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-brand-900">
                {appUser.displayName || "Namma customer"}
              </p>
              <p className="truncate text-xs text-gray-500">{appUser.email}</p>
            </div>
          </div>

          <nav className="flex gap-1 lg:flex-col" aria-label="Account sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => switchTab(t.id)}
                aria-current={tab === t.id}
                className={`flex-1 rounded-lg px-3 py-2 text-left text-sm font-medium transition lg:flex-none ${
                  tab === t.id
                    ? "bg-brand-600 text-white"
                    : "text-gray-700 hover:bg-brand-50 hover:text-brand-800"
                }`}
              >
                {t.label}
              </button>
            ))}
            <Link
              href="/wishlist"
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-brand-50 hover:text-brand-800"
            >
              Wishlist
            </Link>
            <button
              onClick={async () => {
                await signOut();
                router.push("/");
              }}
              className="rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              Logout
            </button>
          </nav>
        </div>
      </aside>

      {/* ---------------- content ---------------- */}
      <div className="min-w-0">
        {/* ===== PROFILE ===== */}
        {tab === "profile" && (
          <section className="ns-panel ns-animate-fade-up p-5">
            <h1 className="mb-5 font-heading text-lg font-semibold text-brand-900">My Profile</h1>

            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="text-center">
                <SafeImage
                  src={avatarSrc}
                  alt="Your profile photo"
                  className="mx-auto h-28 w-28 rounded-full border border-brand-100"
                />
                <div className="mt-3 flex flex-col gap-1.5">
                  <label className="ns-btn-outline cursor-pointer !px-3 !py-1.5 text-xs">
                    {avatarSrc ? "Change photo" : "Upload photo"}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      className="hidden"
                      onChange={(e) => handlePhoto(e.target.files?.[0])}
                    />
                  </label>
                  {appUser.photoUrl && (
                    <button
                      onClick={removePhoto}
                      disabled={photoBusy}
                      className="text-xs text-red-600 underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                  {photoBusy && <p className="text-xs text-gray-400">Uploading…</p>}
                </div>
              </div>

              <div className="flex-1 space-y-4">
                <div>
                  <label className="ns-label" htmlFor="profile-name">
                    Name
                  </label>
                  <input
                    id="profile-name"
                    value={profileForm.displayName}
                    disabled={!editingProfile}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, displayName: e.target.value })
                    }
                    className="ns-input disabled:bg-brand-50/50 disabled:text-gray-600"
                  />
                </div>

                <div>
                  <label className="ns-label" htmlFor="profile-email">
                    Email
                  </label>
                  <input
                    id="profile-email"
                    value={appUser.email}
                    disabled
                    className="ns-input bg-brand-50/50 text-gray-600"
                  />
                  {/* Email is owned by Firebase; changing it here would desync
                      the two systems, so it is deliberately read-only. */}
                  <p className="mt-1 text-xs text-gray-400">
                    Your email comes from your sign-in provider and cannot be changed here.
                  </p>
                </div>

                <div>
                  <label className="ns-label" htmlFor="profile-phone">
                    Phone
                  </label>
                  <input
                    id="profile-phone"
                    value={profileForm.phone}
                    disabled={!editingProfile}
                    inputMode="numeric"
                    onChange={(e) =>
                      setProfileForm({
                        ...profileForm,
                        phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                      })
                    }
                    className="ns-input disabled:bg-brand-50/50 disabled:text-gray-600"
                  />
                </div>

                <div className="flex gap-3">
                  {editingProfile ? (
                    <>
                      <button
                        onClick={saveProfile}
                        disabled={savingProfile}
                        className="ns-btn-primary"
                      >
                        {savingProfile ? "Saving…" : "Save Changes"}
                      </button>
                      <button
                        onClick={() => {
                          setEditingProfile(false);
                          setProfileForm({
                            displayName: appUser.displayName ?? "",
                            phone: appUser.phone ?? "",
                          });
                        }}
                        className="ns-btn-outline"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setEditingProfile(true)} className="ns-btn-primary">
                      Edit Profile
                    </button>
                  )}
                </div>

                <p className="text-xs text-gray-400">
                  Passwords are managed by your sign-in provider — Namma Store never stores them.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ===== ORDERS ===== */}
        {tab === "orders" && (
          <section className="ns-animate-fade-up">
            <h1 className="ns-section-title mb-4">My Orders</h1>

            {loadingData ? (
              <ListSkeleton rows={3} height="h-28" />
            ) : dataError ? (
              <ErrorState message={dataError} onRetry={() => loadAll(appUser.id)} />
            ) : orders.length === 0 ? (
              <EmptyState
                title="No orders yet"
                message="When you place an order it will appear here with live status updates."
                actionLabel="Start Shopping"
                actionHref="/products"
                icon={<CartIcon className="h-9 w-9" />}
              />
            ) : (
              <div className="space-y-3">
                {orders.map((order) => {
                  const expanded = expandedOrder === order.id;
                  const cancellable = ["PLACED", "CONFIRMED", "PROCESSING"].includes(order.status);
                  const daysLeftToReturn = order.returnWindowEndsAt
                    ? Math.max(
                        0,
                        Math.ceil(
                          (new Date(order.returnWindowEndsAt).getTime() - Date.now()) /
                            (1000 * 60 * 60 * 24)
                        )
                      )
                    : null;

                  return (
                    <article key={order.id} className="ns-card overflow-hidden">
                      <button
                        onClick={() => setExpandedOrder(expanded ? null : order.id)}
                        aria-expanded={expanded}
                        className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left transition hover:bg-brand-50/40"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-brand-900">
                            #{order.orderNumber ?? order.id}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {formatDate(order.createdAt)} ·{" "}
                            {order.itemCount ?? order.items.length} item
                            {(order.itemCount ?? order.items.length) === 1 ? "" : "s"} ·{" "}
                            {order.paymentMethod ?? "COD"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <OrderStatusBadge status={order.status} />
                          <Price
                            value={order.totalAmount}
                            className="font-semibold text-brand-800"
                          />
                        </div>
                      </button>

                      {expanded && (
                        <div className="ns-animate-fade-in border-t border-brand-50 p-4">
                          <div className="mb-5 overflow-x-auto">
                            <OrderStatusTimeline status={order.status} />
                          </div>

                          <div className="divide-y divide-brand-50">
                            {order.items.map((item) => (
                              <div key={item.id} className="flex items-center gap-3 py-2.5">
                                <SafeImage
                                  src={item.productImageUrl}
                                  alt={item.productName}
                                  fit="contain"
                                  className="h-14 w-14 shrink-0 rounded-lg border border-brand-100 bg-white"
                                  imgClassName="p-1"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-gray-900">
                                    {item.productName}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    Qty {item.quantity} · <Price value={item.unitPrice} /> each
                                  </p>
                                </div>
                                <Price
                                  value={item.finalPrice}
                                  className="text-sm font-semibold text-brand-800"
                                />
                              </div>
                            ))}
                          </div>

                          <div className="mt-4 grid gap-4 border-t border-brand-50 pt-4 sm:grid-cols-2">
                            <div className="text-sm">
                              <p className="font-medium text-brand-900">Delivery address</p>
                              <p className="mt-1 text-gray-600">
                                {order.customerName}
                                <br />
                                {order.shippingAddressSnapshot ||
                                  [order.addressLine, order.city, order.state, order.pincode]
                                    .filter(Boolean)
                                    .join(", ")}
                              </p>
                              {order.customerPhone && (
                                <p className="text-gray-500">{order.customerPhone}</p>
                              )}
                            </div>

                            <dl className="space-y-1.5 text-sm">
                              <div className="flex justify-between">
                                <dt className="text-gray-500">Subtotal</dt>
                                <dd><Price value={order.subtotal} /></dd>
                              </div>
                              {Number(order.discountAmount) > 0 && (
                                <div className="flex justify-between text-green-700">
                                  <dt>Discount {order.couponCode && `(${order.couponCode})`}</dt>
                                  <dd>−<Price value={order.discountAmount} /></dd>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <dt className="text-gray-500">Delivery</dt>
                                <dd>
                                  {Number(order.deliveryCharge) === 0 ? (
                                    <span className="text-green-700">FREE</span>
                                  ) : (
                                    <Price value={order.deliveryCharge} />
                                  )}
                                </dd>
                              </div>
                              <div className="flex justify-between border-t border-brand-50 pt-1.5 font-semibold text-brand-900">
                                <dt>Total</dt>
                                <dd><Price value={order.totalAmount} /></dd>
                              </div>
                            </dl>
                          </div>

                          {cancellable && (
                            <button
                              onClick={() => setCancelTarget(order)}
                              className="mt-4 text-sm text-red-600 underline"
                            >
                              Cancel this order
                            </button>
                          )}

                          {order.returnEligible && (
                            <div className="mt-4 flex flex-wrap items-center gap-3">
                              <button
                                onClick={() => handleReturn(order.id)}
                                className="text-sm text-brand-700 underline"
                              >
                                Return this order
                              </button>
                              {daysLeftToReturn !== null && (
                                <span className="text-xs text-gray-500">
                                  {daysLeftToReturn > 0
                                    ? `Return window closes in ${daysLeftToReturn} day${
                                        daysLeftToReturn === 1 ? "" : "s"
                                      }`
                                    : "Return window closes today"}
                                </span>
                              )}
                            </div>
                          )}

                          {order.returnStatus && (
                            <p className="mt-4 text-sm text-gray-600">
                              Return status:{" "}
                              <span className="font-medium text-brand-800">
                                {order.returnStatus.charAt(0) +
                                  order.returnStatus.slice(1).toLowerCase()}
                              </span>
                            </p>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ===== ADDRESSES ===== */}
        {tab === "addresses" && (
          <section className="ns-animate-fade-up">
            <div className="mb-4 flex items-center justify-between">
              <h1 className="ns-section-title">Saved Addresses</h1>
              <button
                onClick={() => {
                  setFormOpen("new");
                  setForm(emptyAddressForm);
                }}
                className="ns-btn-primary !px-4 !py-2 text-sm"
              >
                Add Address
              </button>
            </div>

            {formOpen !== null && (
              <div className="ns-panel ns-animate-scale-in mb-5 p-5">
                <h2 className="mb-4 font-heading font-semibold text-brand-900">
                  {formOpen === "new" ? "New address" : "Edit address"}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["fullName", "Full name"],
                      ["phone", "Phone"],
                      ["houseBuilding", "House / building"],
                      ["street", "Street"],
                      ["area", "Area"],
                      ["landmark", "Landmark"],
                      ["city", "City"],
                      ["state", "State"],
                      ["pincode", "PIN code"],
                    ] as Array<[keyof typeof emptyAddressForm, string]>
                  ).map(([key, label]) => (
                    <div key={key}>
                      <label className="ns-label" htmlFor={`addr-${key}`}>
                        {label}
                      </label>
                      <input
                        id={`addr-${key}`}
                        value={String(form[key] ?? "")}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        className="ns-input"
                      />
                    </div>
                  ))}
                </div>

                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                    className="h-4 w-4 accent-brand-600"
                  />
                  Make this my default address
                </label>

                <div className="mt-4 flex gap-3">
                  <button
                    onClick={saveAddress}
                    disabled={savingAddress}
                    className="ns-btn-primary"
                  >
                    {savingAddress ? "Saving…" : "Save Address"}
                  </button>
                  <button onClick={() => setFormOpen(null)} className="ns-btn-outline">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {loadingData ? (
              <ListSkeleton rows={2} height="h-32" />
            ) : addresses.length === 0 ? (
              <EmptyState
                title="No addresses saved"
                message="Add one and checkout gets a lot faster."
                icon={<HeartIcon className="h-9 w-9" />}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {addresses.map((address) => (
                  <AddressCard
                    key={address.id}
                    address={address}
                    onEdit={() => {
                      setFormOpen(address.id);
                      setForm({
                        fullName: address.fullName ?? "",
                        phone: address.phone ?? "",
                        houseBuilding: address.houseBuilding ?? "",
                        street: address.street ?? "",
                        area: address.area ?? "",
                        city: address.city ?? "",
                        state: address.state ?? "",
                        pincode: address.pincode ?? "",
                        landmark: address.landmark ?? "",
                        isDefault: address.isDefault,
                      });
                    }}
                    onDelete={() => removeAddress(address.id)}
                    onSetDefault={() => makeDefault(address.id)}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {cancelTarget && (
        <CancelOrderModal
          order={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={(payload) => performCancel(cancelTarget.id, payload)}
        />
      )}
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AccountPageInner />
    </Suspense>
  );
}
