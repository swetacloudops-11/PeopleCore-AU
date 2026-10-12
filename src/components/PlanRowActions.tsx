"use client";

import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/**
 * Edit / retire / delete controls for a single plan card.
 * Edit opens the shared PlanManager modal inline via a callback prop kept
 * simple here: we navigate using a custom event the page listens for.
 */
export default function PlanRowActions({
  id,
  name,
  isActive,
  subscriberCount,
}: {
  id: string;
  name: string;
  isActive: boolean;
  subscriberCount: number;
}) {
  const router = useRouter();

  async function toggleActive() {
    const next = !isActive;
    const ok = window.confirm(
      next
        ? `Make "${name}" available for new subscriptions?`
        : `Retire "${name}"?\n\nExisting subscribers keep it; new sign-ups won't see it.`
    );
    if (!ok) return;

    const res = await apiCall(`/api/plans/${id}`, "PATCH", { isActive: next });
    if (res.ok) {
      toast.success(next ? `"${name}" is now active` : `"${name}" retired`);
      router.refresh();
    }
  }

  async function remove() {
    if (subscriberCount > 0) {
      toast.error(
        `Cannot delete — ${subscriberCount} organisation(s) subscribe to "${name}". Retire it instead.`
      );
      return;
    }
    if (!window.confirm(`Delete plan "${name}" permanently?`)) return;

    const res = await apiCall(`/api/plans/${id}`, "DELETE");
    if (res.ok) {
      toast.success(`Plan "${name}" deleted`);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("pc-edit-plan", { detail: id }))}
        className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={toggleActive}
        className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
          isActive
            ? "border-amber-200 text-amber-700 hover:bg-amber-50"
            : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
        }`}
      >
        {isActive ? "Retire" : "Activate"}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={subscriberCount > 0}
        title={subscriberCount > 0 ? "In use by existing subscriptions" : "Delete plan"}
        className="rounded-md border border-rose-200 px-2.5 py-1 text-[11px] font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Delete
      </button>
    </div>
  );
}
