// Supabase Edge Function: clients-upsert-by-channel
// Busca ou cria cliente por office_id + whatsapp (phone_e164)
import { serve } from 'std/server';

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { office_id, phone_e164, name, extra } = body;
  if (!office_id || !phone_e164) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_required_fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'supabase_env_not_set' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // Busca cliente existente
  let client = null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/clients?office_id=eq.${office_id}&phone_e164=eq.${phone_e164}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (res.ok) {
      const arr = await res.json();
      if (arr.length > 0) client = arr[0];
    }
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'fetch_error', details: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // Atualiza se já existir
  if (client) {
    try {
      const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${client.id}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: name || client.name, ...extra }),
      });
      if (updateRes.ok) {
        const arr = await updateRes.json();
        client = arr[0] || client;
      }
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: 'update_error', details: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, clientId: client.id, updated: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // Cria se não existir
  try {
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify([{ office_id, phone_e164, name: name || '', ...extra }]),
    });
    if (createRes.ok) {
      const arr = await createRes.json();
      const created = arr[0];
      return new Response(JSON.stringify({ ok: true, clientId: created.id, created: true }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: false, error: 'create_failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'create_error', details: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
