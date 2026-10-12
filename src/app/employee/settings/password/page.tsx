import Link from "next/link";
import { employeeContext } from "@/lib/employee";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function ChangePasswordPage() {
  const { session } = await employeeContext();

  return (
    <div>
      <div className="mb-6">
        <Link href="/employee/settings" className="text-xs font-medium text-violet-600 hover:underline">
          ← Back to Account Settings
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Change Password
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Signed in as {session.email} — pick something you don&apos;t use anywhere else.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChangePasswordForm />
        </div>

        <div className="card h-fit p-5">
          <h2 className="text-sm font-semibold text-slate-800">Good password habits</h2>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-slate-300">•</span>
              At least 8 characters — longer is better.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-slate-300">•</span>
              Don&apos;t reuse a password from another site.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-slate-300">•</span>
              You&apos;ll stay signed in on this device after the change.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-slate-300">•</span>
              Never share your password — HR and IT will never ask for it.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
