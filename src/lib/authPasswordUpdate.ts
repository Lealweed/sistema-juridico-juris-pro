export type ConfirmedPasswordSession = Readonly<{ userId: string; accessToken: string }>;

type PasswordUpdateOptions = {
  supabaseUrl: string;
  anonKey: string;
  session: ConfirmedPasswordSession;
  password: string;
  fetcher?: typeof fetch;
};

/** Bind the write to the token that confirmed the action, never the SDK's mutable session. */
export async function updatePasswordForConfirmedSession({ supabaseUrl, anonKey, session, password, fetcher = fetch }: PasswordUpdateOptions): Promise<void> {
  const { userId, accessToken } = session;
  let endpoint: URL;
  try { endpoint = new URL(supabaseUrl); } catch { throw new Error('Autenticação indisponível: endereço do serviço inválido.'); }
  if (!['https:', 'http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !anonKey || !userId || !accessToken) {
    throw new Error('Não foi possível confirmar a conta para atualizar a senha. Abra novamente o link de acesso.');
  }
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') + '/auth/v1/user';
  let response: Response;
  try {
    response = await fetcher(endpoint.toString(), {
      method: 'PUT',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Supabase-Api-Version': '2024-01-01',
      },
      body: JSON.stringify({ password }),
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
  } catch {
    // Do not surface request/headers/token details from transport exceptions.
    throw new Error('Não foi possível atualizar a senha. Tente novamente ou solicite outro link de acesso.');
  }
  if (!response.ok) {
    throw new Error('Não foi possível atualizar a senha. Tente novamente ou solicite outro link de acesso.');
  }
  const user: unknown = await response.json().catch(() => null);
  if (!user || typeof user !== 'object' || !('id' in user) || user.id !== userId) {
    throw new Error('A atualização não confirmou a conta esperada. Abra novamente o link de acesso.');
  }
}
