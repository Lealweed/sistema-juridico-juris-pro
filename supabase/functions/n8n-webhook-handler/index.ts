// Supabase Edge Function: n8n-webhook-handler
// Recebe webhooks do n8n para orquestração de integrações (ex: WhatsApp, eventos, automações)

import { serve } from 'std/server';

// Utilitário para validação de Bearer Token/Secret
function validateAuth(req: Request): boolean {
  const secret = Deno.env.get('N8N_WEBHOOK_SECRET');
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!secret) return false;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '') === secret;
  }
  // Também aceita ?secret=... na query
  const url = new URL(req.url);
  if (url.searchParams.get('secret') === secret) return true;
  return false;
}

// Utilitário para validação de UUID
function isValidUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }


  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // --- Autenticação obrigatória ---
  if (!validateAuth(req)) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }


  // Exemplo: espera { event_type, office_id, entity_type, entity_id, payload, idempotency_key }
  const { event_type, office_id, entity_type, entity_id, payload, idempotency_key } = body;
  if (!event_type || typeof event_type !== 'string' || !event_type.trim()) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_event_type' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (!office_id || typeof office_id !== 'string' || !isValidUUID(office_id)) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_office_id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (entity_id && (typeof entity_id !== 'string' || !isValidUUID(entity_id))) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_entity_id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_payload' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }


  // --- Idempotência mínima ---
  if (idempotency_key) {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/integration_webhook_logs?idempotency_key=eq.${idempotency_key}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (checkRes.ok) {
      const arr = await checkRes.json();
      if (arr.length > 0) {
        return new Response(JSON.stringify({ ok: true, idempotent: true, eventId: arr[0].event_id }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }
  }


  // --- Registra evento na tabela integration_events ---
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'supabase_env_not_set' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  let event = null;
  let eventId = null;
  let logId = null;
  let logError = null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/integration_events`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify([
        {
          office_id,
          event_type,
          entity_type: entity_type || null,
          entity_id: entity_id || null,
          payload: payload || {},
          processed: false,
        },
      ]),
    });
    if (!res.ok) throw new Error('event_insert_failed');
    event = (await res.json())[0];
    eventId = event?.id;
  } catch (e) {
    logError = String(e);
  }

  // --- Logging em integration_webhook_logs ---
  try {
    const headersToLog = {};
    for (const [k, v] of req.headers.entries()) {
      if (/authorization|cookie|set-cookie/i.test(k)) continue;
      headersToLog[k] = v;
    }
    const logRes = await fetch(`${SUPABASE_URL}/rest/v1/integration_webhook_logs`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify([
        {
          office_id,
          provider: 'n8n',
          event_type,
          entity_type: entity_type || null,
          entity_id: entity_id || null,
          idempotency_key: idempotency_key || null,
          headers: headersToLog,
          raw_payload: body,
          status: eventId ? 'success' : 'error',
          response_status: eventId ? 200 : 500,
          error: logError,
          event_id: eventId || null,
        },
      ]),
    });
    if (logRes.ok) {
      const logArr = await logRes.json();
      logId = logArr[0]?.id;
    }
  } catch (e) {
    // Não quebra fluxo, mas loga
    logError = (logError || '') + ' | log_error: ' + String(e);
  }

  if (!eventId) {
    return new Response(JSON.stringify({ ok: false, error: 'event_insert_failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ ok: true, eventId, logId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
