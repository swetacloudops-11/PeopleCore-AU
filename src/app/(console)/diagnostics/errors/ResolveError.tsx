"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResolveError({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function resolve() {
    setBusy(true);
    try {
      const res = await fetch(`/api/errors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: true }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={resolve} disabled={busy} className="btn-secondary !px-2 !py-1 text-xs">
      {busy ? "…" : "Mark resolved"}
    </button>
  );
}
