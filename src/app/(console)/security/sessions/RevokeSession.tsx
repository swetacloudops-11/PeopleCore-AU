"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RevokeSession({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function revoke() {
    if (!confirm("Revoke this session? The user will be signed out immediately.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={revoke}
      disabled={busy}
      className="rounded-md border border-rose-200 px-2 py-0.5 text-[11px] font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
    >
      {busy ? "…" : "Revoke"}
    </button>
  );
}
