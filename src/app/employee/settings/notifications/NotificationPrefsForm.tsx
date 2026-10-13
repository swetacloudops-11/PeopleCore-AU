"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

/** The six self-service notification topics — keys match the API contract. */
const TOPICS: Array<{ key: string; label: string; hint: string }> = [
  {
    key: "shift_updates",
    label: "Shift updates and roster changes",
    hint: "Published rosters, new shifts and swap outcomes",
  },
  {
    key: "leave_updates",
    label: "Leave request status changes",
    hint: "Approvals, rejections and notes on your requests",
  },
  {
    key: "payslip_ready",
    label: "New payslip available",
    hint: "Each time a payslip is issued to you",
  },
  {
    key: "task_reminders",
    label: "Task due reminders",
    hint: "Onboarding and task due dates coming up",
  },
  {
    key: "announcements",
    label: "Company announcements",
    hint: "News shared with everyone in the organisation",
  },
  {
    key: "email_digest",
    label: "Daily email digest",
    hint: "One summary email each day instead of instant alerts",
  },
];

export default function NotificationPrefsForm({
  initial,
}: {
  initial: Record<string, boolean>;
}) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(TOPICS.map((t) => [t.key, initial[t.key] ?? true]))
  );
  const [busy, setBusy] = useState(false);

  function toggle(key: string) {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    const res = await apiCall("/api/employee/notifications", "PATCH", {
      action: "prefs",
      prefs,
    });

    setBusy(false);
    if (res.ok) {
      toast.success("Notification preferences saved");
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="card divide-y divide-slate-100">
        {TOPICS.map((t) => {
          const on = prefs[t.key];
          return (
            <div key={t.key} className="flex flex-wrap items-center gap-4 px-4 py-3.5 sm:px-5">
              <div className="min-w-[220px] flex-1">
                <span className="text-sm font-medium text-slate-800">{t.label}</span>
                <p className="mt-0.5 text-xs text-slate-500">{t.hint}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggle(t.key)}
                  className={`relative h-6 w-11 rounded-full transition ${
                    on ? "bg-violet-500" : "bg-slate-300"
                  }`}
                  aria-pressed={on}
                  aria-label={t.label}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full pc-knob shadow transition ${
                      on ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
                <span className={`w-16 text-xs font-medium ${on ? "text-violet-700" : "text-slate-400"}`}>
                  {on ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-slate-400">
          Preferences apply to your account only. Topics you haven&apos;t touched default to on.
        </p>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save preferences"}
        </button>
      </div>
    </form>
  );
}
