# Operational History Migration (2026-09-27)

Apply `supabase/migrations/202609270001_operational_history_integrity.sql` after the
2026-09-26 migrations and before deploying the corresponding application code.
Take a verified database backup first. Do not run this migration against an
unverified project URL.

The migration is additive. Existing cases, client records, annual workspace
payloads, and claim drafts are not rewritten. It stops permanent case purging,
adds immutable case-PIC assignment and claim-print records, and exposes a
service-role-only transactional Client Master import function. Cases already
purged before this migration cannot be reconstructed by it.

Checks after applying:

```sql
select to_regclass('public.tax_case_assignment_events') as assignment_events,
       to_regclass('public.monthly_tax_claim_prints') as print_snapshots;

select has_function_privilege('anon', 'public.commit_client_master_import(jsonb,uuid,uuid,text,text,text)', 'EXECUTE') as anon_can_import,
       has_function_privilege('authenticated', 'public.commit_client_master_import(jsonb,uuid,uuid,text,text,text)', 'EXECUTE') as staff_can_import,
       has_function_privilege('service_role', 'public.commit_client_master_import(jsonb,uuid,uuid,text,text,text)', 'EXECUTE') as server_can_import;

select pg_get_functiondef('public.purge_deleted_items()'::regprocedure)
       not like '%delete from public.tax_cases%' as case_purge_disabled;
```

Expected: both tables exist; only `service_role` can call the import function;
`case_purge_disabled` is true. Then test one nonproduction client import,
case-PIC reassignment, annual-lepas row, claim reopen, and print snapshot.
Verify that import failure rolls back both the client row and activity entry.

Risk: the new API depends on this migration. Before it is applied, Client Master
saves and claim print snapshots will fail rather than fall back to non-atomic
writes. The old case purge remains active until the migration is applied.
Long-lived soft-deleted cases will consume storage, but preserve linked task and
progress history. Do not revert to the old purge function without first
designing a historical export or archive.

Annual-lepas IDs are stored inside `operational_workspace_state` JSON, not in
Client Master. PIC assignments there are annual-work ownership only and must
not be counted as Client Master portfolio allocations. Existing annual rows
without an annual-work ID retain their current legacy scoping until migrated
separately.

## Production migration ledger (2026-09-28)

The project `kedpcolyklquhfjzimvx` has these recorded Supabase migration entries:

- `20260928031558_operational_history_integrity` (local SQL file: `202609270001_operational_history_integrity.sql`)
- `20260928035107_secure_legacy_compliance_view` (local SQL file: `202609280001_secure_legacy_compliance_view.sql`)

Earlier schema objects were applied before the Supabase migration ledger was
used, so their local SQL filenames are not recorded there. Do not run an
unreviewed `supabase db push`: it may reapply historical files or conflict with
already-existing objects. Reconcile each earlier migration against the live
schema before marking it applied. Do not manufacture ledger entries based only
on a matching table name.
