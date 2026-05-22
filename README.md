# Tax Firm Operating System MVP

Lean internal web app for a tax consulting firm with 10-15 users. The product is designed around recurring tax compliance operations, especially client delays, temporary submissions, revisions, and follow-up accountability.

## Stack

- Next.js App Router
- TailwindCSS
- Supabase
- PostgreSQL
- Vercel-compatible deployment

## Final primary modules

1. `Operations`
Recurring monthly compliance work in a dense client-row matrix.

2. `Cases`
Non-recurring tax cases and projects with milestone tracking and Kanban.

3. `Clients`
Master data center for active clients, proposals, obligations, PIC ownership, and commercial terms.

4. `Management`
Supervisor oversight across operations, bottlenecks, high follow-up clients, and completed history.

## Utility feature: Attendance integration

Attendance is a lightweight utility feature only. It is not a separate business module and should not evolve into HR or payroll management.

- Employees stay inside the internal app
- Clicking `Attend` triggers normal browser automation against `https://host-mylmats.com/login`
- The flow supports first-layer login plus second-layer attendance password entry
- Credentials should be encrypted before storage
- The utility is designed to be future-ready for reminders and status checks without disturbing core tax operations

## Core operating model

The app is intentionally client-centric:

- Client master data is the source of truth for the system
- One client equals one operational row
- Monthly obligations are grouped inside the row as compact status cells
- Operations and cases are intentionally separated
- All clients support both `Tax PIC` and `Accounting PIC`
- Staff should scan like they do in Excel, but from one centralized system
- The active operations queue shows only actionable recurring work by default
- Completed recurring rows auto-hide into searchable history unless users choose to show them
- Kanban is used inside `Cases`, not as the recurring compliance interface
- Client detail provides compliance history, revision context, and claim/payment visibility
- Monthly tax obligations are generated from `client_tax_profiles`
- Revisions remain visible instead of disappearing after temporary submissions
- Follow-up count measures client responsiveness and staff effort without adding a blame-heavy workflow

## New module: Client Management

Client Management becomes the master data center for:

- Active clients
- Proposal / quotation clients
- Tax PIC and Accounting PIC assignment
- Team/division assignment
- Tax obligation checklist
- Monthly and annual fee setup
- Automatic DPP, VAT 11%, PPh23 2%, invoice value, and estimated net received calculation

When proposal clients are marked as won, they should convert into active clients and feed:

- Compliance matrix generation
- Recurring compliance generation
- Claim and payment workflow
- Dashboard visibility

## New module: Tax Claim & Payment Workflow

This product is no longer only a compliance tracker. It also supports:

- Tax payable input by obligation
- Billing PDF upload and extraction
- Automatic claim generation
- Payment coordination visibility
- Google Drive folder routing for Billing, Claim Pajak, Bukti Bayar, and SPT

## Cases module

The `Cases` module is for non-recurring tax work such as:

- SP2DK
- Pemeriksaan
- Keberatan
- Banding
- Restitusi
- NPWP registration
- PKP registration
- Tax consultation projects

This module should use:

- Work queues
- Milestone tracking
- Kanban

It should not be mixed into the recurring compliance matrix.

## Supabase setup

1. Create a new Supabase project.
2. Run [`supabase/schema.sql`](./supabase/schema.sql) in the SQL editor.
3. Add environment variables from [`.env.example`](./.env.example).
4. Enable Supabase Email or Magic Link auth for internal users.
5. Deploy to Vercel.

## Attendance setup

1. Add the environment variables from [`.env.example`](./.env.example), especially:
   - `ATTENDANCE_PORT`
   - `ATTENDANCE_LOGIN_URL`
   - Playwright selector variables for the two-step attendance flow
2. Install dependencies so `express` and `playwright` are available.
3. Start the attendance microservice with `npm run server`.
4. Call `POST /api/attendance/checkin` with:
   - `username`
   - `password`
   - `attendancePassword`
5. For this demo, attendance credentials are kept in memory only during the request.
6. For production, store user attendance secrets encrypted at rest and never in plaintext.

## Suggested next implementation steps

1. Wire `staff_profiles.auth_user_id` to real authenticated users.
2. Add row-level security policies after deciding whether all staff should see all clients or only their assignments.
3. Add a small scheduled job or Supabase cron to generate the next month of client-period operations rows from active client obligations every month.
4. Add filtered operations presets by PIC, month, attention-needed state, and completed-history toggles.
5. Formalize client-management tables for active clients, proposal clients, client obligations, commercial terms, and dual PIC ownership.
6. Add dedicated case tables and workflows separate from recurring compliance rows.
7. Persist encrypted attendance credentials per user and connect the attendance widget to authenticated profiles.
8. Replace the placeholder Playwright selectors with the real DOM selectors from `https://host-mylmats.com/login`.

## Attendance local run

To use the attendance utility locally, run both services:

1. App UI:
   - `run-dev.bat`
2. Attendance microservice:
   - `run-attendance.bat`

Then set the attendance selectors in `.env.local`.

Selector env vars support fallback values separated by `||`, for example:

```env
ATTENDANCE_USERNAME_SELECTOR=input[type="email"] || input[name="email"]
ATTENDANCE_PASSWORD_SELECTOR=input[type="password"] || input[name="password"]
ATTENDANCE_SUBMIT_SELECTOR=button[type="submit"] || button:has-text("Log In")
```

## Notes

- The app includes demo fallback data if Supabase env vars are missing, so the interface is still reviewable before database setup.
- Accounting Team support is intentionally minimal in this MVP and can later reuse the same client/staff foundation with a lighter case workflow.
- The standalone demo now reflects the intended production direction: four primary modules with operations matrix first, cases Kanban separate, client master data central, and management oversight distinct.
- Attendance automation is intentionally implemented as a utility layer and should remain isolated from the core tax workflow model.
- The current attendance backend is a lightweight Node/Express microservice in [`server/`](./server) so the HTML demo can call a real backend instead of attempting cross-site browser automation from frontend JavaScript.
