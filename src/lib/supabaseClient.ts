import { createClient } from '@supabase/supabase-js';

import { env } from '@/env';

export const hasSupabaseEnv = Boolean(env.supabaseUrl && env.supabaseAnonKey);

if (!hasSupabaseEnv) {
  // eslint-disable-next-line no-console
  console.warn('Supabase env vars are missing: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

// IMPORTANT: do not call createClient with empty strings (it can break the whole app at import time)
export const supabase = hasSupabaseEnv
  ? createClient(env.supabaseUrl as string, env.supabaseAnonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
