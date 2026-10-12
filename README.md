# PeopleCore AU — Super Admin Console

Platform administration console for PeopleCore AU. Built with Next.js 16 (App Router),
Prisma 6 and PostgreSQL, styled with Tailwind CSS 4.

## Quick start

```bash
npm install
npm run db:push     # sync prisma/schema.prisma to the database
npm run db:seed     # seed plans, organisations, integrations, logs
npm run dev         # http://localhost:3000
```

### Sign in

| Field    | Value             |
| -------- | ----------------- |
| Email    | `super@jabit.com` |
| Password | `Admin@1234`      |

Seeded supporting accounts (same password): `ops@jabit.com`, `security@jabit.com`,
`billing@jabit.com`.

## Configuration

`.env` holds the connection string and the JWT signing secret:

```
DATABASE_URL=postgresql://…
AUTH_SECRET=<signing secret for session cookies>
```

## Modules

| Section | Routes |
| --- | --- |
| 🏠 Dashboard | `/dashboard` |
| 🏢 Organisations | `/organisations`, `/organisations/create`, `/organisations/disabled` |
| 💳 Subscriptions | `/subscriptions/plans`, `/subscriptions/organisations` |
| 🔌 Integrations | `/integrations`, `/integrations/mapping`, `/integrations/sync-logs` |
| ⚙️ System Configuration | `/configuration/business-rules`, `/configuration/permissions`, `/configuration/notifications`, `/configuration/global-settings` |
| 🩺 Platform Diagnostics | `/diagnostics/system-health`, `/diagnostics/errors`, `/diagnostics/jobs`, `/diagnostics/integration-health` |
| 🔐 Security | `/security/roles`, `/security/permissions`, `/security/sessions` |
| 📋 Audit Logs | `/audit-logs` |
| ⚙️ Settings | `/settings` |

## Architecture

```
src/
├── app/
│   ├── (console)/          # authenticated shell + every module page
│   ├── api/                # route handlers (auth, CRUD, toggles)
│   └── login/              # public sign-in
├── components/             # Sidebar, Topbar, layout, shared UI
├── lib/                    # prisma, auth/session, audit, nav, formatters
└── proxy.ts                # session guard (redirects to /login)
prisma/
├── schema.prisma           # full data model
└── seed.ts                 # realistic demo data
```

### Request flow

1. `src/proxy.ts` verifies the `pc_session` JWT on every request; unauthenticated
   visitors are redirected to `/login`.
2. Pages are server components querying Prisma directly, with URL-driven
   filtering/pagination via `searchParams`.
3. Mutations go to route handlers under `src/app/api/*`, which re-check the
   session, validate with Zod, then write an audit record.

### Security notes

- Passwords hashed with bcrypt (cost 10).
- Sessions are JWTs (HS256, 12h) mirrored into `UserSession` so they can be
  revoked from Security → Sessions.
- Changing a password revokes every *other* session for that user.
- Secret `GlobalSetting` values are redacted in the audit trail.
- Every mutating action writes an `AuditLog` row.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint |
| `npm run db:push` | Push schema to database |
| `npm run db:seed` | Seed reference + demo data |
| `npm run db:studio` | Open Prisma Studio |
