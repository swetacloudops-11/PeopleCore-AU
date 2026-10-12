import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { Badge, PageHeader, TableWrap, EmptyState } from "@/components/ui";
import { formatDateTime, timeAgo } from "@/lib/format";
import InviteForm from "./InviteForm";

export const dynamic = "force-dynamic";

export default async function InviteUsersPage() {
  const { organisationId, org } = await orgContext();

  const [roles, pending] = await Promise.all([
    prisma.role.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      select: { id: true, key: true, name: true, description: true },
    }),
    prisma.user.findMany({
      where: { organisationId, lastLoginAt: null },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { roleAssignments: { include: { role: true } } },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Invite Users"
        subtitle="Create accounts for this organisation and hand over their sign-in details"
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <InviteForm roles={roles.map((r) => ({ key: r.key, name: r.name }))} />
        </div>

        <div className="lg:col-span-2">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-800">How invites work</h2>
            <ol className="mt-3 space-y-2 text-xs leading-relaxed text-slate-500">
              <li>
                <span className="font-semibold text-slate-700">1.</span> Create the account with a
                name, email and organisation role.
              </li>
              <li>
                <span className="font-semibold text-slate-700">2.</span> Set a password yourself, or
                let us generate a one-time invite password.
              </li>
              <li>
                <span className="font-semibold text-slate-700">3.</span> Share the details securely
                — the generated password is shown once and never again.
              </li>
              <li>
                <span className="font-semibold text-slate-700">4.</span> Their first sign-in records
                a last-login timestamp so you can track activation.
              </li>
            </ol>
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
              Accounts are created inside{" "}
              <span className="font-semibold text-slate-700">{org.name}</span> only — platform
              (super admin) accounts are never listed here.
            </div>
          </div>
        </div>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">
            Outstanding invites &amp; pending users
          </h2>
          <span className="text-xs text-slate-400">Accounts that have never signed in</span>
        </div>

        {pending.length === 0 ? (
          <EmptyState
            title="No outstanding invites"
            hint="Every account in this organisation has signed in at least once."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">User</th>
                <th className="th">Role</th>
                <th className="th">Status</th>
                <th className="th">Invited</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pending.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <div className="font-medium text-slate-800">{u.name}</div>
                    <div className="text-xs text-slate-400">{u.email}</div>
                  </td>
                  <td className="td">
                    {u.roleAssignments[0]?.role ? (
                      <Badge tone="blue">{u.roleAssignments[0].role.name}</Badge>
                    ) : (
                      <span className="text-slate-400">No role</span>
                    )}
                  </td>
                  <td className="td">
                    <Badge tone={u.status === "ACTIVE" ? "amber" : "red"}>
                      {u.status === "ACTIVE" ? "INVITED" : u.status}
                    </Badge>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    <div>{formatDateTime(u.createdAt)}</div>
                    <div className="text-[11px] text-slate-400">{timeAgo(u.createdAt)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>
    </div>
  );
}
