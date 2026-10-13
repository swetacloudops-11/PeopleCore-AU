"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";
import CategoryForm from "./CategoryForm";

export type CategoryActionItem = {
  id: string;
  name: string;
  code: string;
  type: string;
  rate: number;
  unit: string;
  isTaxable: boolean;
  isSuperable: boolean;
  appliesTo: string;
  sortOrder: number;
  isActive: boolean;
};

/** Header button that opens the shared category form in a modal. */
export function NewCategoryButton({
  defaultType,
  label = "Add category",
}: {
  defaultType?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + {label}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New pay category"
        subtitle="Building blocks used when costing a pay run"
      >
        <CategoryForm defaultType={defaultType} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

/** Row actions for a pay category: edit (modal) and delete (with confirm). */
export default function CategoryActions({ category }: { category: CategoryActionItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const res = await apiCall(`/api/payroll/categories/${category.id}`, "DELETE");
    setBusy(false);
    if (res.ok) {
      toast.success("Pay category deleted");
      setConfirmDelete(false);
      router.refresh();
    }
  }

  return (
    <div className="flex justify-end gap-1.5">
      <button
        type="button"
        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
        onClick={() => setOpen(true)}
      >
        Edit
      </button>
      <button
        type="button"
        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-50"
        onClick={() => setConfirmDelete(true)}
      >
        Delete
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit pay category"
        subtitle={`${category.name} · ${category.code}`}
      >
        <CategoryForm
          id={category.id}
          initial={{
            name: category.name,
            code: category.code,
            type: category.type,
            rate: String(category.rate),
            unit: category.unit,
            isTaxable: category.isTaxable,
            isSuperable: category.isSuperable,
            appliesTo: category.appliesTo,
            sortOrder: String(category.sortOrder),
            isActive: category.isActive,
          }}
          onDone={() => setOpen(false)}
        />
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete pay category?"
        subtitle={`${category.name} · ${category.code}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Historical pay runs keep their own line breakdown &mdash; deleting the category
            only removes it from future runs.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button type="button" className="btn-danger" disabled={busy} onClick={remove}>
              {busy ? "Deleting…" : "Delete category"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
