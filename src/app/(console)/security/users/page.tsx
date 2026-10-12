import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { Badge, TableWrap, EmptyState, StatCard } from "@/components/ui";
import { formatDate, formatDateTime, timeAgo, initials } from "@/lib/format";
import UserManager from "@/components/UserManager";
import UserRowActions from "@/components/UserRowActions";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await getSession();

  const [users, roles, activeSessions] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        roleAssignments: { include: { role: true } },
        _count: { select: { sessions: true, auditLogs: true } },
      },
    }),
    prisma.role.findMany({ orderBy: { name: "asc" }, select: { key: true, name: true } }),
    prisma.userSession.count({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);

  const activeCount = users.filter((u) => u.status === "ACTIVE").length;
  const suspended = users.length - activeCount;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Users
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {users.length} console account{users.length === 1 ? "" : "s"} · {activeSessions}{" "}
            active session{activeSessions === 1 ? "" : "s"}
          </p>
        </div>
        <UserManager
          roles={roles}
          currentUserId={session?.id ?? ""}
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total users" value={users.length} tone="indigo" />
        <StatCard label="Active" value={activeCount} tone="emerald" />
        <StatCard label="Suspended" value={suspended} tone={suspended ? "rose" : "emerald"} />
        <StatCard label="Live sessions" value={activeSessions} tone="sky" />
      </div>

      {users.length === 0 ? (
        <EmptyState title="No console users" hint="Add the first administrator to get started." />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">User</th>
              <th className="th">Role</th>
              <th className="th">Status</th>
              <th className="th">Last sign-in</th>
              <th className="th">Sessions</th>
              <th className="th">Created</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const role = u.roleAssignments[0]?.role;
              const isSelf = u.id === session?.id;
              return (
                <tr key={u.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white ${
                          u.status === "ACTIVE" ? "bg-indigo-600" : "bg-slate-400"
                        }`}
                      >
                        {initials(u.name)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-medium text-slate-800">
                          <span className="truncate">{u.name}</span>
                          {isSelf && <Badge tone="purple">YOU</Badge>}
                        </div>
                        <div className="truncate text-xs text-slate-400">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="td">
                    {role ? <Badge tone="blue">{role.name}</Badge> : <span className="text-slate-400">None</span>}
                  </td>
                  <td className="td">
                    <Badge tone={u.status === "ACTIVE" ? "green" : "red"}>{u.status}</Badge>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {u.lastLoginAt ? (
                      <>
                        <div>{formatDateTime(u.lastLoginAt)}</div>
                        <div className="text-[11px] text-slate-400">
                          {timeAgo(u.lastLoginAt)}
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-400">Never</span>
                    )}
                  </td>
                  <td className="td text-slate-500">{u._count.sessions}</td>
                  <td className="td text-slate-500">{formatDate(u.createdAt)}</td>
                  <td className="td">
                    <UserRowActions
                      id={u.id}
                      name={u.name}
                      email={u.email}
                      status={u.status}
                      isSelf={isSelf}
                      roleKey={role?.key ?? null}
                    />
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
