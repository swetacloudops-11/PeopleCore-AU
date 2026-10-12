"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/** Resolved / open toggle for one roster conflict. */
export default function ConflictToggle({ id, resolved }: { id: string; resolved: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(resolved);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !on;
    setOn(next);
    setBusy(true);
    const res = await apiCall(`/api/org/conflicts/${id}`, "PATCH", { resolved: next });
    setBusy(false);
    if (res.ok) {
      toast.success(next ? "Conflict marked as resolved" : "Conflict reopened");
      router.refresh();
    } else {
      setOn(!next);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
        on
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
      }`}
      aria-pressed={on}
      title={on ? "Reopen this conflict" : "Mark as resolved"}
    >
      <span
        className={`grid h-3.5 w-3.5 place-items-center rounded-full border text-[9px] ${
          on ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"
        }`}
      >
        {on ? "✓" : ""}
      </span>
      {on ? "Resolved" : "Open"}
    </button>
  );
}
