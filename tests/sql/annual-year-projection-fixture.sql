-- Disposable local PostgreSQL only; creates synthetic schema and rows.
\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.operational_workspace_state (
  scope text primary key, payload jsonb not null, version integer not null
);
alter table public.operational_workspace_state enable row level security;
grant select on public.operational_workspace_state to service_role;
insert into public.operational_workspace_state values
  ('annual_accounting', '[
    {"id":"older","year":2023,"reportPic":"Legacy","notes":"Old note"},
    {"id":"sample","taxYear":"2025","accountingPicProfileId":"pic","notes":"Selected note","deletedAt":"2025-01-01"},
    {"id":"second","taxYear":2025,"assistantProfileIds":["pic"],"changeLog":[{"field":"notes"}]},
    {"id":"undated","taxYear":0,"notes":"Unassigned note"},
    {"id":"fallback","taxYear":0,"year":2025}
  ]', 4),
  ('monthly_compliance', '{"private":"monthly row"}', 3);
create temp table before_projection as select * from public.operational_workspace_state;
\ir ../../supabase/migrations/20261119053656_annual_sheet_year_projection.sql

do $$ begin
  assert not has_function_privilege('anon','public.read_annual_sheet_year(text,integer)','EXECUTE');
  assert not has_function_privilege('authenticated','public.read_annual_sheet_year(text,integer)','EXECUTE');
  assert has_function_privilege('service_role','public.read_annual_sheet_year(text,integer)','EXECUTE');
  assert not exists (
    select * from before_projection except select * from public.operational_workspace_state
  ), 'migration must not modify workspace records';
end $$;

set role service_role;
do $$
declare projected jsonb := public.read_annual_sheet_year('annual_accounting', 2025);
begin
  assert projected->>'version' = '4';
  assert jsonb_array_length(projected->'rows') = 3;
  assert projected #>> '{rows,0,id}' = 'sample';
  assert projected #>> '{rows,1,id}' = 'second';
  assert projected #>> '{rows,2,id}' = 'fallback';
  assert projected #>> '{rows,0,deletedAt}' = '2025-01-01';
  assert projected #>> '{rows,1,changeLog,0,field}' = 'notes';
  assert projected #>> '{yearIndex,0,reportPic}' = 'Legacy';
  assert not ((projected #> '{yearIndex,0}') ? 'notes');
  assert not ((projected #> '{yearIndex,1}') ? 'id');
  assert jsonb_array_length(projected->'yearIndex') = 5;
  assert public.read_annual_sheet_year('annual_accounting', 0) #>> '{rows,0,id}' = 'undated';
  assert public.read_annual_sheet_year('annual_tax', 2025) = '{"version":0,"rows":[],"yearIndex":[]}';
  assert public.read_annual_sheet_year('monthly_compliance', 2025) is null;
end $$;
reset role;
