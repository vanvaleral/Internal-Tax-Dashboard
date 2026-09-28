-- Keep the legacy board available to signed-in staff, but make underlying RLS apply.
begin;

alter view public.compliance_board set (security_invoker = true);
revoke all on public.compliance_board from anon;

commit;
