import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import CreateOrganisationForm from "@/components/CreateOrganisationForm";

export const dynamic = "force-dynamic";

export default async function CreateOrganisationPage() {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { code: true, name: true },
  });

  return (
    <div>
      <PageHeader
        title="Create Organisation"
        subtitle="Register a new organisation on the PeopleCore AU platform"
      />
      <CreateOrganisationForm plans={plans} />
    </div>
  );
}
