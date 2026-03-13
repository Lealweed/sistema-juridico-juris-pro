-- Delegation + Outbox tracking for tasks and agenda

-- 1) Tasks: track last delegation
alter table public.tasks add column if not exists last_assigned_by_user_id uuid references auth.users(id) on delete set null;
alter table public.tasks add column if not exists last_assigned_at timestamptz;
create index if not exists tasks_last_assigned_by_idx on public.tasks(last_assigned_by_user_id);

-- 2) Agenda items: track last delegation
alter table public.agenda_items add column if not exists last_responsible_by_user_id uuid references auth.users(id) on delete set null;
alter table public.agenda_items add column if not exists last_responsible_at timestamptz;
create index if not exists agenda_items_last_responsible_by_idx on public.agenda_items(last_responsible_by_user_id);

-- 3) RPC: delegate task (bypasses RLS for the delegation action)
create or replace function public.delegate_task(p_task_id uuid, p_assigned_to_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office uuid;
  v_user uuid;
  v_owner uuid;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select office_id, user_id into v_office, v_owner
  from public.tasks
  where id = p_task_id;

  if not found then
    raise exception 'task_not_found';
  end if;

  if v_office is not null then
    if not public.is_office_member(v_office) then
      raise exception 'not_allowed';
    end if;
  else
    if v_owner <> v_user then
      raise exception 'not_allowed';
    end if;
  end if;

  update public.tasks
  set assigned_to_user_id = p_assigned_to_user_id,
      last_assigned_by_user_id = v_user,
      last_assigned_at = now()
  where id = p_task_id;
end;
$$;

revoke all on function public.delegate_task(uuid, uuid) from public;
grant execute on function public.delegate_task(uuid, uuid) to authenticated;

-- 4) RPC: delegate agenda item
create or replace function public.delegate_agenda_item(p_agenda_item_id uuid, p_responsible_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office uuid;
  v_user uuid;
  v_owner uuid;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select office_id, user_id into v_office, v_owner
  from public.agenda_items
  where id = p_agenda_item_id;

  if not found then
    raise exception 'agenda_item_not_found';
  end if;

  if v_office is not null then
    if not public.is_office_member(v_office) then
      raise exception 'not_allowed';
    end if;
  else
    if v_owner <> v_user then
      raise exception 'not_allowed';
    end if;
  end if;

  update public.agenda_items
  set responsible_user_id = p_responsible_user_id,
      last_responsible_by_user_id = v_user,
      last_responsible_at = now()
  where id = p_agenda_item_id;
end;
$$;

revoke all on function public.delegate_agenda_item(uuid, uuid) from public;
grant execute on function public.delegate_agenda_item(uuid, uuid) to authenticated;
