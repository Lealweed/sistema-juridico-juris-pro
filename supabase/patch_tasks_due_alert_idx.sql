-- CRM Jurídico: index for due alerts (tasks)
-- Applied via psql on 2026-02-10.

begin;
create index if not exists tasks_due_alert_idx on public.tasks (due_at, status_v2);
commit;
