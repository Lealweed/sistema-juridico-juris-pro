import type { Session } from '@supabase/supabase-js';

import { hasSupabaseEnv, supabase } from '@/lib/supabaseClient';

function ensure() {
  if (!hasSupabaseEnv || !supabase) {
    throw new Error('Supabase não configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)');
  }
  return supabase;
}

export async function signInWithPassword(email: string, password: string) {
  return ensure().auth.signInWithPassword({ email, password });
}

export async function resetPasswordForEmail(email: string, options?: any) {
  return ensure().auth.resetPasswordForEmail(email, options);
}

export async function signOut() {
  if (!hasSupabaseEnv || !supabase) return;
  await supabase.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  if (!hasSupabaseEnv || !supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(cb: (session: Session | null) => void) {
  if (!hasSupabaseEnv || !supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
