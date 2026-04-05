-- Adiciona suporte a metricas flexiveis no relatorio semanal da equipe.
-- Seguro para executar mais de uma vez.

alter table public.weekly_reports
  add column if not exists metrics jsonb not null default '{}'::jsonb;

update public.weekly_reports
set metrics = jsonb_strip_nulls(
  coalesce(metrics, '{}'::jsonb) || jsonb_build_object(
    'deadlinesMet', coalesce((metrics ->> 'deadlinesMet')::integer, 0),
    'attendancesPerformed', coalesce((metrics ->> 'attendancesPerformed')::integer, clients_served, 0),
    'piecesDrafted', coalesce((metrics ->> 'piecesDrafted')::integer, petitions_filed, 0),
    'diligencesMeetings', coalesce((metrics ->> 'diligencesMeetings')::integer, hearings_attended, 0),
    'blockers', coalesce(nullif(metrics ->> 'blockers', ''), notes, '')
  )
)
where metrics = '{}'::jsonb
   or metrics is null;