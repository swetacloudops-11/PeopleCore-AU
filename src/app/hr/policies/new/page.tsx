import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hrContext } from "@/lib/hr";
import { EmptyState, PageHeader } from "@/components/ui";
import { PolicyForm, type PolicyFormInitial } from "../PolicyForm";

const DEFAULT_CATEGORIES = [
  "Governance",
  "Safety",
  "Employment",
  "Finance",
  "IT",
  "Workplace",
  "General",
];

const isoDate = (d: Date | null) => {
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default async function NewPolicyPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await hrContext();
  const id = sp.id?.trim();

  const [policy, cats] = await Promise.all([
    id
      ? prisma.policy.findFirst({ where: { id, organisationId } })
      : Promise.resolve(null),
    prisma.policy.findMany({
      where: { organisationId },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
  ]);

  const categories = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...cats.map((c) => c.category)])
  );

  if (id && !policy) {
    return (
      <div>
        <PageHeader
          title="Policy not found"
          subtitle="The policy you tried to edit doesn't exist for this organisation."
        />
        <EmptyState
          title="Policy not found"
          hint="It may have been deleted. Return to the policy library to pick another."
        />
        <div className="mt-4">
          <Link href="/hr/policies" className="btn-secondary">
            ← Back to policies
          </Link>
        </div>
      </div>
    );
  }

  const initial: PolicyFormInitial | undefined = policy
    ? {
        id: policy.id,
        title: policy.title,
        category: policy.category,
        content: policy.content,
        version: policy.version,
        effectiveDate: isoDate(policy.effectiveDate),
        reviewDate: isoDate(policy.reviewDate),
        isMandatory: policy.isMandatory,
      }
    : undefined;

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/hr/policies"
          className="text-xs text-sky-600 hover:underline"
        >
          ← Back to policies
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          {initial ? "Update policy" : "Create policy"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {org.name} · {initial ? "edit the policy content and version" : "publish a new policy to your team"}
        </p>
      </div>

      <PolicyForm initial={initial} categories={categories} />
    </div>
  );
}
