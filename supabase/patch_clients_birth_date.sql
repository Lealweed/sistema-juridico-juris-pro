-- Adiciona a coluna de data de nascimento em clients.
-- Execute este script no SQL Editor do Supabase (uma unica vez).

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS birth_date DATE;
