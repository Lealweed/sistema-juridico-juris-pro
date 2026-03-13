-- Multi-lawyer tasks: participants with per-user completion notes

create table if not exists public.task_participants (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  office_id uuid references public.offices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'assignee', -- assignee|reviewer|protocol etc.
  status text not null default 'pending', -- pending|done|cancelled
  conclusion_notes text,
  concluded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (task_id, user_id)
);

create index if not exists task_participants_task_idx on public.task_participants(task_id);
create index if not exists task_participants_user_idx on public.task_participants(user_id);
create index if not exists task_participants_office_idx on public.task_participants(office_id);

alter table public.task_participants enable row level security;

-- select: office admin or participant
DROP POLICY IF EXISTS task_participants_select ON public.task_participants;
CREATE POLICY task_participants_select ON public.task_participants
FOR SELECT USING (
  (office_id is not null and (public.is_office_admin(office_id) or user_id = auth.uid()))
  or (office_id is null and user_id = auth.uid())
);

-- insert: office members can add participants when they can see the task
DROP POLICY IF EXISTS task_participants_insert ON public.task_participants;
CREATE POLICY task_participants_insert ON public.task_participants
FOR INSERT WITH CHECK (
  (office_id is not null and public.is_office_member(office_id))
  or (office_id is null and user_id = auth.uid())
);

-- update: participant can update own status/notes; admin can update all
DROP POLICY IF EXISTS task_participants_update ON public.task_participants;
CREATE POLICY task_participants_update ON public.task_participants
FOR UPDATE USING (
  (office_id is not null and (public.is_office_admin(office_id) or user_id = auth.uid()))
  or (office_id is null and user_id = auth.uid())
);

DROP POLICY IF EXISTS task_participants_delete ON public.task_participants;
CREATE POLICY task_participants_delete ON public.task_participants
FOR DELETE USING (
  (office_id is not null and public.is_office_admin(office_id))
  or (office_id is null and user_id = auth.uid())
);

-- Backfill: create participant row for existing tasks' assigned_to_user_id
insert into public.task_participants (task_id, office_id, user_id, role, status)
select t.id, t.office_id, t.assigned_to_user_id, 'assignee',
  case when t.status_v2='done' then 'done' else 'pending' end
from public.tasks t
where t.assigned_to_user_id is not null
  and not exists (
    select 1 from public.task_participants p where p.task_id=t.id and p.user_id=t.assigned_to_user_id
  );

-- RPC: add participant
create or replace function public.task_add_participant(p_task_id uuid, p_user_id uuid, p_role text default 'assignee')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office uuid;
begin
  select office_id into v_office from public.tasks where id = p_task_id;
  if not found then raise exception 'task_not_found'; end if;

  if v_office is not null then
    if not public.is_office_member(v_office) then raise exception 'not_allowed'; end if;
  else
    if auth.uid() is null then raise exception 'not_authenticated'; end if;
  end if;

  insert into public.task_participants (task_id, office_id, user_id, role)
  values (p_task_id, v_office, p_user_id, coalesce(p_role,'assignee'))
  on conflict (task_id, user_id) do update set role=excluded.role;
end;
$$;

revoke all on function public.task_add_participant(uuid, uuid, text) from public;
grant execute on function public.task_add_participant(uuid, uuid, text) to authenticated;

-- RPC: participant marks own completion
create or replace function public.task_mark_my_part_done(p_task_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_office uuid;
begin
  v_user := auth.uid();
  if v_user is null then raise exception 'not_authenticated'; end if;

  select office_id into v_office from public.tasks where id = p_task_id;
  if not found then raise exception 'task_not_found'; end if;

  update public.task_participants
  set status='done',
      conclusion_notes = p_notes,
      concluded_at = now()
  where task_id = p_task_id and user_id = v_user;

  if not found then
    -- auto add self as participant if office member
    if v_office is not null and public.is_office_member(v_office) then
      insert into public.task_participants (task_id, office_id, user_id, role, status, conclusion_notes, concluded_at)
      values (p_task_id, v_office, v_user, 'assignee', 'done', p_notes, now())
      on conflict (task_id, user_id) do update
        set status='done', conclusion_notes=p_notes, concluded_at=now();
    else
      raise exception 'not_allowed';
    end if;
  end if;
end;
$$;

revoke all on function public.task_mark_my_part_done(uuid, text) from public;
grant execute on function public.task_mark_my_part_done(uuid, text) to authenticated;

-- Audit
drop trigger if exists tr_audit_task_participants on public.task_participants;
create trigger tr_audit_task_participants
after insert or update or delete on public.task_participants
for each row execute function public._audit_log_row();
