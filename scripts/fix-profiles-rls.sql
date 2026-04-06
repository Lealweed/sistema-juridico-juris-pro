-- Corrige o RLS de `public.user_profiles` para permitir:
-- 1) o proprio usuario atualizar seu perfil;
-- 2) administradores atualizarem perfis de qualquer membro do mesmo escritorio.
-- Seguro para executar mais de uma vez.

alter table public.user_profiles enable row level security;

grant select, insert, update on table public.user_profiles to authenticated;

drop policy if exists user_profiles_self_update on public.user_profiles;
create policy user_profiles_self_update
on public.user_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_profiles_admin_update_same_office on public.user_profiles;
create policy user_profiles_admin_update_same_office
on public.user_profiles
for update
to authenticated
using (
  exists (
    select 1
    from public.office_members admin_member
    join public.office_members target_member
      on target_member.office_id = admin_member.office_id
    where admin_member.user_id = auth.uid()
      and admin_member.role = 'admin'
      and target_member.user_id = user_profiles.user_id
  )
)
with check (
  exists (
    select 1
    from public.office_members admin_member
    join public.office_members target_member
      on target_member.office_id = admin_member.office_id
    where admin_member.user_id = auth.uid()
      and admin_member.role = 'admin'
      and target_member.user_id = user_profiles.user_id
  )
);
