-- Adiciona a coluna de senha do portal (PIN) para login do cliente no portal digital.
-- Execute este script no SQL Editor do Supabase (uma unica vez).

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS portal_pin TEXT;