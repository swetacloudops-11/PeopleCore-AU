"use client";

import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

export default function MappingActions({
  id,
  status,
  label,
}: {
  id: string;
  status: string;
  label: string;
}) {
  const router = useRouter();

  async function setStatus(next: "CONNECTED" | "DISCONNECTED") {
    const verb = next === "CONNECTED" ? "Connect" : "Disconnect";
    if (!window.confirm(`${verb} ${label}?`)) return;

    const res = await apiCall(`/api/mappings/${id}`, "PATCH", { status: next });
    if (res.ok) {
      toast.success(`${verb}ed ${label}`);
      router.refresh();
    }
  }

  async function remove() {
    if (!window.confirm(`Remove this mapping? ${label}`)) return;
    if (!window.confirm("This also detaches its sync history link. Continue?")) return;

    const res = await apiCall(`/api/mappings/${id}`, "DELETE");
    if (res.ok) {
      toast.success("Mapping removed");
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {status !== "CONNECTED" && (
        <button
          type="button"
          onClick={() => setStatus("CONNECTED")}
          className="rounded-md border border-emerald-200 px-2 py-1 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-50"
        >
          Connect
        </button>
      )}
      {status === "CONNECTED" && (
        <button
          type="button"
          onClick={() => setStatus("DISCONNECTED")}
          className="rounded-md border border-amber-200 px-2 py-1 text-[11px] font-medium text-amber-700 transition hover:bg-amber-50"
        >
          Disconnect
        </button>
      )}
      <button
        type="button"
        onClick={remove}
        className="rounded-md border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-600 transition hover:bg-rose-50"
      >
        Remove
      </button>
    </div>
  );
}
