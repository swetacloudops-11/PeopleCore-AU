import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orgContext, intParam, strParam, qs } from "@/lib/org";
import { Badge, PageHeader, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, Donut, BarList, type DonutSegment } from "@/components/charts";
import { formatDate, formatDateTime, timeAgo, initials } from "@/lib/format";
import UserRowActions from "./UserRowActions";

export const dynamic = "force-dynamic";

type Search = { q?: string; status?: string; page?: string };

export default async function OrgUsersPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { organisationId, session } = await orgContext();
  const sp = await searchParams;
  const q = strParam(sp.q);
  const status: "ACTIVE" | "SUSPENDED" | undefined =
    sp.status === "ACTIVE" ? "ACTIVE" : sp.status === "SUSPENDED" ? "SUSPENDED" : undefined;
  const page = intParam(sp.page, 1);
  const pageSize = 25;

  const where = {
    organisationId,
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [filtered, users, totalOrg, activeCount, suspendedCount, noRole, roles, byStatus, byRole] =
    await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          roleAssignments: { include: { role: true } },
          employeeProfile: {
            select: { firstName: true, lastName: true, employeeNumber: true },
          },
        },
      }),
      prisma.user.count({ where: { organisationId } }),
      prisma.user.count({ where: { organisationId, status: "ACTIVE" } }),
      prisma.user.count({ where: { organisationId, status: "SUSPENDED" } }),
      prisma.user.count({ where: { organisationId, roleAssignments: { none: {} } } }),
      prisma.role.findMany({
        where: { organisationId },
        orderBy: { name: "asc" },
        select: { id: true, key: true, name: true },
      }),
      prisma.user.groupBy({
        by: ["status"],
        where: { organisationId },
        _count: true,
      }),
      prisma.roleAssignment.groupBy({
        by: ["roleId"],
        where: { role: { organisationId } },
        _count: true,
        orderBy: { _count: { roleId: "desc" } },
        take: 8,
      }),
    ]);

  const totalPages = Math.max(1, Math.ceil(filtered / pageSize));
  const roleOptions = roles.map((r) => ({ key: r.key, name: r.name }));

  // ── chart data ──
  const statusCount = (s: string) => byStatus.find((r) => r.status === s)?._count ?? 0;
  const roleItems = byRole.map((r) => ({
    label: roles.find((x) => x.id === r.roleId)?.name ?? "Unknown role",
    value: r._count,
  }));

  const chips: Array<{ key: string; label: string; n: number }> = [
    { key: "ALL", label: "All", n: totalOrg },
    { key: "ACTIVE", label: "Active", n: activeCount },
    { key: "SUSPENDED", label: "Suspended", n: suspendedCount },
  ];

  return (
    <div>
      <PageHeader
        title="All Users"
        subtitle={`${totalOrg} organisation account${totalOrg === 1 ? "" : "s"} · platform accounts are excluded`}
        action={{ label: "Invite user", href: "/org/users/invite" }}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total users" value={totalOrg} tone="indigo" hint="In this organisation" />
        <StatCard label="Active" value={activeCount} hint="Can sign in" tone="emerald" />
        <StatCard
          label="Suspended"
          value={suspendedCount}
          hint={suspendedCount ? "Sessions revoked" : "None suspended"}
          tone={suspendedCount ? "rose" : "emerald"}
        />
        <StatCard
          label="No role"
          value={noRole}
          hint={noRole ? "Assign a role" : "Everyone has a role"}
          tone={noRole ? "amber" : "emerald"}
        />
      </div>

      {/* ── Visual breakdowns ── */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <ChartPanel title="Accounts by status" subtitle="Organisation users only">
          <Donut
            segments={(
              [
                { label: "Active", value: statusCount("ACTIVE"), tone: "emerald" },
                { label: "Suspended", value: statusCount("SUSPENDED"), tone: "rose" },
                { label: "Invited", value: statusCount("INVITED"), tone: "sky" },
                { label: "Disabled", value: statusCount("DISABLED"), tone: "slate" },
              ] as DonutSegment[]
            ).filter((s) => s.value > 0)}
            size={132}
            thickness={16}
            centerValue={totalOrg}
            centerLabel="users"
          />
        </ChartPanel>

        <ChartPanel
          title="Users by role"
          subtitle="How access is distributed"
          action={
            <Link href="/org/users/roles" className="text-[11px] text-indigo-600 hover:underline">
              Roles →
            </Link>
          }
        >
          {roleItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No role assignments yet</p>
          ) : (
            <BarList items={roleItems} valueFormat={(v) => String(v)} />
          )}
        </ChartPanel>
      </div>

      {/* Status chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {chips.map((c) => (
          <Link
            key={c.key}
            href={qs({ q, status: c.key, page: 1 })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              (status ?? "ALL") === c.key
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {c.label} · {c.n}
          </Link>
        ))}
      </div>

      {/* Search */}
      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="label" htmlFor="q">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Name or email…"
          />
        </div>
        <input type="hidden" name="status" value={status ?? "ALL"} />
        <button type="submit" className="btn-secondary">
          Search
        </button>
        {q && (
          <Link href={qs({ status })} className="btn-secondary">
            Reset
          </Link>
        )}
      </form>

      {users.length === 0 ? (
        <EmptyState
          title={
            q
              ? "No users match your search"
              : page > 1
              ? "No users on this page"
              : "No users yet"
          }
          hint={
            q
              ? "Try a different name or email, or clear the filters."
              : "Invite your first colleague to get started."
          }
        />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">User</th>
              <th className="th">Role</th>
              <th className="th">Employee</th>
              <th className="th">Status</th>
              <th className="th">Last login</th>
              <th className="th">Created</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const role = u.roleAssignments[0]?.role;
              const isSelf = u.id === session.id;
              const employee = u.employeeProfile
                ? `${u.employeeProfile.firstName} ${u.employeeProfile.lastName}`
                : null;
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
                    {role ? (
                      <Badge tone="blue">{role.name}</Badge>
                    ) : (
                      <span className="text-slate-400">No role</span>
                    )}
                  </td>
                  <td className="td text-slate-500">
                    {employee ? (
                      <>
                        <div className="text-slate-700">{employee}</div>
                        <div className="text-[11px] text-slate-400">
                          {u.employeeProfile?.employeeNumber}
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-400">Not linked</span>
                    )}
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
                  <td className="td whitespace-nowrap text-slate-500">
                    {formatDate(u.createdAt)}
                  </td>
                  <td className="td">
                    <UserRowActions
                      id={u.id}
                      name={u.name}
                      email={u.email}
                      status={u.status}
                      roleKey={role?.key ?? null}
                      isSelf={isSelf}
                      roles={roleOptions}
                      employeeLabel={employee}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {page} of {totalPages} · {filtered} user{filtered === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={qs({ q, status, page: page - 1 })} className="btn-secondary">
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={qs({ q, status, page: page + 1 })} className="btn-secondary">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
