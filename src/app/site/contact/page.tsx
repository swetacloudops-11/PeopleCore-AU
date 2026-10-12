/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { BRAND } from "../content";
import DemoForm from "./DemoForm";

export const metadata: Metadata = {
  title: "Contact",
  description: "Book a demo of PeopleCore AU or ask a question about the platform.",
};

export default function ContactPage() {
  return (
    <div>
      <section className="bg-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Book a demo</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            Tell us a little about your team and we&apos;ll show you the platform with your own scenario —
            rosters, pay runs, compliance or the AI assistants.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <DemoForm />
        </div>

        <aside className="lg:col-span-2">
          <img
            src="/images/site/contact-side.jpg"
            alt="Consultants reviewing a rollout plan with a client"
            loading="lazy"
            className="mb-4 h-44 w-full rounded-2xl object-cover"
          />
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-900">Prefer email?</h2>
            <p className="mt-2 text-sm text-slate-600">
              Reach us at <span className="font-medium text-slate-800">{BRAND.supportEmail}</span> and
              we&apos;ll reply within one business day.
            </p>
          </div>
          <div className="card mt-4 p-5">
            <h2 className="text-sm font-semibold text-slate-900">Want to look around first?</h2>
            <p className="mt-2 text-sm text-slate-600">
              Open the live demo workspace and sign in with a sample account — no sales call needed.
            </p>
            <a
              href="/site/login"
              className="mt-3 inline-block text-sm font-medium text-sky-600 hover:underline"
            >
              Choose a workspace →
            </a>
          </div>
        </aside>
      </section>
    </div>
  );
}
