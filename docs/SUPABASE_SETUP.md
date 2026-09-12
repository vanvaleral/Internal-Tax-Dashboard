# Supabase Free Setup

This project currently keeps the browser demo usable without a database, but the backend foundation is ready for Supabase PostgreSQL.

## 1. Create the project

1. Create a free project at [supabase.com](https://supabase.com/).
2. Open **Project Settings > API**.
3. Copy the project URL, the publishable/anon key, and the service role key.
4. Copy `.env.example` to `.env.local` and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
INVITE_REFERRAL_CODE=your-private-registration-code
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `INVITE_REFERRAL_CODE` in browser code or commit `.env.local`.

## 2. Run the first migration

Open **SQL Editor** in Supabase and run these files in order:

1. `supabase/schema.sql` for the existing recurring-compliance prototype.
2. `supabase/migrations/202609090001_client_master_foundation.sql` for the additive client master and activity log.
3. `supabase/migrations/202609100001_client_master_import_fields.sql` for the cleaned workbook fields.
4. `supabase/migrations/202609100002_staff_roles.sql` for staff roles.
5. `supabase/migrations/202609100003_auto_create_staff_profile.sql` to link Auth users to staff profiles automatically.
6. `supabase/migrations/202609100004_staff_profile_rls.sql` to allow a user to complete only their own profile.
7. `supabase/migrations/202609110001_staff_usernames.sql` for username login.
8. `supabase/migrations/202609110002_staff_display_names.sql` for operational display names.
9. `supabase/migrations/202609110003_username_registration_support.sql` if username support was added after your first setup.
10. `supabase/migrations/202609120001_fix_new_user_display_name_trigger.sql` to make direct registration compatible with required display names.
11. `supabase/migrations/202609120002_shared_clients_cases_announcements.sql` to persist shared client records, cases, announcements, and database-allocated client codes.

The second migration does not delete or rewrite existing prototype tables.

## Direct staff registration

The login page can create a Staff account only when the supplied referral code matches `INVITE_REFERRAL_CODE` on the server. Set that variable in `.env.local` and in Vercel for both Preview and Production.

To make this gate effective, open **Supabase Authentication > General Configuration** and turn off **Allow new users to sign up**. The application creates approved staff through the private service-role route, while direct Supabase signups would otherwise bypass the referral code.

## 3. Start the app

```powershell
npm run dev
```

Open `http://localhost:3000`. The top bar should show `Database: connected` after the migration has completed.

## Current backend boundary

- `GET /api/health/database` checks the server-side database connection.
- `GET /api/clients` reads `client_master` only for an authenticated Supabase user.
- Without Supabase credentials, the UI intentionally remains in `Database: demo mode`.
- Client writes will be added through authenticated server routes with activity logging; the demo must not silently write production data to localStorage.

## Import the cleaned workbook

After all three SQL files have completed successfully, run this from PowerShell:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = (Get-Content .env.local | Where-Object { $_ -match '^SUPABASE_SERVICE_ROLE_KEY=' } | ForEach-Object { $_ -replace '^SUPABASE_SERVICE_ROLE_KEY=', '' })
$env:NEXT_PUBLIC_SUPABASE_URL = (Get-Content .env.local | Where-Object { $_ -match '^NEXT_PUBLIC_SUPABASE_URL=' } | ForEach-Object { $_ -replace '^NEXT_PUBLIC_SUPABASE_URL=', '' })
$py = 'C:\Users\LMATS Consulting\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
& $py scripts/import-client-master.py 'C:\Users\LMATS Consulting\Downloads\List Klien.xlsx'
```

The importer reads the cleaned workbook, skips blank rows, preserves the source status and PIC history, and uses stable row keys so a second run updates existing records instead of creating duplicates.
