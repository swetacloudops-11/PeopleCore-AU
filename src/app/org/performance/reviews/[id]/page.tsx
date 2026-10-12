import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { orgContext } from "@/lib/org";
import { Badge } from "@/components/ui";
import { formatDate } from "@/lib/format";
import ReviewActions from "../ReviewActions";

export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, string> = {
  DRAFT: "slate",
  IN_PROGRESS: "blue",
  COMPLETED: "green",
  CANCELLED: "red",
};

const pretty = (s: string) =>
  s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function Section({
  title,
  body,
  tone = "slate",
}: {
  title: string;
  body: string | null;
  tone?: string;
}) {
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        <Badge tone={tone}>{body ? "RECORDED" : "PENDING"}</Badge>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
        {body?.trim() ? body : <span className="text-slate-400">No entries yet.</span>}
      </p>
    </div>
  );
}

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organisationId } = await orgContext();

  const review = await prisma.review.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNumber: true,
          employmentStatus: true,
          department: { select: { name: true } },
          position: { select: { title: true } },
        },
      },
      reviewer: { select: { firstName: true, lastName: true } },
    },
  });

  if (!review || review.organisationId !== organisationId) notFound();

  const rating = review.overallRating ? Number(review.overallRating) : null;

  const meta: Array<{ label: string; value: string }> = [
    { label: "Type", value: pretty(review.type) },
    { label: "Period", value: `${formatDate(review.periodStart)} → ${formatDate(review.periodEnd)}` },
    { label: "Due date", value: review.dueDate ? formatDate(review.dueDate) : "—" },
    { label: "Completed", value: review.completedAt ? formatDate(review.completedAt) : "—" },
    {
      label: "Reviewer",
      value: review.reviewer
        ? `${review.reviewer.firstName} ${review.reviewer.lastName}`
        : "Unassigned",
    },
    { label: "Department", value: review.employee.department?.name ?? "—" },
    { label: "Position", value: review.employee.position?.title ?? "—" },
    {
      label: "Overall rating",
      value: rating ? `${rating.toFixed(2)} / 5` : "Not rated",
    },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/org/performance/reviews"
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            ← All reviews
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              {review.title}
            </h1>
            <Badge tone={STATUS_TONES[review.status] ?? "slate"}>{pretty(review.status)}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {review.employee.firstName} {review.employee.lastName} ·{" "}
            {review.employee.employeeNumber}
          </p>
        </div>
        <ReviewActions id={review.id} status={review.status} />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {meta.map((m) => (
          <div key={m.label} className="card p-3.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {m.label}
            </div>
            <div className="mt-1 text-sm font-medium text-slate-800">{m.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Employee comments" body={review.employeeComments} tone="blue" />
        <Section title="Reviewer comments" body={review.reviewerComments} tone="purple" />
        <Section title="Strengths" body={review.strengths} tone="green" />
        <Section title="Areas for improvement" body={review.improvements} tone="amber" />
        <div className="lg:col-span-2">
          <Section title="Goals for next period" body={review.goals} tone="slate" />
        </div>
      </div>

      <p className="mt-5 text-[11px] text-slate-400">
        Created {formatDate(review.createdAt)} · last updated {formatDate(review.updatedAt)}
      </p>
    </div>
  );
}
