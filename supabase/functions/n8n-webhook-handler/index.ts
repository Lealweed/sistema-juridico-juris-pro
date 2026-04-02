// Supabase Edge Function: n8n-webhook-handler
// Recebe webhooks do n8n para orquestração de integrações (ex: WhatsApp, eventos, automações)

// @ts-expect-error: Deno remote import
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

type WebhookPayload = {
  event_type?: string;
  office_id?: string;
  entity_type?: string;
  entity_id?: string;
  payload?: JsonObject;
  idempotency_key?: string;
};

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(body: JsonObject, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Utilitário para validação de Bearer Token/Secret
function validateAuth(req: Request): { ok: boolean; method: "bearer" | "query" | null } {
  const secret = Deno.env.get("N8N_WEBHOOK_SECRET")?.trim();
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");

  if (!secret) return { ok: false, method: null };

  if (authHeader?.startsWith("Bearer ")) {
    return {
      ok: authHeader.replace("Bearer ", "").trim() === secret,
      method: "bearer",
    };
  }

  // Compatibilidade com integrações legadas que ainda usam query string.
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) {
    return { ok: true, method: "query" };
  }

  return { ok: false, method: null };
}

// Utilitário para validação de UUID
function isValidUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

function readIdempotencyKey(value: unknown): string | null {
  if (typeof value !== "string") return value == null ? null : null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) return null;
  return trimmed;
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: WebhookPayload;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ ok: false, error: "invalid_json" }, 400);
    }
    body = parsed as WebhookPayload;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  // --- Autenticação obrigatória ---
  const authResult = validateAuth(req);
  if (!authResult.ok) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  // Exemplo: espera { event_type, office_id, entity_type, entity_id, payload, idempotency_key }
  const { event_type, office_id, entity_type, entity_id } = body;
  const payload = body.payload;
  const idempotency_key = readIdempotencyKey(body.idempotency_key);

  if (!event_type || typeof event_type !== "string" || !event_type.trim()) {
    return json({ ok: false, error: "invalid_event_type" }, 400);
  }
  if (!office_id || typeof office_id !== "string" || !isValidUUID(office_id)) {
    return json({ ok: false, error: "invalid_office_id" }, 400);
  }
  if (entity_id && (typeof entity_id !== "string" || !isValidUUID(entity_id))) {
    return json({ ok: false, error: "invalid_entity_id" }, 400);
  }
  if (body.idempotency_key !== undefined && !idempotency_key) {
    return json({ ok: false, error: "invalid_idempotency_key" }, 400);
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return json({ ok: false, error: "invalid_payload" }, 400);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, error: "supabase_env_not_set" }, 500);
  }

  // --- Idempotência mínima ---
  if (idempotency_key) {
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/integration_webhook_logs?idempotency_key=eq.${encodeURIComponent(idempotency_key)}&select=event_id`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (checkRes.ok) {
      const arr = (await checkRes.json()) as Array<{ event_id?: string }>;
      if (arr.length > 0) {
        return json({ ok: true, idempotent: true, eventId: arr[0].event_id || null }, 200);
      }
    }
  }

  // --- Registra evento na tabela integration_events ---
  let eventId: string | null = null;
  let logId: string | null = null;
  let logError: string | null = null;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/integration_events`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify([
        {
          office_id,
          event_type: event_type.trim(),
          entity_type: entity_type || null,
          entity_id: entity_id || null,
          payload,
          processed: false,
        },
      ]),
    });

    if (!res.ok) {
      const responseText = await res.text().catch(() => "");
      logError = responseText || `integration_events_insert_failed:${res.status}`;
    } else {
      const eventRows = (await res.json()) as Array<{ id?: string }>;
      eventId = eventRows[0]?.id || null;
      if (!eventId) {
        logError = "integration_events_insert_succeeded_without_event_id";
      }
    }
  } catch (error) {
    logError = error instanceof Error ? error.message : String(error);
  }

  // --- Logging em integration_webhook_logs ---
  try {
    const headersToLog: Record<string, string> = {
      "x-auth-mode": authResult.method ?? "unknown",
    };

    for (const [key, value] of req.headers.entries()) {
      if (/authorization|cookie|set-cookie/i.test(key)) continue;
      headersToLog[key] = value;
    }

    const logRes = await fetch(`${SUPABASE_URL}/rest/v1/integration_webhook_logs`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify([
        {
          office_id,
          provider: "n8n",
          event_type: event_type.trim(),
          entity_type: entity_type || null,
          entity_id: entity_id || null,
          idempotency_key: idempotency_key || null,
          headers: headersToLog,
          raw_payload: { ...body, idempotency_key },
          status: eventId ? "success" : "error",
          response_status: eventId ? 200 : 500,
          error: logError,
          event_id: eventId || null,
        },
      ]),
    });

    if (logRes.ok) {
      const logArr = (await logRes.json()) as Array<{ id?: string }>;
      logId = logArr[0]?.id || null;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError = logError ? `${logError} | log_error: ${message}` : `log_error: ${message}`;
  }

  if (!eventId) {
    return new Response(JSON.stringify({ ok: false, error: logError }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return json({ ok: true, eventId, logId, authMode: authResult.method ?? "unknown" }, 200);
});
