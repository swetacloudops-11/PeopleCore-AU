"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/** Publish button for one draft roster. */
export default function PublishRoster({
  roster,
}: {
  roster: {
    id: string;
    name: string;
    shiftCount: number;
    conflictCount: number;
    status: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (roster.status !== "DRAFT") {
    return <span className="text-[11px] text-slate-400">Published</span>;
  }

  async function publish() {
    const warn = roster.conflictCount
      ? `\n\n${roster.conflictCount} open conflict(s) still need attention.`
      : "";
    if (
      !window.confirm(
        `Publish "${roster.name}"?\n\n${roster.shiftCount} shift(s) will go live for employees.${warn}`
      )
    )
      return;

    setBusy(true);
    const res = await apiCall<{ ok?: boolean; shiftCount?: number }>(
      `/api/org/rosters/${roster.id}`,
      "PATCH",
      { action: "PUBLISH" }
    );
    setBusy(false);
    if (res.ok) {
      toast.success(`"${roster.name}" published — ${res.data?.shiftCount ?? roster.shiftCount} shifts are live`);
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      className="btn-primary !px-2.5 !py-1 text-[11px]"
      disabled={busy}
      onClick={publish}
    >
      {busy ? "Publishing…" : "Publish"}
    </button>
  );
}
