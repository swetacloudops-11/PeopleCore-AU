import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { PageHeader, StatCard } from "@/components/ui";
import RoleManager from "./RoleManager";

export const dynamic = "force-dynamic";

export default async function OrgUserRolesPage() {
  const { organisationId } = await orgContext();

  const [roles, permissions] = await Promise.all([
    prisma.role.findMany({
      where: { organisationId },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { assignments: true, rolePermissions: true } },
        rolePermissions: { include: { permission: { select: { key: true } } } },
      },
    }),
    prisma.permission.findMany({ orderBy: [{ module: "asc" }, { key: "asc" }] }),
  ]);

  const roleDtos = roles.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    memberCount: r._count.assignments,
    permissionCount: r._count.rolePermissions,
    permissionKeys: r.rolePermissions.map((rp) => rp.permission.key),
  }));

  const groups = permissions.reduce<Record<string, typeof permissions>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  const permissionGroups = Object.entries(groups).map(([module, perms]) => ({
    module,
    permissions: perms.map((p) => ({ key: p.key, description: p.description })),
  }));

  const withMembers = roleDtos.filter((r) => r.memberCount > 0).length;

  return (
    <div>
      <PageHeader
        title="User Roles"
        subtitle={`${roles.length} organisation-scoped role${roles.length === 1 ? "" : "s"} · ${permissions.length} permissions available`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Roles" value={roles.length} hint="Scoped to this org" tone="indigo" />
        <StatCard label="In use" value={withMembers} hint="Roles with members" tone="emerald" />
        <StatCard label="System roles" value={roleDtos.filter((r) => r.isSystem).length} hint="Cannot be deleted" tone="amber" />
        <StatCard label="Permissions" value={permissions.length} hint={`${permissionGroups.length} modules`} tone="sky" />
      </div>

      <RoleManager roles={roleDtos} permissionGroups={permissionGroups} />
    </div>
  );
}
