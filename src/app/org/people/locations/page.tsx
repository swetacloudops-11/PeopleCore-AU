import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { LocationActions, DeleteLocationButton, type LocationRow } from "./LocationActions";

export default async function LocationsPage() {
  const { organisationId } = await orgContext();

  const locations = await prisma.location.findMany({
    where: { organisationId },
    orderBy: { name: "asc" },
    include: { _count: { select: { employees: true, shifts: true } } },
  });

  const totalAssigned = locations.reduce((s, l) => s + l._count.employees, 0);
  const remoteCount = locations.filter((l) => l.isRemote).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Locations
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Work sites, regions and remote bases across your organisation.
          </p>
        </div>
        <LocationActions />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Locations" value={locations.length} tone="indigo" />
        <StatCard label="Employees assigned" value={totalAssigned} tone="emerald" />
        <StatCard label="Remote bases" value={remoteCount} tone="sky" />
        <StatCard label="Shifts scheduled" value={locations.reduce((s, l) => s + l._count.shifts, 0)} hint="Across all locations" tone="amber" />
      </div>

      <div className="mt-6">
        {locations.length === 0 ? (
          <EmptyState
            title="No locations yet"
            hint="Add your work sites so employees and shifts can be assigned to them."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Location</th>
                <th className="th">Address</th>
                <th className="th">Timezone</th>
                <th className="th">Flags</th>
                <th className="th">Employees</th>
                <th className="th">Shifts</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {locations.map((l) => {
                const row: LocationRow = {
                  id: l.id,
                  name: l.name,
                  addressLine1: l.addressLine1,
                  city: l.city,
                  state: l.state,
                  postcode: l.postcode,
                  timezone: l.timezone,
                  isRemote: l.isRemote,
                  isDefault: l.isDefault,
                };
                return (
                  <tr key={l.id} className="hover:bg-slate-50/70">
                    <td className="td font-medium text-slate-800">{l.name}</td>
                    <td className="td text-slate-600">
                      {l.addressLine1 ?? "—"}
                      {l.city && (
                        <span className="block text-xs text-slate-400">
                          {[l.city, l.state, l.postcode].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </td>
                    <td className="td text-slate-600">{l.timezone}</td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        {l.isRemote && <Badge tone="purple">REMOTE</Badge>}
                        {l.isDefault && <Badge tone="blue">DEFAULT</Badge>}
                      </div>
                    </td>
                    <td className="td">
                      <Badge tone={l._count.employees > 0 ? "green" : "slate"}>
                        {l._count.employees}
                      </Badge>
                    </td>
                    <td className="td text-slate-600">{l._count.shifts}</td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-3">
                        <LocationActions location={row} />
                        <DeleteLocationButton location={row} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
