import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hrContext } from "@/lib/hr";
import { Badge, StatCard, TableWrap, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";

const createSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(60),
  code: z.string().trim().min(2, "Code is required").max(12),
  unit: z.enum(["DAYS", "HOURS"]).default("DAYS"),
  accrualRate: z.coerce.number().min(0).max(365).default(0),
  maxCarryOver: z.coerce.number().min(0).max(365).default(0),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour").default("#6366f1"),
});

const HEX = /^#[0-9a-fA-F]{6}$/;

function bail(message: string): never {
  redirect(`/hr/leave/types?error=${encodeURIComponent(message)}`);
}

async function createLeaveType(formData: FormData) {
  "use server";
  const { organisationId } = await hrContext();

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    unit: String(formData.get("unit") ?? "DAYS"),
    accrualRate: formData.get("accrualRate"),
    maxCarryOver: formData.get("maxCarryOver"),
    colour: String(formData.get("colour") ?? "").trim() || "#6366f1",
  });
  if (!parsed.success) bail(parsed.error.issues[0]?.message ?? "Invalid leave type");

  const d = parsed.data;
  const code = d.code.toUpperCase();

  const dupe = await prisma.leaveType.findFirst({
    where: { organisationId, code },
    select: { id: true },
  });
  if (dupe) bail("That code is already in use");

  await prisma.leaveType.create({
    data: {
      organisationId,
      name: d.name.trim(),
      code,
      unit: d.unit,
      isPaid: formData.get("isPaid") === "on",
      accrualRate: d.accrualRate,
      maxCarryOver: d.maxCarryOver,
      requiresApproval: formData.get("requiresApproval") === "on",
      colour: d.colour,
      isActive: true,
    },
  });

  revalidatePath("/hr/leave/types");
  redirect("/hr/leave/types");
}

async function updateLeaveType(formData: FormData) {
  "use server";
  const { organisationId } = await hrContext();

  const id = String(formData.get("id") ?? "");
  const existing = await prisma.leaveType.findFirst({
    where: { id, organisationId },
    select: { id: true },
  });
  if (!existing) bail("Leave type not found");

  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const unit = String(formData.get("unit") ?? "DAYS") === "HOURS" ? "HOURS" : "DAYS";
  const colour = String(formData.get("colour") ?? "").trim();
  const accrualRate = Number(formData.get("accrualRate"));
  const maxCarryOver = Number(formData.get("maxCarryOver"));

  if (name.length < 2 || code.length < 2) bail("Name and code are required");
  if (!HEX.test(colour)) bail("Use a hex colour like #6366f1");
  if (!Number.isFinite(accrualRate) || accrualRate < 0) bail("Accrual rate must be a number");
  if (!Number.isFinite(maxCarryOver) || maxCarryOver < 0) bail("Carry over must be a number");

  const dupe = await prisma.leaveType.findFirst({
    where: { organisationId, code, id: { not: id } },
    select: { id: true },
  });
  if (dupe) bail("That code is already in use");

  await prisma.leaveType.update({
    where: { id },
    data: {
      name,
      code,
      unit,
      colour,
      accrualRate,
      maxCarryOver,
      isPaid: formData.get("isPaid") === "on",
      requiresApproval: formData.get("requiresApproval") === "on",
    },
  });

  revalidatePath("/hr/leave/types");
  redirect("/hr/leave/types");
}

async function toggleLeaveType(formData: FormData) {
  "use server";
  const { organisationId } = await hrContext();

  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("isActive")) === "true";

  const existing = await prisma.leaveType.findFirst({
    where: { id, organisationId },
    select: { id: true },
  });
  if (!existing) bail("Leave type not found");

  await prisma.leaveType.update({ where: { id }, data: { isActive } });

  revalidatePath("/hr/leave/types");
  redirect("/hr/leave/types");
}

export default async function LeaveTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const { organisationId, org } = await hrContext();

  const types = await prisma.leaveType.findMany({
    where: { organisationId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { _count: { select: { requests: true, balances: true } } },
  });

  const active = types.filter((t) => t.isActive).length;
  const paid = types.filter((t) => t.isPaid).length;
  const totalRequests = types.reduce((a, t) => a + t._count.requests, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Leave types
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {org.name} · configure the leave categories your team can request
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Leave types" value={types.length} hint="All configured" tone="sky" />
        <StatCard
          label="Active"
          value={active}
          hint={`${types.length - active} disabled`}
          tone="emerald"
        />
        <StatCard label="Paid types" value={paid} hint="Accrue paid leave" tone="indigo" />
        <StatCard label="Requests" value={totalRequests} hint="Across all types" tone="amber" />
      </div>

      {sp.error && (
        <p className="mt-5 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {sp.error}
        </p>
      )}

      <section className="mt-6 card p-5">
        <h2 className="text-sm font-semibold text-slate-800">Add a leave type</h2>
        <form action={createLeaveType} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label className="label" htmlFor="lt-name">
              Name
            </label>
            <input id="lt-name" name="name" className="input" placeholder="Annual leave" />
          </div>
          <div>
            <label className="label" htmlFor="lt-code">
              Code
            </label>
            <input id="lt-code" name="code" className="input" placeholder="ANNUAL" />
          </div>
          <div>
            <label className="label" htmlFor="lt-unit">
              Unit
            </label>
            <select id="lt-unit" name="unit" className="input" defaultValue="DAYS">
              <option value="DAYS">Days</option>
              <option value="HOURS">Hours</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="lt-accrual">
              Accrual / yr
            </label>
            <input
              id="lt-accrual"
              name="accrualRate"
              type="number"
              step="0.01"
              min="0"
              className="input"
              defaultValue="0"
            />
          </div>
          <div>
            <label className="label" htmlFor="lt-carry">
              Max carry over
            </label>
            <input
              id="lt-carry"
              name="maxCarryOver"
              type="number"
              step="0.01"
              min="0"
              className="input"
              defaultValue="0"
            />
          </div>
          <div>
            <label className="label" htmlFor="lt-colour">
              Colour
            </label>
            <input
              id="lt-colour"
              name="colour"
              type="color"
              className="input h-10 p-1"
              defaultValue="#6366f1"
            />
          </div>
          <label className="flex items-center gap-2 self-end text-sm text-slate-600">
            <input
              type="checkbox"
              name="isPaid"
              defaultChecked
              className="h-4 w-4 rounded border-slate-300"
            />
            Paid
          </label>
          <label className="flex items-center gap-2 self-end text-sm text-slate-600">
            <input
              type="checkbox"
              name="requiresApproval"
              defaultChecked
              className="h-4 w-4 rounded border-slate-300"
            />
            Needs approval
          </label>
          <div className="self-end lg:col-span-2">
            <button type="submit" className="btn-primary w-full">
              Add leave type
            </button>
          </div>
        </form>
      </section>

      <div className="mt-6">
        {types.length === 0 ? (
          <EmptyState
            title="No leave types yet"
            hint="Add your first leave type using the form above."
          />
        ) : (
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Type</th>
                <th className="th">Unit</th>
                <th className="th">Accrual</th>
                <th className="th">Carry over</th>
                <th className="th">Flags</th>
                <th className="th">Usage</th>
                <th className="th">Updated</th>
                <th className="th text-right">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {types.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/70">
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: t.colour }}
                      />
                      <div>
                        <div className="font-medium text-slate-800">{t.name}</div>
                        <div className="text-[11px] text-slate-400">{t.code}</div>
                      </div>
                    </div>
                  </td>
                  <td className="td text-slate-600">{t.unit === "HOURS" ? "Hours" : "Days"}</td>
                  <td className="td tabular-nums text-slate-600">
                    {Number(t.accrualRate).toFixed(2)}
                  </td>
                  <td className="td tabular-nums text-slate-600">
                    {Number(t.maxCarryOver).toFixed(2)}
                  </td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1">
                      {t.isActive ? (
                        <Badge tone="green">Active</Badge>
                      ) : (
                        <Badge tone="slate">Disabled</Badge>
                      )}
                      {t.isPaid && <Badge tone="blue">Paid</Badge>}
                      {t.requiresApproval && <Badge tone="amber">Approval</Badge>}
                    </div>
                  </td>
                  <td className="td text-slate-600">
                    {t._count.requests} req · {t._count.balances} bal
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {formatDate(t.updatedAt)}
                  </td>
                  <td className="td">
                    <div className="flex justify-end">
                      <details className="relative">
                        <summary className="cursor-pointer list-none rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50">
                          Edit
                        </summary>
                        <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                          <form action={updateLeaveType} className="space-y-3">
                            <input type="hidden" name="id" value={t.id} />
                            <div className="grid grid-cols-2 gap-2">
                              <div className="col-span-2">
                                <label className="label">Name</label>
                                <input name="name" className="input" defaultValue={t.name} />
                              </div>
                              <div>
                                <label className="label">Code</label>
                                <input name="code" className="input" defaultValue={t.code} />
                              </div>
                              <div>
                                <label className="label">Unit</label>
                                <select name="unit" className="input" defaultValue={t.unit}>
                                  <option value="DAYS">Days</option>
                                  <option value="HOURS">Hours</option>
                                </select>
                              </div>
                              <div>
                                <label className="label">Accrual / yr</label>
                                <input
                                  name="accrualRate"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="input"
                                  defaultValue={Number(t.accrualRate)}
                                />
                              </div>
                              <div>
                                <label className="label">Max carry over</label>
                                <input
                                  name="maxCarryOver"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="input"
                                  defaultValue={Number(t.maxCarryOver)}
                                />
                              </div>
                              <div className="col-span-2">
                                <label className="label">Colour</label>
                                <input
                                  name="colour"
                                  type="color"
                                  className="input h-10 p-1"
                                  defaultValue={t.colour}
                                />
                              </div>
                            </div>
                            <label className="flex items-center gap-2 text-xs text-slate-600">
                              <input
                                type="checkbox"
                                name="isPaid"
                                defaultChecked={t.isPaid}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              Paid
                            </label>
                            <label className="flex items-center gap-2 text-xs text-slate-600">
                              <input
                                type="checkbox"
                                name="requiresApproval"
                                defaultChecked={t.requiresApproval}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              Needs approval
                            </label>
                            <button type="submit" className="btn-primary w-full !py-1.5 text-xs">
                              Save changes
                            </button>
                          </form>
                          <form action={toggleLeaveType} className="mt-2">
                            <input type="hidden" name="id" value={t.id} />
                            <input type="hidden" name="isActive" value={String(!t.isActive)} />
                            <button
                              type="submit"
                              className="btn-secondary w-full !py-1.5 text-xs"
                            >
                              {t.isActive ? "Disable type" : "Enable type"}
                            </button>
                          </form>
                        </div>
                      </details>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
