-- Daily work can be linked to a formal case without turning the task into a
-- case itself. The foreign key preserves history if a case is soft deleted.
alter table public.my_work_tasks
  add column if not exists case_id uuid references public.tax_cases(id) on delete set null;

create index if not exists idx_my_work_tasks_case
  on public.my_work_tasks(case_id)
  where case_id is not null;
