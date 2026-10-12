"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

export type UnitOption = { id: string; name: string };

export type OrgOptions = {
  departments: UnitOption[];
  teams: UnitOption[];
  locations: UnitOption[];
  positions: UnitOption[];
  managers: UnitOption[];
};

/** Plain serialisable employee shape — Decimals are converted with Number() server-side. */
export type EmployeeRow = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  workEmail: string | null;
  personalEmail: string | null;
  phone: string | null;
  employmentStatus: string;
  employmentType: string;
  hireDate: string; // ISO
  probationEndDate: string | null;
  departmentId: string | null;
  teamId: string | null;
  locationId: string | null;
  positionId: string | null;
  managerId: string | null;
  salaryType: string;
  baseSalary: number;
  hourlyRate: number;
  standardHoursPerWeek: number;
  superFundName: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
};

type FormState = {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  workEmail: string;
  personalEmail: string;
  phone: string;
  employmentStatus: string;
  employmentType: string;
  hireDate: string;
  probationEndDate: string;
  departmentId: string;
  teamId: string;
  locationId: string;
  positionId: string;
  managerId: string;
  salaryType: string;
  baseSalary: string;
  hourlyRate: string;
  standardHoursPerWeek: string;
  superFundName: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  notes: string;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function toForm(e: EmployeeRow | null): FormState {
  if (!e) {
    return {
      employeeNumber: "",
      firstName: "",
      lastName: "",
      preferredName: "",
      workEmail: "",
      personalEmail: "",
      phone: "",
      employmentStatus: "ACTIVE",
      employmentType: "FULL_TIME",
      hireDate: today(),
      probationEndDate: "",
      departmentId: "",
      teamId: "",
      locationId: "",
      positionId: "",
      managerId: "",
      salaryType: "ANNUAL",
      baseSalary: "",
      hourlyRate: "",
      standardHoursPerWeek: "38",
      superFundName: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      notes: "",
    };
  }
  return {
    employeeNumber: e.employeeNumber,
    firstName: e.firstName,
    lastName: e.lastName,
    preferredName: e.preferredName ?? "",
    workEmail: e.workEmail ?? "",
    personalEmail: e.personalEmail ?? "",
    phone: e.phone ?? "",
    employmentStatus: e.employmentStatus,
    employmentType: e.employmentType,
    hireDate: e.hireDate.slice(0, 10),
    probationEndDate: e.probationEndDate ? e.probationEndDate.slice(0, 10) : "",
    departmentId: e.departmentId ?? "",
    teamId: e.teamId ?? "",
    locationId: e.locationId ?? "",
    positionId: e.positionId ?? "",
    managerId: e.managerId ?? "",
    salaryType: e.salaryType,
    baseSalary: String(e.baseSalary ?? ""),
    hourlyRate: String(e.hourlyRate ?? ""),
    standardHoursPerWeek: String(e.standardHoursPerWeek ?? "38"),
    superFundName: e.superFundName ?? "",
    emergencyContactName: e.emergencyContactName ?? "",
    emergencyContactPhone: e.emergencyContactPhone ?? "",
    notes: e.notes ?? "",
  };
}

function F({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {error && <span className="mt-1 block text-[11px] font-medium text-rose-600">{error}</span>}
    </label>
  );
}

/** Create/edit modal shared by the employee list and detail pages. */
export function EmployeeModal({
  open,
  onClose,
  employee,
  options,
}: {
  open: boolean;
  onClose: () => void;
  employee: EmployeeRow | null;
  options: OrgOptions;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toForm(employee));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Re-seed the form whenever the modal opens for a different employee.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = open ? (employee?.id ?? "new") : null;
  if (key !== null && key !== lastKey) {
    setLastKey(key);
    setForm(toForm(employee));
    setErrors({});
  }

  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    const body = {
      employeeNumber: form.employeeNumber,
      firstName: form.firstName,
      lastName: form.lastName,
      preferredName: form.preferredName,
      workEmail: form.workEmail,
      personalEmail: form.personalEmail,
      phone: form.phone,
      employmentStatus: form.employmentStatus,
      employmentType: form.employmentType,
      hireDate: form.hireDate,
      probationEndDate: form.probationEndDate,
      departmentId: form.departmentId,
      teamId: form.teamId,
      locationId: form.locationId,
      positionId: form.positionId,
      managerId: form.managerId,
      salaryType: form.salaryType,
      baseSalary: form.baseSalary === "" ? undefined : Number(form.baseSalary),
      hourlyRate: form.hourlyRate === "" ? undefined : Number(form.hourlyRate),
      standardHoursPerWeek:
        form.standardHoursPerWeek === "" ? undefined : Number(form.standardHoursPerWeek),
      superFundName: form.superFundName,
      emergencyContactName: form.emergencyContactName,
      emergencyContactPhone: form.emergencyContactPhone,
      notes: form.notes,
    };

    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      employee ? `/api/org/employees/${employee.id}` : "/api/org/employees",
      employee ? "PATCH" : "POST",
      body
    );
    setBusy(false);
    if (!res.ok) {
      setErrors(res.data?.fields ?? {});
      return;
    }
    toast.success(employee ? "Employee updated" : "Employee created");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={employee ? `Edit ${employee.firstName} ${employee.lastName}` : "Add employee"}
      subtitle={
        employee
          ? "Update employment details, role assignments and pay."
          : "Create a new employee record for your organisation."
      }
      width="max-w-2xl"
    >
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <F label="Employee number" error={errors.employeeNumber}>
          <input
            className="input"
            value={form.employeeNumber}
            onChange={(e) => set("employeeNumber")(e.target.value)}
            placeholder="e.g. EMP-061"
          />
        </F>
        <F label="Hire date" error={errors.hireDate}>
          <input
            type="date"
            className="input"
            value={form.hireDate}
            onChange={(e) => set("hireDate")(e.target.value)}
          />
        </F>
        <F label="First name" error={errors.firstName}>
          <input
            className="input"
            value={form.firstName}
            onChange={(e) => set("firstName")(e.target.value)}
          />
        </F>
        <F label="Last name" error={errors.lastName}>
          <input
            className="input"
            value={form.lastName}
            onChange={(e) => set("lastName")(e.target.value)}
          />
        </F>
        <F label="Preferred name" error={errors.preferredName}>
          <input
            className="input"
            value={form.preferredName}
            onChange={(e) => set("preferredName")(e.target.value)}
          />
        </F>
        <F label="Work email" error={errors.workEmail}>
          <input
            type="email"
            className="input"
            value={form.workEmail}
            onChange={(e) => set("workEmail")(e.target.value)}
          />
        </F>
        <F label="Personal email" error={errors.personalEmail}>
          <input
            type="email"
            className="input"
            value={form.personalEmail}
            onChange={(e) => set("personalEmail")(e.target.value)}
          />
        </F>
        <F label="Phone" error={errors.phone}>
          <input
            className="input"
            value={form.phone}
            onChange={(e) => set("phone")(e.target.value)}
          />
        </F>
        <F label="Employment status" error={errors.employmentStatus}>
          <select
            className="input"
            value={form.employmentStatus}
            onChange={(e) => set("employmentStatus")(e.target.value)}
          >
            {["ACTIVE", "PROBATION", "CASUAL", "CONTRACT", "LEAVE", "TERMINATED"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </F>
        <F label="Employment type" error={errors.employmentType}>
          <select
            className="input"
            value={form.employmentType}
            onChange={(e) => set("employmentType")(e.target.value)}
          >
            {["FULL_TIME", "PART_TIME", "CASUAL", "CONTRACT"].map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </F>
        <F label="Department" error={errors.departmentId}>
          <select
            className="input"
            value={form.departmentId}
            onChange={(e) => set("departmentId")(e.target.value)}
          >
            <option value="">— None —</option>
            {options.departments.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </F>
        <F label="Team" error={errors.teamId}>
          <select
            className="input"
            value={form.teamId}
            onChange={(e) => set("teamId")(e.target.value)}
          >
            <option value="">— None —</option>
            {options.teams.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </F>
        <F label="Position" error={errors.positionId}>
          <select
            className="input"
            value={form.positionId}
            onChange={(e) => set("positionId")(e.target.value)}
          >
            <option value="">— None —</option>
            {options.positions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </F>
        <F label="Location" error={errors.locationId}>
          <select
            className="input"
            value={form.locationId}
            onChange={(e) => set("locationId")(e.target.value)}
          >
            <option value="">— None —</option>
            {options.locations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </F>
        <F label="Manager" error={errors.managerId}>
          <select
            className="input"
            value={form.managerId}
            onChange={(e) => set("managerId")(e.target.value)}
          >
            <option value="">— None —</option>
            {options.managers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </F>
        <F label="Probation end" error={errors.probationEndDate}>
          <input
            type="date"
            className="input"
            value={form.probationEndDate}
            onChange={(e) => set("probationEndDate")(e.target.value)}
          />
        </F>
        <F label="Salary type" error={errors.salaryType}>
          <select
            className="input"
            value={form.salaryType}
            onChange={(e) => set("salaryType")(e.target.value)}
          >
            <option value="ANNUAL">ANNUAL</option>
            <option value="HOURLY">HOURLY</option>
          </select>
        </F>
        <F label="Base salary (p.a.)" error={errors.baseSalary}>
          <input
            type="number"
            min={0}
            step="1000"
            className="input"
            value={form.baseSalary}
            onChange={(e) => set("baseSalary")(e.target.value)}
          />
        </F>
        <F label="Hourly rate" error={errors.hourlyRate}>
          <input
            type="number"
            min={0}
            step="0.5"
            className="input"
            value={form.hourlyRate}
            onChange={(e) => set("hourlyRate")(e.target.value)}
          />
        </F>
        <F label="Standard hours / week" error={errors.standardHoursPerWeek}>
          <input
            type="number"
            min={0}
            max={80}
            step="0.5"
            className="input"
            value={form.standardHoursPerWeek}
            onChange={(e) => set("standardHoursPerWeek")(e.target.value)}
          />
        </F>
        <F label="Super fund" error={errors.superFundName}>
          <input
            className="input"
            value={form.superFundName}
            onChange={(e) => set("superFundName")(e.target.value)}
          />
        </F>
        <F label="Emergency contact" error={errors.emergencyContactName}>
          <input
            className="input"
            value={form.emergencyContactName}
            onChange={(e) => set("emergencyContactName")(e.target.value)}
          />
        </F>
        <F label="Emergency phone" error={errors.emergencyContactPhone}>
          <input
            className="input"
            value={form.emergencyContactPhone}
            onChange={(e) => set("emergencyContactPhone")(e.target.value)}
          />
        </F>
        <div className="sm:col-span-2">
          <F label="Notes" error={errors.notes}>
            <textarea
              rows={2}
              className="input"
              value={form.notes}
              onChange={(e) => set("notes")(e.target.value)}
            />
          </F>
        </div>

        <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Saving…" : employee ? "Save changes" : "Create employee"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
