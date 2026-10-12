# PeopleCore AU — Multi-tenant HR Platform

A complete Australian HR platform: platform administration, organisation
management, HR operations and employee self-service — with AI assistants in
every console. Built with Next.js 16 (App Router), Prisma 6, PostgreSQL and
Tailwind CSS 4.

## Four consoles

| Console | Route | Pages | For |
| --- | --- | --- | --- |
| **Super Admin** | `/dashboard` | 26 | Platform owner: organisations, plans, subscriptions, integrations, security, audit logs |
| **Organisation Admin** | `/org/dashboard` | 58 | Org admins: people, rostering, payroll, expenses, performance, users, settings |
| **HR Admin** | `/hr/dashboard` | 47 | HR team: employees, onboarding, offboarding, leave, documents, policies, certifications, reports |
| **Employee self-service** | `/employee/dashboard` | 40 | Staff: profile, roster, clock in/out, timesheets, leave, payslips, expenses, tasks |

**AI assistants** ship in the Org, HR and Employee consoles. They answer
free-form questions (English or Hinglish) two ways:

- **Live AI** — configure any LLM provider (`AI_API_KEY` / `OPENAI_API_KEY` /
  `ANTHROPIC_API_KEY`) and the model answers with tool calls into the live
  database, scoped strictly to the signed-in user's permissions.
- **Quick answers (fallback)** — with no key configured, a built-in
  deterministic engine answers from the same tenant-scoped data.

## Quick start

```bash
npm install
npm run db:push          # sync prisma/schema.prisma to the database
npm run db:seed          # platform reference data (plans, orgs, integrations)
npm run db:seed-org      # org admin + 60-employee HR dataset
npm run db:seed-hr       # HR admin account + documents & certifications
npm run db:seed-employee # employee portal account
npm run dev              # http://localhost:3000
```

## Demo accounts

Password for every account: `Admin@1234`

| Account | Console | Lands on |
| --- | --- | --- |
| `super@jabit.com` | Super Admin | `/dashboard` |
| `organ@jabit.com` | Organisation Admin | `/org/dashboard` |
| `hr@jabitsoft.com` | HR Admin | `/hr/dashboard` |
| `employee@jabitsoft.com` | Employee | `/employee/dashboard` |

Supporting platform accounts (same password): `ops@jabit.com`,
`security@jabit.com`, `billing@jabit.com`.

## Configuration

`.env` (not committed — see `.env.example`):

```
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/PeopleCore_tst?schema=public
AUTH_SECRET=<signing secret for session cookies>
```

Optional AI providers for the assistants (any one of):

```
AI_API_KEY=...        AI_BASE_URL=...        AI_MODEL=...          # OpenAI-compatible
OPENAI_API_KEY=...    OPENAI_MODEL=gpt-4o-mini
ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=claude-3-5-haiku-latest
```

## Architecture

```
src/
├── app/
│   ├── (console)/        # Super Admin shell + module pages
│   ├── org/              # Organisation Admin console
│   ├── hr/               # HR Admin console
│   ├── employee/         # Employee self-service portal
│   ├── api/              # route handlers (auth, org, hr, employee, ai)
│   └── login/            # public sign-in
├── components/           # shells (sidebars/topbars), shared UI, SVG charts
├── lib/                  # prisma, auth/session, per-console contexts, nav, AI runner
└── proxy.ts              # session guard (redirects to /login)
prisma/
├── schema.prisma         # 60+ model data model
└── seed*.ts              # platform + org + hr + employee seeds
```

### Request flow

1. `src/proxy.ts` verifies the `pc_session` JWT on every request;
   unauthenticated visitors are redirected to `/login`.
2. Pages are server components querying Prisma directly, scoped to the
   signed-in tenant (`org`, `hr`) or person (`employee`).
3. Mutations go to route handlers under `src/app/api/*`, which re-check the
   session and role, validate with Zod, verify cross-tenant ownership, then
   write an audit record.

### Security notes

- Passwords hashed with bcrypt (cost 10).
- Sessions are JWTs (HS256, 12h) mirrored into `UserSession` so they can be
  revoked from Security → Sessions.
- Role-guarded consoles: platform accounts cannot enter tenant consoles, and
  self-service-only accounts are limited to `/employee`.
- Employee portal data access is scoped to the signed-in person's own record.
- Every mutating action writes an `AuditLog` row.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint |
| `npm run db:push` | Push schema to database |
| `npm run db:seed` | Seed platform reference + demo data |
| `npm run db:seed-org` | Seed organisation admin + HR dataset |
| `npm run db:seed-hr` | Seed HR admin account + documents/certifications |
| `npm run db:seed-employee` | Seed employee portal account |
| `npm run db:studio` | Open Prisma Studio |
