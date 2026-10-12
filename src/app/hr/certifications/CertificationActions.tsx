"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Option = { id: string; name: string };

export type AssignmentRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  certificationId: string;
  certificationName: string;
  status: string;
  issuedDate: string | null;
  expiryDate: string | null;
  certificateNumber: string | null;
  notes: string | null;
};

const STATUSES = ["CURRENT", "EXPIRING", "EXPIRED", "PENDING"] as const;

/**
 * Assign a certification to an employee, or — when `assignment` is passed —
 * update / remove that employee certification record.
 */
export function CertificationActions({
  assignment,
  employees = [],
  certifications = [],
}: {
  assignment?: AssignmentRow;
  employees?: Option[];
  certifications?: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    employeeId: assignment?.employeeId ?? "",
    certificationId: assignment?.certificationId ?? "",
    status: assignment?.status ?? "CURRENT",
    issuedDate: assignment?.issuedDate ? assignment.issuedDate.slice(0, 10) : "",
    expiryDate: assignment?.expiryDate ? assignment.expiryDate.slice(0, 10) : "",
    certificateNumber: assignment?.certificateNumber ?? "",
    notes: assignment?.notes ?? "",
  });

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setErrors({});
    const body = {
      status: form.status,
      issuedDate: form.issuedDate,
      expiryDate: form.expiryDate,
      certificateNumber: form.certificateNumber,
      notes: form.notes,
    };
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      assignment ? `/api/hr/certifications/${assignment.id}` : "/api/hr/certifications",
      assignment ? "PATCH" : "POST",
      assignment
        ? body
        : { employeeId: form.employeeId, certificationId: form.certificationId, ...body }
    );
    setBusy(false);
    if (!res.ok) {
      setErrors(res.data?.fields ?? {});
      return;
    }
    toast.success(assignment ? "Certification updated" : "Certification assigned");
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    if (!assignment) return;
    if (!confirm(`Remove "${assignment.certificationName}" from ${assignment.employeeName}?`)) return;
    setBusy(true);
    const res = await apiCall<{ error?: string }>(
      `/api/hr/certifications/${assignment.id}`,
      "DELETE"
    );
    setBusy(false);
    if (!res.ok) return;
    toast.success("Certification removed");
    router.refresh();
  }

  return (
    <>
      {assignment ? (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      ) : (
        <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
          + Assign certification
        </button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={assignment ? "Edit certification" : "Assign certification"}
        subtitle={
          assignment ? assignment.employeeName : "Record a certification held by an employee."
        }
      >
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!assignment && (
            <>
              <label className="block sm:col-span-2">
                <span className="label">Employee</span>
                <select
                  className="input"
                  value={form.employeeId}
                  onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
                  required
                >
                  <option value="">— Select employee —</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
                {errors.employeeId && (
                  <span className="mt-1 block text-[11px] text-rose-600">{errors.employeeId}</span>
                )}
              </label>
              <label className="block sm:col-span-2">
                <span className="label">Certification</span>
                <select
                  className="input"
                  value={form.certificationId}
                  onChange={(e) => setForm((f) => ({ ...f, certificationId: e.target.value }))}
                  required
                >
                  <option value="">— Select certification —</option>
                  {certifications.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {errors.certificationId && (
                  <span className="mt-1 block text-[11px] text-rose-600">
                    {errors.certificationId}
                  </span>
                )}
              </label>
            </>
          )}

          <label className="block">
            <span className="label">Status</span>
            <select
              className="input"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label">Certificate number</span>
            <input
              className="input"
              value={form.certificateNumber}
              onChange={(e) => setForm((f) => ({ ...f, certificateNumber: e.target.value }))}
            />
          </label>

          <label className="block">
            <span className="label">Issued date</span>
            <input
              type="date"
              className="input"
              value={form.issuedDate}
              onChange={(e) => setForm((f) => ({ ...f, issuedDate: e.target.value }))}
            />
          </label>

          <label className="block">
            <span className="label">Expiry date</span>
            <input
              type="date"
              className="input"
              value={form.expiryDate}
              onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="label">Notes</span>
            <textarea
              rows={2}
              className="input"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>

          <div className="flex justify-end gap-2 pt-1 sm:col-span-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Saving…" : assignment ? "Save changes" : "Assign"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Add a new certification to the organisation's catalogue. */
export function NewCertificationButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: "",
    issuingBody: "",
    description: "",
    validityMonths: "",
    isMandatory: false,
  });

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setErrors({});
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      "/api/hr/certifications",
      "POST",
      {
        name: form.name,
        issuingBody: form.issuingBody,
        description: form.description,
        validityMonths: form.validityMonths === "" ? undefined : Number(form.validityMonths),
        isMandatory: form.isMandatory,
      }
    );
    setBusy(false);
    if (!res.ok) {
      setErrors(res.data?.fields ?? {});
      return;
    }
    toast.success("Certification created");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        + New certification
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New certification"
        subtitle="Define a certification your organisation tracks."
      >
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="label">Name</span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. First Aid & CPR"
              required
            />
            {errors.name && <span className="mt-1 block text-[11px] text-rose-600">{errors.name}</span>}
          </label>
          <label className="block">
            <span className="label">Issuing body</span>
            <input
              className="input"
              value={form.issuingBody}
              onChange={(e) => setForm((f) => ({ ...f, issuingBody: e.target.value }))}
              placeholder="e.g. St John Ambulance"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Validity (months)</span>
              <input
                type="number"
                min={1}
                max={120}
                className="input"
                value={form.validityMonths}
                onChange={(e) => setForm((f) => ({ ...f, validityMonths: e.target.value }))}
                placeholder="e.g. 12"
              />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isMandatory}
                onChange={(e) => setForm((f) => ({ ...f, isMandatory: e.target.checked }))}
              />
              Mandatory
            </label>
          </div>
          <label className="block">
            <span className="label">Description</span>
            <textarea
              rows={3}
              className="input"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Create certification"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
