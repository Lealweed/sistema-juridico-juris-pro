const host = typeof window !== 'undefined' ? window.location.hostname : '';

function resolveApiBaseUrl() {
  const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (configured) return configured;

  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  if (isLocalHost) {
    return 'http://localhost:3007';
  }

  // Produção sem variável definida: usa rotas relativas do próprio domínio.
  return '';
}

export const env = {
  apiBaseUrl: resolveApiBaseUrl(),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
};
