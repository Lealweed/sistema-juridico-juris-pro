-- CRM Jurídico: tasks management for team (assigned-only visibility + admin full)
-- Applied via psql on 2026-02-10.

begin;

update public.tasks
set assigned_to_user_id = coalesce(assigned_to_user_id, user_id)
where assigned_to_user_id is null;

alter table public.tasks
  add column if not exists task_group_id uuid;

create index if not exists tasks_group_idx on public.tasks (task_group_id, created_at desc);

drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;

create policy tasks_select on public.tasks
for select using (
  (
    office_id is not null
    and (
      public.is_office_admin(office_id)
      or assigned_to_user_id = auth.uid()
    )
  )
  or (
    office_id is null
    and (
      assigned_to_user_id = auth.uid()
      or user_id = auth.uid()
    )
  )
);

create policy tasks_insert on public.tasks
for insert with check (
  (
    office_id is not null
    and (
      public.is_office_admin(office_id)
      or assigned_to_user_id = auth.uid()
    )
  )
  or (
    office_id is null
    and (
      assigned_to_user_id = auth.uid()
      or user_id = auth.uid()
    )
  )
);

create policy tasks_update on public.tasks
for update using (
  (
    office_id is not null
    and (
      public.is_office_admin(office_id)
      or assigned_to_user_id = auth.uid()
    )
  )
  or (
    office_id is null
    and (
      assigned_to_user_id = auth.uid()
      or user_id = auth.uid()
    )
  )
);

create policy tasks_delete on public.tasks
for delete using (
  (
    office_id is not null
    and public.is_office_admin(office_id)
  )
  or (
    office_id is null
    and (user_id = auth.uid())
  )
);

commit;
