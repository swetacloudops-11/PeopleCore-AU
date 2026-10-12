"use client";

import type { Integration } from "@/components/IntegrationManager";

/**
 * Edit / activate toggle buttons for an integration card.
 * Dispatches an event the shared IntegrationManager listens for.
 */
export default function IntegrationRowActions({ integration }: { integration: Integration }) {
  function fire(kind: "edit" | "toggle") {
    window.dispatchEvent(
      new CustomEvent("pc-integration-action", { detail: { kind, integration } })
    );
  }

  const active = integration.status === "ACTIVE";

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => fire("edit")}
        className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => fire("toggle")}
        className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
          active
            ? "border-amber-200 text-amber-700 hover:bg-amber-50"
            : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
        }`}
      >
        {active ? "Deactivate" : "Activate"}
      </button>
    </div>
  );
}
