"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

export type Option = { id: string; name: string };

export type HrOptions = {
  departments: Option[];
  teams: Option[];
  locations: Option[];
  positions: Option[];
  managers: Option[];
};

/** Plain serialisable employee shape — Decimals are converted with Number() server-side. */
export type HrEmployeeRow = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  workEmail: string | null;
  personalEmail: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  taxFileNumber: string | null;
  employmentStatus: string;
  employmentType: string;
  hireDate: string; // ISO
  probationEndDate: string | null;
  terminationDate: string | null;
  terminationReason: string | null;
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
  superMemberNumber: string | null;
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
  dateOfBirth: string;
  gender: string;
  taxFileNumber: string;
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
  superMemberNumber: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  notes: string;
};

const STATUSES = ["ACTIVE", "PROBATION", "CASUAL", "CONTRACT", "LEAVE", "TERMINATED"] as const;
const TYPES = ["FULL_TIME", "PART_TIME", "CASUAL", "CONTRACT"] as const;
const GENDERS = ["PREFER_NOT_TO_SAY", "FEMALE", "MALE", "NON_BINARY"] as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function toForm(e: HrEmployeeRow | null): FormState {
  if (!e) {
    return {
      employeeNumber: "",
      firstName: "",
      lastName: "",
      preferredName: "",
      workEmail: "",
      personalEmail: "",
      phone: "",
      dateOfBirth: "",
      gender: "PREFER_NOT_TO_SAY",
      taxFileNumber: "",
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
      superMemberNumber: "",
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
    dateOfBirth: e.dateOfBirth ? e.dateOfBirth.slice(0, 10) : "",
    gender: e.gender ?? "PREFER_NOT_TO_SAY",
    taxFileNumber: e.taxFileNumber ?? "",
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
    superMemberNumber: e.superMemberNumber ?? "",
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

/**
 * Create/edit employee form. Rendered inline on the "Add employee" page and
 * inside the row edit modal. Surfaces `fields.*` inline errors from the API.
 */
export function EmployeeForm({
  options,
  initial = null,
  employeeId,
  onDone,
  onCancel,
}: {
  options: HrOptions;
  initial?: HrEmployeeRow | null;
  /** When set the form PATCHes instead of POSTs. */
  employeeId?: string;
  /** Called after a successful save (modal closes). Omit to redirect to the list. */
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setErrors({});

    const body = {
      employeeNumber: form.employeeNumber,
      firstName: form.firstName,
      lastName: form.lastName,
      preferredName: form.preferredName,
      workEmail: form.workEmail,
      personalEmail: form.personalEmail,
      phone: form.phone,
      dateOfBirth: form.dateOfBirth,
      gender: form.gender,
      taxFileNumber: form.taxFileNumber,
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
      superMemberNumber: form.superMemberNumber,
      emergencyContactName: form.emergencyContactName,
      emergencyContactPhone: form.emergencyContactPhone,
      notes: form.notes,
    };

    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      employeeId ? `/api/hr/employees/${employeeId}` : "/api/hr/employees",
      employeeId ? "PATCH" : "POST",
      body
    );
    setBusy(false);
    if (!res.ok) {
      setErrors(res.data?.fields ?? {});
      return;
    }
    toast.success(employeeId ? "Employee updated" : "Employee created");
    if (onDone) onDone();
    else router.push("/hr/employees");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <F label="Employee number" error={errors.employeeNumber}>
        <input
          className="input"
          value={form.employeeNumber}
          onChange={(e) => set("employeeNumber")(e.target.value)}
          placeholder="e.g. CCT-061"
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
      <F label="Date of birth" error={errors.dateOfBirth}>
        <input
          type="date"
          className="input"
          value={form.dateOfBirth}
          onChange={(e) => set("dateOfBirth")(e.target.value)}
        />
      </F>

      <F label="Gender" error={errors.gender}>
        <select
          className="input"
          value={form.gender}
          onChange={(e) => set("gender")(e.target.value)}
        >
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {g.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </F>
      <F label="Tax file number" error={errors.taxFileNumber}>
        <input
          className="input"
          value={form.taxFileNumber}
          onChange={(e) => set("taxFileNumber")(e.target.value)}
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
      <F label="Probation end" error={errors.probationEndDate}>
        <input
          type="date"
          className="input"
          value={form.probationEndDate}
          onChange={(e) => set("probationEndDate")(e.target.value)}
        />
      </F>

      <F label="Employment status" error={errors.employmentStatus}>
        <select
          className="input"
          value={form.employmentStatus}
          onChange={(e) => set("employmentStatus")(e.target.value)}
        >
          {STATUSES.map((s) => (
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
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace("_", " ")}
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

      <F label="Super member number" error={errors.superMemberNumber}>
        <input
          className="input"
          value={form.superMemberNumber}
          onChange={(e) => set("superMemberNumber")(e.target.value)}
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
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : employeeId ? "Save changes" : "Create employee"}
        </button>
      </div>
    </form>
  );
}
