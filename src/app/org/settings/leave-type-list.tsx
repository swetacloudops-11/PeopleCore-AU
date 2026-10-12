"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";
import { Badge } from "@/components/ui";

export type LeaveTypeDto = {
  id: string;
  name: string;
  code: string;
  unit: string;
  accrualRate: number;
  maxCarryOver: number;
  isPaid: boolean;
  requiresApproval: boolean;
  colour: string;
  isActive: boolean;
};

function TypeRow({ type }: { type: LeaveTypeDto }) {
  const router = useRouter();
  const [name, setName] = useState(type.name);
  const [accrual, setAccrual] = useState(String(type.accrualRate));
  const [colour, setColour] = useState(type.colour);

  async function patch(body: Record<string, unknown>, successMsg?: string) {
    const res = await apiCall(`/api/org/leave-types/${type.id}`, "PATCH", body);
    if (res.ok) {
      if (successMsg) toast.success(successMsg);
      router.refresh();
    }
    return res.ok;
  }

  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-3.5 sm:px-5">
      <span
        className="h-8 w-8 shrink-0 rounded-lg border border-slate-200"
        style={{ backgroundColor: colour }}
        title={colour}
      />

      <div className="min-w-[200px] flex-1">
        <div className="flex items-center gap-2">
          <input
            className="input !w-auto !py-1 text-sm font-medium"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== type.name && patch({ name }, "Leave type updated")}
            aria-label="Leave type name"
          />
          <Badge tone="slate">{type.code}</Badge>
          <Badge tone={type.isPaid ? "green" : "amber"}>{type.isPaid ? "PAID" : "UNPAID"}</Badge>
          {!type.isActive && <Badge tone="red">INACTIVE</Badge>}
        </div>
        <code className="text-[11px] text-slate-400">
          {type.unit.toLowerCase()} · approval {type.requiresApproval ? "required" : "optional"} ·
          carry-over {type.maxCarryOver}
        </code>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[11px] uppercase tracking-wide text-slate-400" htmlFor={`acc-${type.id}`}>
          Accrual
        </label>
        <input
          id={`acc-${type.id}`}
          className="input !w-24 !py-1"
          type="number"
          step="0.01"
          min="0"
          value={accrual}
          onChange={(e) => setAccrual(e.target.value)}
          onBlur={() => {
            const n = Number(accrual);
            if (!Number.isNaN(n) && n !== type.accrualRate) {
              patch({ accrualRate: n }, "Accrual rate updated");
            }
          }}
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[11px] uppercase tracking-wide text-slate-400" htmlFor={`col-${type.id}`}>
          Colour
        </label>
        <input
          id={`col-${type.id}`}
          type="color"
          className="h-8 w-10 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
          value={colour}
          onChange={(e) => setColour(e.target.value)}
          onBlur={() => colour !== type.colour && patch({ colour })}
        />
      </div>

      <button
        type="button"
        onClick={() => patch({ isPaid: !type.isPaid }, type.isPaid ? "Set to unpaid" : "Set to paid")}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          type.isPaid ? "bg-emerald-500" : "bg-slate-300"
        }`}
        aria-pressed={type.isPaid}
        aria-label={`${type.isPaid ? "Make unpaid" : "Make paid"} ${type.name}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            type.isPaid ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
      <span className={`w-10 text-[11px] ${type.isPaid ? "text-emerald-700" : "text-slate-400"}`}>
        {type.isPaid ? "Paid" : "Unpaid"}
      </span>

      <button
        type="button"
        onClick={() =>
          patch({ isActive: !type.isActive }, type.isActive ? "Deactivated" : "Activated")
        }
        className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${
          type.isActive
            ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            : "border-rose-200 text-rose-600 hover:bg-rose-50"
        }`}
      >
        {type.isActive ? "Active" : "Inactive"}
      </button>
    </div>
  );
}

/** Editable list of this organisation's LeaveType rows. */
export default function LeaveTypeList({ types }: { types: LeaveTypeDto[] }) {
  if (types.length === 0) {
    return (
      <div className="card px-4 py-8 text-center text-sm text-slate-500">
        No leave types have been configured for this organisation.
      </div>
    );
  }

  return (
    <div className="card divide-y divide-slate-100">
      {types.map((t) => (
        <TypeRow key={t.id} type={t} />
      ))}
    </div>
  );
}
