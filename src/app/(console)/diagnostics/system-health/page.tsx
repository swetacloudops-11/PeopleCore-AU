import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, StatCard } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function check(name: string, fn: () => Promise<unknown>) {
  const started = Date.now();
  try {
    await fn();
    return { name, ok: true, latencyMs: Date.now() - started, detail: "OK" };
  } catch (e) {
    return {
      name,
      ok: false,
      latencyMs: Date.now() - started,
      detail: e instanceof Error ? e.message.slice(0, 120) : "Unknown error",
    };
  }
}

async function refreshHealth() {
  "use server";
  revalidatePath("/diagnostics/system-health");
}

export default async function SystemHealthPage() {
  const checks = await Promise.all([
    check("PostgreSQL database", () => prisma.$queryRaw`SELECT 1`),
    check("Organisations table", () => prisma.organisation.count()),
    check("Audit log writer", () => prisma.auditLog.findFirst({ take: 1 })),
    check("Sync log pipeline", () => prisma.syncLog.findFirst({ take: 1 })),
    check("Job queue", () => prisma.job.findFirst({ take: 1 })),
    check("Session store", () => prisma.userSession.findFirst({ take: 1 })),
  ]);

  const [
    openErrors,
    criticalErrors,
    failedJobs,
    runningJobs,
    queuedJobs,
    failedSyncs,
    recentSyncs,
    orgCount,
    sessionCount,
  ] = await Promise.all([
    prisma.errorLog.count({ where: { resolved: false } }),
    prisma.errorLog.count({ where: { severity: "CRITICAL", resolved: false } }),
    prisma.job.count({ where: { status: "FAILED" } }),
    prisma.job.count({ where: { status: "RUNNING" } }),
    prisma.job.count({ where: { status: "QUEUED" } }),
    prisma.syncLog.count({ where: { status: "FAILED" } }),
    prisma.syncLog.count(),
    prisma.organisation.count(),
    prisma.userSession.count({ where: { revokedAt: null } }),
  ]);

  const mem = process.memoryUsage();
  const uptimeSec = Math.floor(process.uptime());
  const allHealthy = checks.every((c) => c.ok) && criticalErrors === 0;

  const overallTone = allHealthy ? "green" : criticalErrors > 0 ? "red" : "amber";

  const componentStatus = [
    {
      name: "API server",
      status: "Operational",
      detail: `Next.js runtime · up ${Math.floor(uptimeSec / 60)}m ${uptimeSec % 60}s`,
      tone: "green",
    },
    {
      name: "Database",
      status: checks[0].ok ? "Operational" : "Down",
      detail: `PostgreSQL 16 · ${checks[0].latencyMs}ms`,
      tone: checks[0].ok ? "green" : "red",
    },
    {
      name: "Background jobs",
      status: failedJobs > 0 ? "Degraded" : "Operational",
      detail: `${runningJobs} running · ${queuedJobs} queued · ${failedJobs} failed`,
      tone: failedJobs > 0 ? "amber" : "green",
    },
    {
      name: "Integration pipeline",
      status: failedSyncs > 0 ? "Degraded" : "Operational",
      detail: `${recentSyncs} syncs logged · ${failedSyncs} failed`,
      tone: failedSyncs > 0 ? "amber" : "green",
    },
    {
      name: "Error monitoring",
      status: criticalErrors > 0 ? "Critical" : openErrors > 0 ? "Degraded" : "Operational",
      detail: `${openErrors} open · ${criticalErrors} critical`,
      tone: criticalErrors > 0 ? "red" : openErrors > 0 ? "amber" : "green",
    },
    {
      name: "Session store",
      status: "Operational",
      detail: `${sessionCount} tracked sessions`,
      tone: "green",
    },
  ];

  const recentErrors = await prisma.errorLog.findMany({
    where: { resolved: false },
    orderBy: { occurredAt: "desc" },
    take: 5,
  });

  return (
    <div>
      <PageHeader
        title="System Health"
        subtitle={`Live platform status · ${checks.length} probes · ${formatDateTime(new Date())}`}
      />

      <div className="mb-6 flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <span
          className={`grid h-14 w-14 place-items-center rounded-full text-2xl ${
            overallTone === "green"
              ? "bg-emerald-100"
              : overallTone === "amber"
              ? "bg-amber-100"
              : "bg-rose-100"
          }`}
        >
          {overallTone === "green" ? "✅" : overallTone === "amber" ? "⚠️" : "🚨"}
        </span>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-900">
            {overallTone === "green"
              ? "All systems operational"
              : criticalErrors > 0
              ? "Critical issues detected"
              : "Minor degradation detected"}
          </h2>
          <p className="text-sm text-slate-500">
            {checks.filter((c) => c.ok).length}/{checks.length} health probes passing ·
            running for {Math.floor(uptimeSec / 60)} minutes
          </p>
        </div>
        <form action={refreshHealth}>
          <button type="submit" className="btn-secondary">↻ Re-check</button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Heap used" value={`${Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10} MB`} hint={`${Math.round((mem.rss / 1024 / 1024) * 10) / 10} MB resident`} tone="indigo" />
        <StatCard label="Organisations" value={orgCount} hint="Registered on platform" tone="sky" />
        <StatCard label="Open errors" value={openErrors} hint={`${criticalErrors} critical`} tone={criticalErrors ? "rose" : "emerald"} />
        <StatCard label="Queue depth" value={queuedJobs + runningJobs} hint={`${runningJobs} running now`} tone="amber" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Component status</h2>
          <div className="card divide-y divide-slate-100">
            {componentStatus.map((c) => (
              <div key={c.name} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    c.tone === "green"
                      ? "bg-emerald-500"
                      : c.tone === "amber"
                      ? "bg-amber-500"
                      : "bg-rose-500"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800">{c.name}</div>
                  <div className="truncate text-xs text-slate-400">{c.detail}</div>
                </div>
                <Badge tone={c.tone === "green" ? "green" : c.tone === "amber" ? "amber" : "red"}>
                  {c.status}
                </Badge>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Health probes</h2>
          <div className="card divide-y divide-slate-100">
            {checks.map((c) => (
              <div key={c.name} className="flex items-center gap-3 px-4 py-3">
                <span className={c.ok ? "text-emerald-600" : "text-rose-600"}>
                  {c.ok ? "✓" : "✗"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-700">{c.name}</div>
                  {!c.ok && (
                    <div className="truncate text-xs text-rose-600">{c.detail}</div>
                  )}
                </div>
                <span className="text-xs tabular-nums text-slate-400">{c.latencyMs}ms</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Most recent unresolved errors</h2>
        <div className="card divide-y divide-slate-100">
          {recentErrors.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              No unresolved errors — platform is clean.
            </p>
          )}
          {recentErrors.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Badge
                tone={
                  e.severity === "CRITICAL" || e.severity === "ERROR"
                    ? "red"
                    : e.severity === "WARNING"
                    ? "amber"
                    : "blue"
                }
              >
                {e.severity}
              </Badge>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{e.message}</span>
              <span className="text-xs text-slate-400">{formatDateTime(e.occurredAt)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
