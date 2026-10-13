"use client";

import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

export default function OrgQuickActions({
  id,
  name,
  status,
}: {
  id: string;
  name: string;
  status: string;
}) {
  const router = useRouter();

  async function toggle() {
    const disabling = status !== "DISABLED";
    if (!window.confirm(disabling ? `Disable "${name}"?` : `Re-enable "${name}"?`)) return;
    const res = await apiCall(`/api/organisations/${id}`, "PATCH", {
      status: disabling ? "DISABLED" : "ACTIVE",
    });
    if (res.ok) {
      toast.success(disabling ? "Organisation disabled" : "Organisation re-enabled");
      router.refresh();
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${name}" and all of its data? This cannot be undone.`)) return;
    const res = await apiCall(`/api/organisations/${id}`, "DELETE");
    if (res.ok) {
      toast.success("Organisation deleted");
      router.push("/organisations");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => router.push(`/organisations/${id}`)} className="btn-secondary">
        Edit details
      </button>
      <button
        type="button"
        onClick={toggle}
        className={
          status === "DISABLED"
            ? "btn-primary !bg-emerald-600 hover:!bg-emerald-700 dark:hover:!bg-emerald-500"
            : "btn-secondary !border-amber-300 !text-amber-700"
        }
      >
        {status === "DISABLED" ? "Re-enable" : "Disable"}
      </button>
      <button
        type="button"
        onClick={remove}
        className="btn-secondary !border-rose-300 !text-rose-600 hover:!bg-rose-50"
      >
        Delete
      </button>
    </div>
  );
}
