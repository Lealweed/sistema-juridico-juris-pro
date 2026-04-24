import type { User } from '@supabase/supabase-js';

import { hasSupabaseEnv, supabase } from '@/lib/supabaseClient';

export function requireSupabase() {
  if (!hasSupabaseEnv || !supabase) throw new Error('Supabase não configurado (env vars).');
  return supabase;
}

function isSupabaseLockAbort(message: string) {
  const normalized = (message || '').toLowerCase();
  return normalized.includes("lock broken by another request with the 'steal' option") || normalized.includes('aborterror');
}

export async function getAuthedUser(): Promise<User> {
  const sb = requireSupabase();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await sb.auth.getUser();
    if (!error && data.user) return data.user;

    const message = error?.message || '';
    const isLockError = isSupabaseLockAbort(message);

    if (isLockError && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      continue;
    }

    if (isLockError) {
      const { data: sessionData } = await sb.auth.getSession();
      if (sessionData.session?.user) return sessionData.session.user;
    }

    throw new Error('Sessão inválida. Faça login novamente.');
  }

  throw new Error('Sessão inválida. Faça login novamente.');
}
