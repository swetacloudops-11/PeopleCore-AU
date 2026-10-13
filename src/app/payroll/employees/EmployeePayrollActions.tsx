"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/** The payroll-relevant subset of an employee, safe to hand to the client. */
export type PayrollEmployeeEditable = {
  id: string;
  firstName: string;
  lastName: string;
  salaryType: "ANNUAL" | "HOURLY";
  baseSalary: number;
  hourlyRate: number;
  standardHoursPerWeek: number;
  superFundName: string | null;
  superMemberNumber: string | null;
  /** Whether a TFN is on file — the value itself is never sent to the client. */
  tfnOnFile: boolean;
  /** Pre-masked TFN for display only (e.g. XXX-XXX-123). */
  maskedTfn: string | null;
};

type FormState = {
  salaryType: "ANNUAL" | "HOURLY";
  baseSalary: string;
  hourlyRate: string;
  standardHoursPerWeek: string;
  superFundName: string;
  superMemberNumber: string;
  taxFileNumber: string;
};

function initialState(employee: PayrollEmployeeEditable): FormState {
  return {
    salaryType: employee.salaryType,
    baseSalary: String(employee.baseSalary),
    hourlyRate: String(employee.hourlyRate),
    standardHoursPerWeek: String(employee.standardHoursPerWeek),
    superFundName: employee.superFundName ?? "",
    superMemberNumber: employee.superMemberNumber ?? "",
    taxFileNumber: "",
  };
}

/**
 * Modal editor for the payroll-only fields of an employee. The tax file number
 * is never prefilled — a blank input leaves the stored TFN untouched.
 */
export function EmployeePayrollActions({ employee }: { employee: PayrollEmployeeEditable }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>(() => initialState(employee));

  function openEditor() {
    setForm(initialState(employee));
    setError("");
    setOpen(true);
  }

  async function submit() {
    setSaving(true);
    setError("");

    const body: Record<string, unknown> = {
      salaryType: form.salaryType,
      baseSalary: Number(form.baseSalary) || 0,
      hourlyRate: Number(form.hourlyRate) || 0,
      standardHoursPerWeek: Number(form.standardHoursPerWeek) || 0,
      superFundName: form.superFundName.trim(),
      superMemberNumber: form.superMemberNumber.trim(),
    };
    if (form.taxFileNumber.trim()) body.taxFileNumber = form.taxFileNumber.trim();

    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      `/api/payroll/employees/${employee.id}`,
      "PATCH",
      body,
      { silent: true }
    );
    setSaving(false);

    if (res.ok) {
      toast.success("Payroll details updated");
      setOpen(false);
      router.refresh();
    } else {
      const fields = res.data?.fields;
      setError(
        fields
          ? Object.values(fields)[0] ?? res.data?.error ?? "Could not save"
          : res.data?.error ?? "Could not save"
      );
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openEditor}
        className="rounded-md px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-50"
      >
        Edit
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Payroll details — ${employee.firstName} ${employee.lastName}`}
        subtitle="Only payroll-relevant fields can be edited from here."
        width="max-w-xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`pp-type-${employee.id}`}>
                Salary type
              </label>
              <select
                id={`pp-type-${employee.id}`}
                className="input"
                value={form.salaryType}
                onChange={(e) =>
                  setForm({ ...form, salaryType: e.target.value as "ANNUAL" | "HOURLY" })
                }
              >
                <option value="ANNUAL">Annual salary</option>
                <option value="HOURLY">Hourly rate</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor={`pp-hours-${employee.id}`}>
                Standard hours / week
              </label>
              <input
                id={`pp-hours-${employee.id}`}
                type="number"
                min="0"
                max="80"
                step="0.5"
                className="input"
                value={form.standardHoursPerWeek}
                onChange={(e) => setForm({ ...form, standardHoursPerWeek: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`pp-base-${employee.id}`}>
                Base salary (annual)
              </label>
              <input
                id={`pp-base-${employee.id}`}
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={form.baseSalary}
                onChange={(e) => setForm({ ...form, baseSalary: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor={`pp-rate-${employee.id}`}>
                Hourly rate
              </label>
              <input
                id={`pp-rate-${employee.id}`}
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={form.hourlyRate}
                onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`pp-fund-${employee.id}`}>
                Super fund
              </label>
              <input
                id={`pp-fund-${employee.id}`}
                className="input"
                placeholder="e.g. AustralianSuper"
                value={form.superFundName}
                onChange={(e) => setForm({ ...form, superFundName: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor={`pp-member-${employee.id}`}>
                Super member number
              </label>
              <input
                id={`pp-member-${employee.id}`}
                className="input"
                placeholder="Member number"
                value={form.superMemberNumber}
                onChange={(e) => setForm({ ...form, superMemberNumber: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor={`pp-tfn-${employee.id}`}>
              Tax file number
            </label>
            <input
              id={`pp-tfn-${employee.id}`}
              className="input"
              placeholder={employee.tfnOnFile ? "Type a new TFN to replace the one on file" : "e.g. 123 456 789"}
              value={form.taxFileNumber}
              onChange={(e) => setForm({ ...form, taxFileNumber: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              {employee.tfnOnFile
                ? `On file: ${employee.maskedTfn ?? "XXX-XXX-XXX"} — leave blank to keep it.`
                : "No tax file number on file yet."}
            </p>
          </div>

          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={saving} onClick={submit}>
              {saving ? "Saving…" : "Save payroll details"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
