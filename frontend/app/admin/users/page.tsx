"use client";

import { useEffect, useState } from "react";
import { adminGetUsers, adminSetUserRole } from "../../../api";
import { AdminSidebar, AdminTable, Loading, useAdminSession } from "../../../components";
import type { AppUser } from "../../../types";

export default function AdminUsersPage() {
  const { token, checked } = useAdminSession();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!token) return;
    setLoading(true);
    setUsers(await adminGetUsers(token));
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
        <h1 className="text-2xl font-bold mb-6">Users</h1>
        {loading ? (
          <Loading />
        ) : (
          <AdminTable
            headers={["Email", "Name", "Admin", "Actions"]}
            rows={users.map((u) => [
              u.email,
              u.displayName ?? "-",
              u.admin ? "Yes" : "No",
              <button
                key={u.id}
                onClick={async () => {
                  await adminSetUserRole(token, u.id, !u.admin);
                  load();
                }}
                className="text-orange-700 text-sm"
              >
                {u.admin ? "Remove Admin" : "Make Admin"}
              </button>,
            ])}
          />
        )}
      </div>
    </div>
  );
}
