-- ============================================================
-- patch_intake_triage_documents.sql
-- Triagem previdenciária + checklist de documentos
-- ============================================================

-- 1) Triagem principal por cliente/caso
create table if not exists public.intake_triage (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,

  -- origem
  source_channel text default 'whatsapp' not null,
  source_session_id text,

  -- classificação
  benefit_type text not null check (benefit_type in ('bpc_loas','salario_maternidade','auxilio_incapacidade','auxilio_acidente','outro')),
  area text default 'previdenciario' not null,

  -- respostas de triagem
  holder_type text check (holder_type in ('titular','familiar')),
  family_member_relation text,
  has_medical_report boolean,
  medical_report_type text,
  has_clt_job boolean,
  is_civil_married boolean,
  spouse_has_income boolean,
  lives_on_rent boolean,
  rent_amount numeric(12,2),
  has_cadunico boolean,
  cadunico_people_count int,
  family_income numeric(12,2),
  has_gov_account boolean,
  gov_2fa_blocked boolean,

  -- resultado
  eligibility_status text default 'incompleto' not null check (eligibility_status in ('incompleto','apto','nao_apto','exige_humano')),
  eligibility_reason text,
  next_action text,

  -- auditoria
  ai_summary text,
  raw_payload jsonb default '{}'::jsonb not null,
  created_by text default 'n8n' not null,
  updated_by text default 'n8n' not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists intake_triage_office_idx on public.intake_triage(office_id, created_at desc);
create index if not exists intake_triage_client_idx on public.intake_triage(client_id, created_at desc);
create index if not exists intake_triage_case_idx on public.intake_triage(case_id);
create index if not exists intake_triage_status_idx on public.intake_triage(eligibility_status, benefit_type);

-- updated_at trigger
create or replace function public.set_updated_at_intake_triage()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tr_intake_triage_updated_at on public.intake_triage;
create trigger tr_intake_triage_updated_at
before update on public.intake_triage
for each row execute function public.set_updated_at_intake_triage();

-- 2) Checklist de documentos por triagem
create table if not exists public.intake_documents (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  triage_id uuid not null references public.intake_triage(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,

  doc_code text not null, -- ex: laudo_medico, rg, comprovante_residencia
  doc_label text not null,
  required boolean not null default true,
  status text not null default 'pendente' check (status in ('pendente','recebido','validado','rejeitado','dispensado')),

  -- quando houver arquivo real no sistema, liga no public.documents
  document_id uuid references public.documents(id) on delete set null,
  received_at timestamptz,
  validated_at timestamptz,
  rejected_reason text,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(triage_id, doc_code)
);

create index if not exists intake_documents_triage_idx on public.intake_documents(triage_id, status);
create index if not exists intake_documents_client_idx on public.intake_documents(client_id, created_at desc);
create index if not exists intake_documents_document_idx on public.intake_documents(document_id);

create or replace function public.set_updated_at_intake_documents()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tr_intake_documents_updated_at on public.intake_documents;
create trigger tr_intake_documents_updated_at
before update on public.intake_documents
for each row execute function public.set_updated_at_intake_documents();

-- 3) RLS
alter table public.intake_triage enable row level security;
alter table public.intake_documents enable row level security;

-- leitura/escrita por membro do escritório
create policy intake_triage_rw_office on public.intake_triage
for all to authenticated
using (public.is_office_member(office_id))
with check (public.is_office_member(office_id));

create policy intake_documents_rw_office on public.intake_documents
for all to authenticated
using (public.is_office_member(office_id))
with check (public.is_office_member(office_id));

-- 4) helper: checklist padrão por benefício
create or replace function public.seed_intake_documents(
  p_triage_id uuid,
  p_office_id uuid,
  p_client_id uuid,
  p_case_id uuid,
  p_benefit_type text
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
begin
  if p_benefit_type = 'bpc_loas' then
    insert into public.intake_documents (office_id, triage_id, client_id, case_id, doc_code, doc_label)
    values
      (p_office_id, p_triage_id, p_client_id, p_case_id, 'laudo_medico', 'Laudo médico'),
      (p_office_id, p_triage_id, p_client_id, p_case_id, 'rg', 'RG'),
      (p_office_id, p_triage_id, p_client_id, p_case_id, 'cpf', 'CPF'),
      (p_office_id, p_triage_id, p_client_id, p_case_id, 'comprovante_residencia', 'Comprovante de residência'),
      (p_office_id, p_triage_id, p_client_id, p_case_id, 'cadunico', 'Comprovante CadÚnico')
    on conflict (triage_id, doc_code) do nothing;

  elsif p_benefit_type in ('auxilio_incapacidade','auxilio_acidente') then
    insert into public.intake_documents (office_id, triage_id, client_id, case_id, doc_code, doc_label)
    values
      (p_office_id, p_triage_id, p_client_id, p_case_id, 'laudo_medico', 'Laudo médico'),
      (p_office_id, p_triage_id, p_client_id, p_case_id, 'rg', 'RG'),
      (p_office_id, p_triage_id, p_client_id, p_case_id, 'cpf', 'CPF'),
      (p_office_id, p_triage_id, p_client_id, p_case_id, 'comprovante_residencia', 'Comprovante de residência'),
      (p_office_id, p_triage_id, p_client_id, p_case_id, 'extrato_contribuicao', 'Extrato de contribuição')
    on conflict (triage_id, doc_code) do nothing;

  elsif p_benefit_type = 'salario_maternidade' then
    insert into public.intake_documents (office_id, triage_id, client_id, case_id, doc_code, doc_label)
    values
      (p_office_id, p_triage_id, p_client_id, p_case_id, 'rg', 'RG'),
      (p_office_id, p_triage_id, p_client_id, p_case_id, 'cpf', 'CPF'),
      (p_office_id, p_triage_id, p_client_id, p_case_id, 'certidao_nascimento', 'Certidão de nascimento'),
      (p_office_id, p_triage_id, p_client_id, p_case_id, 'comprovante_residencia', 'Comprovante de residência')
    on conflict (triage_id, doc_code) do nothing;
  end if;
end;
$$;

grant execute on function public.seed_intake_documents(uuid, uuid, uuid, uuid, text) to authenticated;
