import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { employeeContext } from "@/lib/employee";
import ProfileForm from "./ProfileForm";

export default async function EmployeeProfileEditPage() {
  const { employee, organisationId } = await employeeContext();

  // HR can turn self-service profile editing off for the whole organisation.
  const allowSelfEdit = await prisma.orgSetting.findFirst({
    where: { organisationId, key: "hr:allow_self_profile_edit" },
  });
  const disabled = allowSelfEdit?.value === "false";

  return (
    <div>
      <div className="mb-6">
        <Link href="/employee/profile" className="text-xs font-medium text-violet-600 hover:underline">
          ← Back to My Profile
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Update Profile
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Edit the details you manage — everything else is maintained by HR.
        </p>
      </div>

      {disabled ? (
        <div className="card mx-auto max-w-xl border-amber-200 bg-amber-50 px-6 py-10 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-xl">
            🔒
          </div>
          <h2 className="text-sm font-semibold text-slate-800">
            Self-service profile editing is disabled
          </h2>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
            Your organisation has turned off employee profile editing. To change your preferred
            name, contact details or emergency contact, please contact your HR team.
          </p>
          <Link href="/employee/profile" className="btn-secondary mt-5">
            ← Back to My Profile
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ProfileForm
              initial={{
                preferredName: employee.preferredName ?? "",
                phone: employee.phone ?? "",
                personalEmail: employee.personalEmail ?? "",
                emergencyContactName: employee.emergencyContactName ?? "",
                emergencyContactPhone: employee.emergencyContactPhone ?? "",
              }}
            />
          </div>

          <div className="space-y-4">
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-slate-800">Managed by HR</h2>
              <p className="mt-1 text-xs text-slate-500">
                These details can only be changed by your HR team — raise a request with them if
                anything below is wrong.
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
                {[
                  "Name and date of birth",
                  "Work email and employee number",
                  "Position, department and team",
                  "Employment type and location",
                  "Pay, superannuation and tax file number",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-0.5 text-slate-300">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="card p-5">
              <h2 className="text-sm font-semibold text-slate-800">Emergency contact</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Keep this up to date — it is who we call if you have an incident at work and we
                can&apos;t reach you any other way.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
