"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Props = {
  /** Today's record, serialised — nulls when nothing has been recorded yet. */
  clockIn: string | null;
  clockOut: string | null;
  breakMinutes: number;
  workedMinutes: number;
};

const fmtClock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });

export default function ClockWidget({ clockIn, clockOut, breakMinutes, workedMinutes }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  /** Ticks after mount so SSR and hydration agree; drives the live elapsed timer. */
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // Async so the hydration pass renders the same SSR output; then tick.
    const initial = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearTimeout(initial);
      clearInterval(t);
    };
  }, []);

  const onClock = Boolean(clockIn && !clockOut);
  const done = Boolean(clockIn && clockOut);

  async function act(action: "clock_in" | "clock_out") {
    if (busy) return;
    setBusy(true);
    const res = await apiCall<{ error?: string }>(
      "/api/employee/attendance",
      "POST",
      { action },
      { silent: true }
    );
    const msg = (res.data as { error?: string } | undefined)?.error;
    if (res.ok) {
      toast.success(
        action === "clock_in"
          ? "Clocked in — have a great shift!"
          : "Clocked out — your day has been saved"
      );
      router.refresh();
    } else if (res.status === 409) {
      toast.error(msg ?? "Attendance already recorded for today");
      router.refresh();
    } else {
      toast.error(msg ?? "Something went wrong — please try again");
    }
    setBusy(false);
  }

  const inMs = clockIn ? new Date(clockIn).getTime() : 0;
  const outMs = clockOut ? new Date(clockOut).getTime() : 0;

  const elapsedMin =
    onClock && now !== null ? Math.max(0, Math.floor((now - inMs) / 60000)) : 0;
  const elapsedLabel = `${Math.floor(elapsedMin / 60)}h ${String(elapsedMin % 60).padStart(2, "0")}m`;

  const worked =
    workedMinutes > 0
      ? workedMinutes
      : done && inMs && outMs
      ? Math.max(0, Math.round((outMs - inMs) / 60000) - breakMinutes)
      : 0;
  const workedHours = Math.round((worked / 60) * 100) / 100;

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Today</h2>
        {done ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
            ● Shift complete
          </span>
        ) : onClock ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-medium text-violet-700">
            ● On the clock
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
            ● Not clocked in
          </span>
        )}
      </div>

      <div className="grid place-items-center px-6 py-10 text-center">
        {!clockIn && (
          <>
            <div className="text-4xl">🕒</div>
            <p className="mt-3 text-sm text-slate-500">You haven&apos;t started your day yet.</p>
            <button
              type="button"
              onClick={() => act("clock_in")}
              disabled={busy}
              className="btn-primary mt-5 !px-8 !py-3 text-base"
            >
              {busy ? "Clocking in…" : "Clock in"}
            </button>
          </>
        )}

        {onClock && clockIn && (
          <>
            <div className="text-4xl">⏱️</div>
            <p className="mt-3 text-sm text-slate-600">
              You clocked in at{" "}
              <span className="font-semibold tabular-nums text-slate-900" suppressHydrationWarning>
                {fmtClock(clockIn)}
              </span>
            </p>
            <p
              className="mt-1 text-2xl font-semibold tabular-nums text-violet-700"
              suppressHydrationWarning
            >
              {now === null ? "—" : elapsedLabel}
            </p>
            <p className="text-xs text-slate-400">
              elapsed{breakMinutes > 0 ? ` · ${breakMinutes}m break deducted on clock out` : ""}
            </p>
            <button
              type="button"
              onClick={() => act("clock_out")}
              disabled={busy}
              className="btn-secondary mt-5 !px-8 !py-3 text-base"
            >
              {busy ? "Saving…" : "Clock out"}
            </button>
          </>
        )}

        {done && clockIn && clockOut && (
          <>
            <div className="text-4xl">✅</div>
            <p className="mt-3 text-lg font-semibold text-slate-900">
              Day complete — {workedHours}h worked
            </p>
            <p className="mt-1 text-sm text-slate-500">
              <span suppressHydrationWarning>{fmtClock(clockIn)}</span>
              {" – "}
              <span suppressHydrationWarning>{fmtClock(clockOut)}</span>
              {breakMinutes > 0 ? ` · ${breakMinutes}m break` : ""}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Saved to your attendance history{workedMinutes > 0 ? "" : " — hours update on next clock out"}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
