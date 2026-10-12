"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/** Signs off the signed-in person's acknowledgement for one policy. */
export default function AckButton({
  policyId,
  label = "I acknowledge",
}: {
  policyId: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function ack() {
    setBusy(true);
    const res = await apiCall<{ error?: string }>("/api/employee/policies/ack", "POST", {
      policyId,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Policy acknowledged");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={ack}
      disabled={busy}
      className="btn-primary !px-3 !py-1.5 text-xs"
    >
      {busy ? "Saving…" : label}
    </button>
  );
}
