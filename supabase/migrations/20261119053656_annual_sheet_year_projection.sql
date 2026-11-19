-- Read-only projection of the existing versioned workspace. Never changes a row,
-- grants access to a browser role, or replaces the compare-and-swap save path.
begin;

create function public.read_annual_sheet_year(p_scope text, p_year integer)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'version', coalesce(workspace.version, 0),
    'rows', coalesce(projection.rows, '[]'::jsonb),
    'yearIndex', coalesce(projection.year_index, '[]'::jsonb)
  )
  from (values (1)) as seed(n)
  left join public.operational_workspace_state as workspace on workspace.scope = p_scope
  cross join lateral (
    select
      pg_catalog.jsonb_agg(entry.row_data order by entry.position) filter (
        where case
          when normalized.year_text ~ '^[+-]?[0-9]{1,8}(\.[0]+)?$'
            then normalized.year_text::numeric = p_year
          else p_year = 0
        end
      ) as rows,
      pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'taxYear', entry.row_data->'taxYear',
        'year', entry.row_data->'year',
        'accountingPicProfileId', entry.row_data->'accountingPicProfileId',
        'reportPicProfileId', entry.row_data->'reportPicProfileId',
        'taxPicProfileId', entry.row_data->'taxPicProfileId',
        'accountingPic', entry.row_data->'accountingPic',
        'reportPic', entry.row_data->'reportPic',
        'taxPic', entry.row_data->'taxPic',
        'assistantProfileIds', entry.row_data->'assistantProfileIds'
      )) order by entry.position) as year_index
    from pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(workspace.payload) = 'array' then workspace.payload else '[]'::jsonb end
    ) with ordinality as entry(row_data, position)
    cross join lateral (
      select pg_catalog.btrim(case
        when entry.row_data->'taxYear' is null or entry.row_data->'taxYear' in ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb)
          then entry.row_data->>'year'
        else entry.row_data->>'taxYear'
      end) as year_text
    ) as normalized
    where pg_catalog.jsonb_typeof(entry.row_data) = 'object'
  ) as projection
  where p_scope in ('annual_accounting', 'annual_tax')
    and (p_year = 0 or p_year between 2000 and 2100);
$$;

revoke all on function public.read_annual_sheet_year(text, integer) from public, anon, authenticated;
grant execute on function public.read_annual_sheet_year(text, integer) to service_role;

commit;
