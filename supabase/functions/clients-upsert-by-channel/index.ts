// Supabase Edge Function: clients-upsert-by-channel
// Busca ou cria cliente por office_id + whatsapp (phone_e164)
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

type UpsertRequest = {
  office_id?: string;
  phone_e164?: string;
  name?: string;
  extra?: JsonObject;
};

const JSON_HEADERS = { "Content-Type": "application/json" };
const RESERVED_FIELDS = new Set(["id", "office_id", "phone_e164", "user_id", "created_at", "updated_at"]);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function isValidUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

function onlyDigits(value: string) {
  return (value || "").replace(/\D/g, "");
}

function normalizeE164(value: string) {
  const digits = onlyDigits(value);
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function validateOptionalAuth(req: Request): boolean {
  const secret = Deno.env.get("CLIENTS_UPSERT_SECRET")?.trim() || Deno.env.get("N8N_WEBHOOK_SECRET")?.trim();
  if (!secret) return true;

  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.replace("Bearer ", "").trim() === secret;
  }

  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

function sanitizeExtra(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const safe: JsonObject = {};
  for (const [key, entry] of Object.entries(value as JsonObject)) {
    if (!RESERVED_FIELDS.has(key)) {
      safe[key] = entry;
    }
  }
  return safe;
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!validateOptionalAuth(req)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let body: UpsertRequest;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ ok: false, error: "invalid_json" }, 400);
    }
    body = parsed as UpsertRequest;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const office_id = typeof body.office_id === "string" ? body.office_id.trim() : "";
  const phone_e164 = typeof body.phone_e164 === "string" ? normalizeE164(body.phone_e164) : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const extra = sanitizeExtra(body.extra);

  if (!office_id || !phone_e164) {
    return json({ ok: false, error: "missing_required_fields" }, 400);
  }
  if (!isValidUUID(office_id)) {
    return json({ ok: false, error: "invalid_office_id" }, 400);
  }
  if (phone_e164.length < 12 || phone_e164.length > 16) {
    return json({ ok: false, error: "invalid_phone_e164" }, 400);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, error: "supabase_env_not_set" }, 500);
  }

  // Busca cliente existente
  let client: { id?: string; name?: string } | null = null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/clients?office_id=eq.${encodeURIComponent(office_id)}&phone_e164=eq.${encodeURIComponent(phone_e164)}&select=id,name`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (res.ok) {
      const arr = (await res.json()) as Array<{ id?: string; name?: string }>;
      if (arr.length > 0) client = arr[0];
    }
  } catch (error) {
    return json(
      { ok: false, error: "fetch_error", details: error instanceof Error ? error.message : String(error) },
      500,
    );
  }

  // Atualiza se já existir
  if (client?.id) {
    try {
      const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${encodeURIComponent(client.id)}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ ...extra, name: name || client.name || "" }),
      });
      if (updateRes.ok) {
        const arr = (await updateRes.json().catch(() => [])) as Array<{ id?: string; name?: string }>;
        client = arr[0] || client;
      } else {
        return new Response(JSON.stringify({ ok: false, error: 'update_failed: ' + await updateRes.text() }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    } catch (error) {
      return json(
        { ok: false, error: "update_error", details: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
    return json({ ok: true, clientId: client.id, updated: true }, 200);
  }

  // Cria se não existir
  try {
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify([{ ...extra, office_id, phone_e164, name }]),
    });
    if (createRes.ok) {
      const arr = (await createRes.json()) as Array<{ id?: string }>;
      const created = arr[0];
      return json({ ok: true, clientId: created?.id || null, created: true }, 201);
    }
    return new Response(JSON.stringify({ ok: false, error: 'create_failed: ' + await createRes.text() }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return json(
      { ok: false, error: "create_error", details: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});
