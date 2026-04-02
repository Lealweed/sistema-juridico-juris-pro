// Supabase Edge Function: messages-send
// Endpoint seguro para envio de mensagens WhatsApp via Evolution API
// @ts-expect-error: Deno remote import
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { insertWhatsappMessage, insertIntegrationOutbox, type JsonObject } from "./supabase.ts";
import { normalizePhone } from "../../../src/lib/normalizePhone.ts";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

type AuthResult = {
  userId: string | null;
  authMode: "n8n" | "user";
};

type MessageRequest = {
  channel?: string;
  destination?: string;
  text?: string;
  officeId?: string;
  clientId?: string | null;
  idempotencyKey?: string | null;
};

type HttpError = {
  status: number;
  error: string;
};

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function createHttpError(status: number, error: string): HttpError {
  return { status, error };
}

function isValidUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

function readIdempotencyKey(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) return null;
  return trimmed;
}

function readProviderMessageId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  const candidate = data.messageId ?? data.id;
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

// Utilitário para validação de autenticação (JWT ou SECRET interno)
async function validateAuth(req: Request, officeId: string): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw createHttpError(401, "unauthorized");
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const n8nSecret = Deno.env.get("N8N_MESSAGES_SEND_SECRET")?.trim();
  if (n8nSecret && token === n8nSecret) {
    return { userId: null, authMode: "n8n" };
  }

  // Validação JWT padrão
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw createHttpError(500, "supabase_env_not_set");
  }

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!userRes.ok) throw createHttpError(401, "invalid_jwt");

  const user = (await userRes.json()) as { id?: string; sub?: string; user?: { id?: string } };
  const userId = user.id || user.sub || user.user?.id || null;
  if (!userId) throw createHttpError(401, "invalid_jwt_payload");

  // Valida membership do usuário no office
  const memberRes = await fetch(
    `${SUPABASE_URL}/rest/v1/office_members?office_id=eq.${encodeURIComponent(officeId)}&user_id=eq.${encodeURIComponent(userId)}&select=id`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!memberRes.ok) throw createHttpError(500, "membership_check_failed");

  const members = (await memberRes.json()) as Array<{ id?: string }>;
  if (!Array.isArray(members) || members.length === 0) {
    throw createHttpError(403, "forbidden_membership");
  }

  return { userId, authMode: "user" };
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: MessageRequest;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ ok: false, error: "invalid_json" }, 400);
    }
    body = parsed as MessageRequest;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const { channel, destination, text, officeId } = body;
  const clientId = typeof body.clientId === "string" && body.clientId.trim() ? body.clientId.trim() : null;
  const idempotencyKey = readIdempotencyKey(body.idempotencyKey);

  if (channel !== "whatsapp" || typeof destination !== "string" || typeof text !== "string" || typeof officeId !== "string") {
    return json({ ok: false, error: "missing_required_fields" }, 400);
  }
  if (!isValidUUID(officeId)) {
    return json({ ok: false, error: "invalid_office_id" }, 400);
  }
  if (clientId && !isValidUUID(clientId)) {
    return json({ ok: false, error: "invalid_client_id" }, 400);
  }

  const messageText = text.trim();
  if (!messageText || messageText.length > 4096) {
    return json({ ok: false, error: "invalid_text" }, 400);
  }

  // --- Validação de autenticação (JWT ou SECRET) ---
  let authResult: AuthResult;
  try {
    authResult = await validateAuth(req, officeId);
  } catch (err) {
    const httpErr = err as Partial<HttpError>;
    const status = httpErr.status || 401;
    const error = httpErr.error || "unauthorized";
    return json({ ok: false, error }, status);
  }

  // Normaliza número (centralizado)
  const phone = normalizePhone(destination);
  if (!phone || phone.length < 10 || phone.length > 16) {
    return json({ ok: false, error: "invalid_destination" }, 400);
  }

  // Chama Evolution API (usar variáveis de ambiente seguras)
  const baseUrl = Deno.env.get("EVOLUTION_API_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_INSTANCE");
  if (!baseUrl || !apiKey || !instance) {
    return json({ ok: false, error: "evolution_api_not_configured" }, 500);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, error: "supabase_env_not_set" }, 500);
  }

  // --- Idempotência: checa se já existe mensagem/outbox com idempotencyKey ---
  if (idempotencyKey) {
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/integration_outbox?idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=id`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (checkRes.ok) {
      const arr = (await checkRes.json()) as Array<{ id?: string }>;
      if (arr.length > 0) {
        return json({ ok: true, idempotent: true, outboxId: arr[0].id || null }, 200);
      }
    }
  }

  // --- Chama Evolution API ---
  let evoData: unknown = null;
  try {
    const payload: JsonObject = { number: phone, text: messageText };
    const evoResp = await fetch(`${baseUrl}/message/sendText/${instance}`, {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    evoData = await evoResp.json().catch(() => null);
    if (!evoResp.ok) {
      const evoError =
        evoData && typeof evoData === "object" && "error" in (evoData as Record<string, unknown>)
          ? (evoData as Record<string, unknown>).error
          : evoData || "evolution_api_error";
      throw new Error(typeof evoError === "string" ? evoError : JSON.stringify(evoError));
    }
  } catch (error) {
    return json(
      {
        ok: false,
        error: "evolution_api_error",
        details: error instanceof Error ? error.message : String(error),
      },
      502,
    );
  }

  const providerMessageId = readProviderMessageId(evoData);

  // --- Busca ou cria conversa ---
  let conversation_id: string | null = null;
  try {
    const convRes = await fetch(
      `${SUPABASE_URL}/rest/v1/whatsapp_conversations?office_id=eq.${encodeURIComponent(officeId)}&phone_e164=eq.${encodeURIComponent(phone)}&select=id`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );

    let conv: { id?: string } | null = null;
    if (convRes.ok) {
      const arr = (await convRes.json()) as Array<{ id?: string }>;
      if (arr.length > 0) conv = arr[0];
    }

    if (!conv) {
      const createRes = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_conversations`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify([
          {
            office_id: officeId,
            client_id: clientId || null,
            phone_e164: phone,
            status: "open",
            source: "system",
          },
        ]),
      });
      if (createRes.ok) {
        const arr = (await createRes.json()) as Array<{ id?: string }>;
        conv = arr[0] || null;
      }
    }

    conversation_id = conv?.id || null;
    if (!conversation_id) throw new Error("conversation_not_found_or_created");
  } catch (error) {
    return json(
      {
        ok: false,
        error: "conversation_error",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }

  // Insere mensagem
  let messageRecord: { id?: string } | null = null;
  try {
    messageRecord = await insertWhatsappMessage({
      office_id: officeId,
      client_id: clientId || null,
      conversation_id,
      from_number: instance,
      to_number: phone,
      text_body: messageText,
      provider_message_id: providerMessageId,
      status: "sent",
      raw_payload: evoData && typeof evoData === "object" ? (evoData as JsonObject) : null,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: "db_insert_error",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }

  // Insere evento na integration_outbox
  let outboxRecord: { id?: string } | null = null;
  try {
    outboxRecord = await insertIntegrationOutbox({
      office_id: officeId,
      channel: "whatsapp",
      event_type: "message_sent",
      destination: phone,
      payload: {
        text: messageText,
        clientId,
        conversation_id,
        provider_message_id: providerMessageId,
      },
      status: "sent",
      idempotency_key: idempotencyKey,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: "db_insert_error",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }

  return json(
    {
      ok: true,
      messageId: messageRecord?.id || null,
      outboxId: outboxRecord?.id || null,
      provider_message_id: providerMessageId,
      authMode: authResult.authMode,
    },
    200,
  );
});
