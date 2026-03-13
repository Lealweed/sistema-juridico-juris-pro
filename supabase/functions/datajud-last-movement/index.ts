// Supabase Edge Function: datajud-last-movement
// MVP: query by CNJ process number, return last movement (best-effort)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...init.headers,
    },
    ...init,
  });
}

function normalizeCnj(input: string) {
  return (input || '').replace(/\D+/g, '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
        'access-control-allow-methods': 'POST, OPTIONS',
      },
    });
  }

  try {
    const { process_number } = await req.json().catch(() => ({ process_number: '' }));
    const cnj = normalizeCnj(String(process_number || ''));

    if (!cnj || cnj.length < 15) {
      return json({ error: 'Número CNJ inválido.' }, { status: 400, headers: { 'access-control-allow-origin': '*' } });
    }

    // NOTE: DataJud API details can change; this function is a placeholder to be wired
    // against the official public API endpoint.
    const baseUrl = Deno.env.get('DATAJUD_BASE_URL') || 'https://api-publica.datajud.cnj.jus.br';

    // DataJud Public API uses a *public* API key that can rotate.
    // Wiki format: Authorization: APIKey <PUBLIC_KEY>
    const apiKey = Deno.env.get('DATAJUD_API_KEY');

    const url = `${baseUrl}/api_publica/processos/${cnj}`;

    const resp = await fetch(url, {
      headers: {
        ...(apiKey ? { Authorization: `APIKey ${apiKey}` } : {}),
        'user-agent': 'crm-castro-adv/1.0',
      },
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return json(
        { error: 'Falha ao consultar DataJud.', status: resp.status, detail: text.slice(0, 500) },
        { status: 502, headers: { 'access-control-allow-origin': '*' } },
      );
    }

    const data = await resp.json().catch(() => null);

    // Best-effort extraction: adjust once we confirm exact schema.
    // Try common shapes: data.movimentacoes[0].descricao or similar.
    const movements = (data?.movimentacoes || data?.movements || data?.hits?.hits?.[0]?._source?.movimentacoes || []) as any[];
    const last = movements?.[0] || null;

    const movementText =
      last?.descricao || last?.texto || last?.nome || last?.movimento || last?.descricaoMovimento || null;
    const movementAt = last?.dataHora || last?.data || last?.data_movimentacao || null;

    return json(
      {
        ok: true,
        process_number: cnj,
        last_movement_text: movementText,
        last_movement_at: movementAt,
        raw_hint: data ? true : false,
      },
      { headers: { 'access-control-allow-origin': '*' } },
    );
  } catch (e) {
    return json({ error: (e as Error).message || 'Erro inesperado.' }, { status: 500, headers: { 'access-control-allow-origin': '*' } });
  }
});
