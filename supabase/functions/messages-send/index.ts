// Supabase Edge Function: messages-send
// Endpoint seguro para envio de mensagens WhatsApp via Evolution API
import { serve } from 'std/server';

import { insertWhatsappMessage, insertIntegrationOutbox } from './supabase.ts';
import { normalizePhone } from '../../../src/lib/normalizePhone.ts';

// Utilitário para validação de autenticação (JWT ou SECRET interno)
async function validateAuth(req: Request, officeId: string): Promise<{ userId?: string, n8n?: boolean }> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw { status: 401, error: 'unauthorized' };
  }
  const token = authHeader.replace('Bearer ', '');
  const N8N_SECRET = Deno.env.get('N8N_MESSAGES_SEND_SECRET');
  if (N8N_SECRET && token === N8N_SECRET) {
    // Autorização técnica para automação n8n
    return { n8n: true };
  }
  // Validação JWT padrão
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw { status: 500, error: 'supabase_env_not_set' };
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!userRes.ok) throw { status: 401, error: 'invalid_jwt' };
  const user = await userRes.json();
  const userId = user.id || user.sub || user.user?.id;
  if (!userId) throw { status: 401, error: 'invalid_jwt_payload' };
  // Valida membership do usuário no office
  const memberRes = await fetch(`${SUPABASE_URL}/rest/v1/office_members?office_id=eq.${officeId}&user_id=eq.${userId}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!memberRes.ok) throw { status: 500, error: 'membership_check_failed' };
  const members = await memberRes.json();
  if (!Array.isArray(members) || members.length === 0) throw { status: 403, error: 'forbidden_membership' };
  return { userId };
}

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


  const { channel, destination, text, officeId, clientId, idempotencyKey } = body;
  if (channel !== 'whatsapp' || !destination || !text || !officeId) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_required_fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }



  // --- Validação de autenticação (JWT ou SECRET) ---
  let userId: string | undefined;
  let n8n: boolean | undefined;
  try {
    const result = await validateAuth(req, String(officeId));
    userId = result.userId;
    n8n = result.n8n;
  } catch (err: any) {
    const status = err?.status || 401;
    const error = err?.error || 'unauthorized';
    return new Response(JSON.stringify({ ok: false, error }), { status, headers: { 'Content-Type': 'application/json' } });
  }


  // Normaliza número (centralizado)
  const phone = normalizePhone(destination);

  // Chama Evolution API (usar variáveis de ambiente seguras)

  const baseUrl = Deno.env.get('EVOLUTION_API_URL');
  const apiKey = Deno.env.get('EVOLUTION_API_KEY');
  const instance = Deno.env.get('EVOLUTION_INSTANCE');


  if (!baseUrl || !apiKey || !instance) {
    return new Response(JSON.stringify({ ok: false, error: 'evolution_api_not_configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }


  // --- Idempotência: checa se já existe mensagem/outbox com idempotencyKey ---
  if (idempotencyKey) {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/integration_outbox?idempotency_key=eq.${idempotencyKey}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (checkRes.ok) {
      const arr = await checkRes.json();
      if (arr.length > 0) {
        return new Response(JSON.stringify({ ok: true, idempotent: true, outboxId: arr[0].id }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }
  }

  // --- Chama Evolution API ---
  let evoResp, evoData, evoError;
  try {
    const payload = { number: phone, text };
    evoResp = await fetch(`${baseUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    evoData = await evoResp.json().catch(() => null);
    if (!evoResp.ok) {
      evoError = evoData?.error || evoData || 'evolution_api_error';
      throw new Error(typeof evoError === 'string' ? evoError : JSON.stringify(evoError));
    }
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'evolution_api_error', details: String(e) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }


  // --- Busca ou cria conversa ---
  let conversation_id = null;
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL/SERVICE_ROLE_KEY não configurados');
    const convRes = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_conversations?office_id=eq.${officeId}&phone_e164=eq.${phone}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    let conv = null;
    if (convRes.ok) {
      const arr = await convRes.json();
      if (arr.length > 0) conv = arr[0];
    }
    if (!conv) {
      // Cria nova conversa
      const createRes = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_conversations`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify([{
          office_id: officeId,
          client_id: clientId || null,
          phone_e164: phone,
          status: 'open',
          source: 'system',
        }]),
      });
      if (createRes.ok) {
        const arr = await createRes.json();
        conv = arr[0];
      }
    }
    conversation_id = conv?.id;
    if (!conversation_id) throw new Error('conversation_not_found_or_created');
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'conversation_error', details: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }


  // Insere mensagem
  let messageRecord = null;
  try {
    messageRecord = await insertWhatsappMessage({
      office_id: officeId,
      client_id: clientId || null,
      conversation_id: conversation_id,
      from_number: instance || '', // usa info da instância se disponível
      to_number: phone,
      text_body: text,
      provider_message_id: evoData?.messageId || evoData?.id || null,
      status: 'sent',
      raw_payload: evoData,
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'db_insert_error', details: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }


  // Insere evento na integration_outbox
  let outboxRecord = null;
  try {
    outboxRecord = await insertIntegrationOutbox({
      office_id: officeId,
      channel: 'whatsapp',
      event_type: 'message_sent',
      destination: phone,
      payload: { text, clientId, conversation_id, provider_message_id: evoData?.messageId || evoData?.id || null },
      status: 'sent',
      idempotency_key: idempotencyKey || null,
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'db_insert_error', details: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }


  return new Response(JSON.stringify({ ok: true, messageId: messageRecord?.id, outboxId: outboxRecord?.id, provider_message_id: evoData?.messageId || evoData?.id || null }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
