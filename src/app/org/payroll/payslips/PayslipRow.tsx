"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";
import { Badge } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";

type Payslip = {
  id: string;
  employeeName: string;
  employeeNumber: string;
  payRunLabel: string;
  periodStart: Date;
  periodEnd: Date;
  grossPay: number;
  superAmount: number;
  taxAmount: number;
  netPay: number;
  status: string;
  issuedAt: Date | null;
  viewedAt: Date | null;
};

const TONE: Record<string, string> = {
  PENDING: "amber",
  ISSUED: "blue",
  VIEWED: "green",
};

const ACTION: Record<string, { action: "ISSUE" | "VIEW"; label: string; done: string }> = {
  PENDING: { action: "ISSUE", label: "Mark issued", done: "Payslip issued" },
  ISSUED: { action: "VIEW", label: "Mark viewed", done: "Payslip recorded as viewed" },
};

/** Opens the payslip summary modal and exposes issue / view transitions. */
export function PayslipRow({ payslip }: { payslip: Payslip }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const next = ACTION[payslip.status];

  async function run() {
    if (!next) return;
    setBusy(true);
    const res = await apiCall(`/api/org/payslips/${payslip.id}`, "PATCH", {
      action: next.action,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(next.done);
      router.refresh();
    }
  }

  const rows: Array<[string, string]> = [
    ["Period", `${formatDate(payslip.periodStart)} → ${formatDate(payslip.periodEnd)}`],
    ["Pay run", payslip.payRunLabel],
    ["Gross pay", formatMoney(payslip.grossPay)],
    ["Super", formatMoney(payslip.superAmount)],
    ["Tax withheld", formatMoney(payslip.taxAmount)],
    ["Net pay", formatMoney(payslip.netPay)],
    ["Issued", payslip.issuedAt ? formatDate(payslip.issuedAt) : "Not issued"],
    ["Viewed", payslip.viewedAt ? formatDate(payslip.viewedAt) : "Not viewed yet"],
  ];

  return (
    <div className="flex justify-end gap-1.5">
      <button
        type="button"
        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
        onClick={() => setOpen(true)}
      >
        View
      </button>
      {next && (
        <button
          type="button"
          disabled={busy}
          onClick={run}
          className="rounded-md border border-emerald-200 px-2 py-1 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
        >
          {busy ? "Saving…" : next.label}
        </button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Payslip summary"
        subtitle={`${payslip.employeeName} · ${payslip.employeeNumber}`}
        width="max-w-xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Badge tone={TONE[payslip.status] ?? "slate"}>{payslip.status}</Badge>
            <span className="text-xs text-slate-500">{payslip.payRunLabel}</span>
          </div>

          <dl className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {rows.map(([label, value]) => (
              <div
                key={label}
                className="flex items-baseline justify-between gap-4 px-4 py-2.5"
              >
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd
                  className={`text-sm tabular-nums ${
                    label === "Net pay"
                      ? "font-semibold text-slate-900"
                      : "text-slate-700"
                  }`}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <p className="text-xs text-slate-500">
            Issuing shares the payslip with the employee; recording a view confirms the
            employee has opened it.
          </p>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Close
            </button>
            {next && (
              <button type="button" className="btn-primary" disabled={busy} onClick={run}>
                {busy ? "Saving…" : next.label}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
