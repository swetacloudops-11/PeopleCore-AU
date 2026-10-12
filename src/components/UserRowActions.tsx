"use client";

/**
 * Row controls for the Users table.
 * Dispatches events handled by UserManager so it owns the confirm + API call.
 */
export default function UserRowActions({
  id,
  name,
  status,
  isSelf,
}: {
  id: string;
  name: string;
  email: string;
  status: string;
  isSelf: boolean;
  roleKey: string | null;
}) {
  function fire(kind: "edit" | "toggle") {
    window.dispatchEvent(
      new CustomEvent(kind === "edit" ? "pc-edit-user" : "pc-toggle-user", {
        detail: { id, name, status },
      })
    );
  }

  const suspended = status !== "ACTIVE";

  return (
    <div className="flex justify-end gap-1.5">
      <button
        type="button"
        onClick={() => fire("edit")}
        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => fire("toggle")}
        disabled={isSelf}
        title={isSelf ? "You cannot suspend your own account" : undefined}
        className={`rounded-md border px-2 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
          suspended
            ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            : "border-amber-200 text-amber-700 hover:bg-amber-50"
        }`}
      >
        {suspended ? "Activate" : "Suspend"}
      </button>
    </div>
  );
}
