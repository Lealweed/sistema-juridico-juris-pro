# n8n – Fluxo Juris Pro v2 (mapa de implementação)

## Objetivo
Triar lead, coletar documentos, salvar tudo no Juris Pro e encaminhar para fechamento de contrato.

## 1) Entrada
- **Webhook/Gatilho WhatsApp** (`jurisproLimalopesediogines`)
- Extrair: `phone`, `name`, `message`, `media[]`, `timestamp`, `sessionId`

## 2) Upsert cliente
- Chamar `clients-upsert-by-channel`
- Receber `clientId`

## 3) Agente IA (triagem)
- Entrada: mensagem atual + contexto da conversa + status da triagem
- Saída JSON obrigatória:
```json
{
  "intent": "triagem|duvida|documento|agendamento|humano",
  "benefit_type": "bpc_loas|salario_maternidade|auxilio_incapacidade|auxilio_acidente|outro",
  "answers": {
    "holder_type": "titular|familiar|null",
    "has_medical_report": true,
    "has_clt_job": false,
    "is_civil_married": false,
    "lives_on_rent": true,
    "has_cadunico": true,
    "cadunico_people_count": 3,
    "has_gov_account": true,
    "gov_2fa_blocked": true
  },
  "missing_fields": ["has_medical_report", "has_cadunico"],
  "eligibility_status": "incompleto|apto|nao_apto|exige_humano",
  "eligibility_reason": "texto curto",
  "next_question": "pergunta única",
  "human_handoff": false,
  "summary": "resumo curto"
}
```

## 4) Persistir triagem
- UPSERT em `public.intake_triage` por (`office_id`,`client_id`,`source_session_id`)
- Atualizar respostas gradualmente (`raw_payload` com histórico)

## 5) Seed checklist
- Ao detectar `benefit_type` e existir `triage_id`: chamar
  `select public.seed_intake_documents(...)`

## 6) Receber mídia (imagem/pdf)
- Se cliente enviar arquivo:
  1. baixar mídia
  2. salvar no bucket `documents` (`clients/{clientId}/intake/...`)
  3. inserir em `public.documents`
  4. vincular ao item em `public.intake_documents.document_id`
  5. marcar `status='recebido'` + `received_at`

## 7) Decisão
- `eligibility_status=incompleto` -> perguntar próximo campo faltante
- `apto` -> sugerir agendamento/presencial + criar tarefa para equipe
- `nao_apto` -> orientar com educação + oferecer revisão humana
- `exige_humano` -> transferir imediato

## 8) Fechamento de contrato
- Quando docs essenciais estiverem `recebido/validado`:
  - criar tarefa `Contrato` no CRM
  - enviar mensagem de próximos passos ao cliente

## 9) Eventos para auditoria (opcional)
Enviar para `n8n-webhook-handler`:
- `triagem_iniciada`
- `triagem_atualizada`
- `documento_recebido`
- `triagem_concluida`
- `handoff_humano`
- `contrato_em_andamento`
