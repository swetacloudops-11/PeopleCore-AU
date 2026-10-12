"use client";

import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/**
 * Row-level actions for the organisation tables: open the edit screen,
 * toggle enabled/disabled state, and delete with confirmation.
 */
export default function OrgRowActions({
  id,
  name,
  status,
}: {
  id: string;
  name: string;
  status: string;
}) {
  const router = useRouter();

  async function toggleStatus() {
    const disabling = status !== "DISABLED";
    const message = disabling
      ? `Disable "${name}"? It will lose platform access immediately.`
      : `Re-enable "${name}"?`;

    if (!window.confirm(message)) return;

    const res = await apiCall(`/api/organisations/${id}`, "PATCH", {
      status: disabling ? "DISABLED" : "ACTIVE",
    });
    if (res.ok) {
      toast.success(disabling ? `"${name}" disabled` : `"${name}" re-enabled`);
      router.refresh();
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Delete "${name}" permanently?\n\nThis removes its subscriptions, integration mappings and sync history. This cannot be undone.`
      )
    )
      return;
    if (
      !window.confirm(`Final confirmation — type-free delete of "${name}". Continue?`)
    )
      return;

    const res = await apiCall(`/api/organisations/${id}`, "DELETE");
    if (res.ok) {
      toast.success(`"${name}" deleted`);
      router.refresh();
    }
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={() => router.push(`/organisations/${id}`)}
        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={toggleStatus}
        className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${
          status === "DISABLED"
            ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            : "border-amber-200 text-amber-700 hover:bg-amber-50"
        }`}
      >
        {status === "DISABLED" ? "Enable" : "Disable"}
      </button>
      <button
        type="button"
        onClick={remove}
        className="rounded-md border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-600 transition hover:bg-rose-50"
      >
        Delete
      </button>
    </div>
  );
}
