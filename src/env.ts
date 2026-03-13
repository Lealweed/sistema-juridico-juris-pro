const host = typeof window !== 'undefined' ? window.location.hostname : '';

function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (configured) return configured;

  if (host === 'www.castrodeoliveiraadv.org' || host === 'castrodeoliveiraadv.org') {
    return 'https://api.castrodeoliveiraadv.org';
  }

  return 'http://localhost:3007';
}

export const env = {
  apiBaseUrl: resolveApiBaseUrl(),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
};
