import type { Metadata } from "next";
import SiteHeader from "@/components/site/SiteHeader";
import SiteFooter from "@/components/site/SiteFooter";

export const metadata: Metadata = {
  title: {
    default: "PeopleCore AU — Australian HR, payroll and rostering",
    template: "%s · PeopleCore AU",
  },
  description:
    "PeopleCore AU is an Australian HR platform: employee records, rostering, time, payroll, leave, compliance and documents — with an AI assistant in every console.",
};

/**
 * Public marketing site shell. This is an additive layout under /site and does
 * not affect any console, the login page or the application shell.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
