import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, TableWrap, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import OrgRowActions from "@/components/OrgRowActions";

export const dynamic = "force-dynamic";

export default async function DisabledOrganisationsPage() {
  const orgs = await prisma.organisation.findMany({
    where: { status: "DISABLED" },
    orderBy: { disabledAt: "desc" },
    include: {
      subscriptions: { include: { plan: true }, take: 1, orderBy: { createdAt: "desc" } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Disabled Organisations"
        subtitle={`${orgs.length} organisation${orgs.length === 1 ? "" : "s"} currently suspended from the platform`}
      />

      {orgs.length === 0 ? (
        <EmptyState
          title="No disabled organisations"
          hint="Organisations you disable will appear here with the reason and timestamp."
        />
      ) : (
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Organisation</th>
              <th className="th">Plan</th>
              <th className="th">Reason</th>
              <th className="th">Disabled</th>
              <th className="th">Status</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orgs.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50/70">
                <td className="td">
                  <div className="font-medium text-slate-800">{o.name}</div>
                  <div className="text-xs text-slate-400">{o.email ?? o.slug}</div>
                </td>
                <td className="td">
                  {o.subscriptions[0]?.plan ? (
                    <Badge tone="blue">{o.subscriptions[0].plan.name}</Badge>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="td max-w-xs">
                  <span className="block truncate text-slate-600">
                    {o.disabledReason ?? "No reason recorded"}
                  </span>
                </td>
                <td className="td text-slate-500">{formatDate(o.disabledAt)}</td>
                <td className="td">
                  <Badge tone="red">DISABLED</Badge>
                </td>
                <td className="td">
                  <OrgRowActions id={o.id} name={o.name} status={o.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <div className="mt-4">
        <Link href="/organisations" className="btn-secondary">
          ← Back to all organisations
        </Link>
      </div>
    </div>
  );
}
