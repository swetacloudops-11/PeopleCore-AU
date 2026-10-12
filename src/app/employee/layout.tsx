import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUseEmployeeConsole } from "@/lib/employee";
import EmployeeConsoleLayout from "@/components/employee/EmployeeConsoleLayout";
import { Toaster } from "@/components/Toaster";

export default async function EmployeeProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Platform accounts and org accounts without a linked employee profile have
  // no self-service portal — send each to their own console.
  if (!session.organisationId) redirect(homeFor(session));
  if (!(await canUseEmployeeConsole(session))) redirect(homeFor(session));

  const org = await prisma.organisation.findUnique({
    where: { id: session.organisationId },
    select: { name: true, status: true },
  });
  if (!org || org.status === "DISABLED") {
    redirect("/login?error=organisation_disabled");
  }

  return (
    <EmployeeConsoleLayout
      user={{ name: session.name, email: session.email, roles: session.roles }}
      orgName={org.name}
    >
      {children}
      <Toaster />
    </EmployeeConsoleLayout>
  );
}
