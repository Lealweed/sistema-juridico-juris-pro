import { requireSupabase } from '@/lib/supabaseDb';

export type DataJudLastMovement = {
  last_movement_text: string | null;
  last_movement_at: string | null;
};

export async function fetchDatajudLastMovement(processNumber: string): Promise<DataJudLastMovement> {
  const sb = requireSupabase();
  const { data: sessionData, error: sErr } = await sb.auth.getSession();
  if (sErr) throw new Error(sErr.message);
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sessão inválida. Faça login novamente.');

  const url = `${(sb as any).supabaseUrl}/functions/v1/datajud-last-movement`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ process_number: processNumber }),
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.error || 'Falha ao consultar DataJud.');

  return {
    last_movement_text: json?.last_movement_text ?? null,
    last_movement_at: json?.last_movement_at ?? null,
  };
}
