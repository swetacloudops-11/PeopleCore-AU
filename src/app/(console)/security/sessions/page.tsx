import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, TableWrap, EmptyState, StatCard } from "@/components/ui";
import { formatDateTime, timeAgo } from "@/lib/format";
import RevokeSession from "./RevokeSession";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const now = new Date();

  const [sessions, activeCount, revokedCount, userCounts] = await Promise.all([
    prisma.userSession.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: 100,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.userSession.count({
      where: { revokedAt: null, expiresAt: { gt: now } },
    }),
    prisma.userSession.count({ where: { revokedAt: { not: null } } }),
    prisma.userSession.groupBy({
      by: ["userId"],
      where: { revokedAt: null, expiresAt: { gt: now } },
      _count: true,
    }),
  ]);

  const describe = (ua: string | null) => {
    if (!ua) return { browser: "Unknown", os: "Unknown", device: "Unknown" };
    const browser = /Edg\//.test(ua)
      ? "Edge"
      : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
      ? "Firefox"
      : /Safari\//.test(ua)
      ? "Safari"
      : "Other";
    const os = /Windows/.test(ua)
      ? "Windows"
      : /Mac OS X/.test(ua)
      ? "macOS"
      : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Android/.test(ua)
      ? "Android"
      : /Linux/.test(ua)
      ? "Linux"
      : "Unknown";
    const device = /iPhone|iPad|Android/.test(ua) ? "Mobile" : "Desktop";
    return { browser, os, device };
  };

  return (
    <div>
      <PageHeader
        title="Sessions"
        subtitle="Active and historical administrator sessions across the console"
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active sessions" value={activeCount} tone="emerald" />
        <StatCard label="Signed-in users" value={userCounts.length} tone="indigo" />
        <StatCard label="Revoked" value={revokedCount} tone="amber" />
        <StatCard label="Total tracked" value={sessions.length} hint="Most recent 100" tone="sky" />
      </div>

      {sessions.length === 0 ? (
        <EmptyState title="No sessions recorded" hint="Sessions appear here as administrators sign in." />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">User</th>
              <th className="th">Device</th>
              <th className="th">IP address</th>
              <th className="th">Signed in</th>
              <th className="th">Last seen</th>
              <th className="th">Expires</th>
              <th className="th">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sessions.map((s) => {
              const info = describe(s.userAgent);
              const isRevoked = s.revokedAt !== null;
              const isExpired = s.expiresAt <= now;
              const state = isRevoked ? "REVOKED" : isExpired ? "EXPIRED" : "ACTIVE";
              const tone = state === "ACTIVE" ? "green" : state === "EXPIRED" ? "slate" : "red";

              return (
                <tr key={s.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <div className="font-medium text-slate-800">{s.user.name}</div>
                    <div className="text-xs text-slate-400">{s.user.email}</div>
                  </td>
                  <td className="td">
                    <div className="text-slate-700">
                      {info.browser} · {info.os}
                    </div>
                    <div className="text-[11px] text-slate-400">{info.device}</div>
                  </td>
                  <td className="td font-mono text-xs text-slate-600">{s.ip ?? "—"}</td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {formatDateTime(s.createdAt)}
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {timeAgo(s.lastSeenAt)}
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {formatDateTime(s.expiresAt)}
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <Badge tone={tone}>{state}</Badge>
                      {state === "ACTIVE" && <RevokeSession id={s.id} />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
