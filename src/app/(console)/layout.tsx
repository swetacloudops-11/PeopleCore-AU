import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";
import ConsoleLayout from "@/components/ConsoleLayout";
import { Toaster } from "@/components/Toaster";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Organisation accounts must never land in the platform console.
  if (session.organisationId) redirect(homeFor(session));

  return (
    <ConsoleLayout
      user={{ name: session.name, email: session.email, roles: session.roles }}
    >
      {children}
      <Toaster />
    </ConsoleLayout>
  );
}
