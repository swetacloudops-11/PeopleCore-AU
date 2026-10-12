import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { ChartPanel, Donut, type DonutSegment, type Tone } from "@/components/charts";
import { CertificationActions, NewCertificationButton } from "./CertificationActions";

/** Chart palette (distinct from Badge tones). */
const STATUS_TONE: Record<string, Tone> = {
  CURRENT: "emerald",
  EXPIRING: "amber",
  EXPIRED: "rose",
  PENDING: "slate",
};

export default async function HrCertificationsPage() {
  const { organisationId } = await hrContext();

  const [catalogue, statusGroups, totalRecords, expiring, expired, mandatory, employees] =
    await Promise.all([
      prisma.certification.findMany({
        where: { organisationId },
        orderBy: { name: "asc" },
        include: { _count: { select: { assignments: true } } },
      }),
      prisma.employeeCertification.groupBy({
        by: ["status"],
        where: { employee: { organisationId } },
        _count: true,
      }),
      prisma.employeeCertification.count({ where: { employee: { organisationId } } }),
      prisma.employeeCertification.count({
        where: { employee: { organisationId }, status: "EXPIRING" },
      }),
      prisma.employeeCertification.count({
        where: { employee: { organisationId }, status: "EXPIRED" },
      }),
      prisma.certification.count({ where: { organisationId, isMandatory: true } }),
      prisma.employee.findMany({
        where: { organisationId, employmentStatus: { not: "TERMINATED" } },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: { id: true, firstName: true, lastName: true, employeeNumber: true },
      }),
    ]);

  const segments: DonutSegment[] = statusGroups
    .map((s) => ({
      label: s.status.replace("_", " "),
      value: s._count,
      tone: STATUS_TONE[s.status] ?? "slate",
    }))
    .sort((a, b) => b.value - a.value);

  const employeeOptions = employees.map((e) => ({
    id: e.id,
    name: `${e.firstName} ${e.lastName} (${e.employeeNumber})`,
  }));
  const certificationOptions = catalogue.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Certifications
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            The certification catalogue and how it maps to employees across the organisation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <NewCertificationButton />
          <CertificationActions
            employees={employeeOptions}
            certifications={certificationOptions}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Certifications" value={catalogue.length} hint={`${mandatory} mandatory`} tone="sky" />
        <StatCard label="Records" value={totalRecords} hint="Employee certifications" tone="indigo" />
        <StatCard
          label="Expiring"
          value={expiring}
          hint="Renewal due"
          tone={expiring ? "amber" : "emerald"}
        />
        <StatCard
          label="Expired"
          value={expired}
          hint="Out of compliance"
          tone={expired ? "rose" : "emerald"}
        />
        <StatCard
          label="Needs attention"
          value={expiring + expired}
          hint="Expiring + expired"
          tone={expiring + expired ? "rose" : "emerald"}
        />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <ChartPanel title="Records by status" subtitle="Every employee certification">
          <Donut
            segments={segments}
            size={140}
            thickness={16}
            centerValue={totalRecords}
            centerLabel="records"
          />
        </ChartPanel>
        <div className="md:col-span-2">
          {catalogue.length === 0 ? (
            <EmptyState
              title="No certifications defined"
              hint="Create a certification to start tracking employee compliance."
            />
          ) : (
            <TableWrap>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Certification</th>
                  <th className="th">Issuing body</th>
                  <th className="th">Validity</th>
                  <th className="th">Mandatory</th>
                  <th className="th">Holders</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catalogue.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <div className="font-medium text-slate-800">{c.name}</div>
                      {c.description && (
                        <div className="max-w-md truncate text-[11px] text-slate-400">
                          {c.description}
                        </div>
                      )}
                    </td>
                    <td className="td text-slate-600">{c.issuingBody ?? "—"}</td>
                    <td className="td whitespace-nowrap text-slate-600">
                      {c.validityMonths ? `${c.validityMonths} months` : "—"}
                    </td>
                    <td className="td">
                      {c.isMandatory ? (
                        <Badge tone="purple">MANDATORY</Badge>
                      ) : (
                        <span className="text-slate-400">Optional</span>
                      )}
                    </td>
                    <td className="td">
                      <Link href={`/hr/certifications/records?certification=${c.id}`}>
                        <Badge tone={c._count.assignments > 0 ? "green" : "slate"}>
                          {c._count.assignments}{" "}
                          {c._count.assignments === 1 ? "holder" : "holders"}
                        </Badge>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Link href="/hr/certifications/expiring" className="btn-secondary !py-1.5 text-xs">
          Expiring certifications →
        </Link>
        <Link href="/hr/certifications/records" className="btn-secondary !py-1.5 text-xs">
          All certification records →
        </Link>
      </div>
    </div>
  );
}
