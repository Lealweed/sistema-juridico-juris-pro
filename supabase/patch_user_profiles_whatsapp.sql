-- Adiciona a coluna `whatsapp` (número WhatsApp do colaborador) em user_profiles
-- Execute este script no SQL Editor do Supabase (uma única vez).
-- Operação segura: IF NOT EXISTS não gera erro se a coluna já existir.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS whatsapp TEXT;

COMMENT ON COLUMN user_profiles.whatsapp IS 'Número WhatsApp no formato internacional, ex: 5511999999999. Usado pelo n8n para disparar mensagens de cobrança de tarefas aos colaboradores.';
