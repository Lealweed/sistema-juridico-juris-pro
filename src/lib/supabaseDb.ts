import type { User } from '@supabase/supabase-js';

import { hasSupabaseEnv, supabase } from '@/lib/supabaseClient';

export function requireSupabase() {
  if (!hasSupabaseEnv || !supabase) throw new Error('Supabase não configurado (env vars).');
  return supabase;
}

export async function getAuthedUser(): Promise<User> {
  const sb = requireSupabase();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) throw new Error('Sessão inválida. Faça login novamente.');
  return data.user;
}
