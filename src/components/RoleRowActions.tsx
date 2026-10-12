"use client";

import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

export default function RoleRowActions({
  id,
  name,
  isSystem,
  permissionKeys,
  description,
  memberCount,
}: {
  id: string;
  name: string;
  isSystem: boolean;
  permissionKeys: string[];
  description: string | null;
  memberCount: number;
}) {
  const router = useRouter();

  function edit() {
    window.dispatchEvent(
      new CustomEvent("pc-edit-role", {
        detail: { id, key: "", name, description, isSystem, permissionKeys },
      })
    );
  }

  async function remove() {
    if (isSystem) {
      toast.error("Built-in system roles cannot be deleted");
      return;
    }
    if (memberCount > 0) {
      toast.error(`Cannot delete — ${memberCount} user(s) hold the "${name}" role`);
      return;
    }
    if (!window.confirm(`Delete role "${name}" permanently?`)) return;

    const res = await apiCall(`/api/roles/${id}`, "DELETE");
    if (res.ok) {
      toast.success(`Role "${name}" deleted`);
      router.refresh();
    }
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={edit}
        className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={isSystem || memberCount > 0}
        title={
          isSystem
            ? "System role — cannot be deleted"
            : memberCount > 0
            ? "In use by existing users"
            : "Delete role"
        }
        className="rounded-md border border-rose-200 px-2.5 py-1 text-[11px] font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Delete
      </button>
    </div>
  );
}
