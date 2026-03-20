import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

type RequestPayload = {
  action?: 'request' | 'verify';
  cpf?: string;
  code?: string;
  challenge?: string;
};

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...init.headers,
    },
    ...init,
  });
}

function onlyDigits(value: string) {
  return (value || '').replace(/\D/g, '');
}

function whatsappLast4(value: string | null | undefined) {
  const digits = onlyDigits(value || '');
  return digits.slice(-4).padStart(4, '*');
}

function sanitizePhone(phone: string): string {
  const digits = onlyDigits(phone);
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function toBase64Url(input: Uint8Array): string {
  let str = '';
  for (let i = 0; i < input.length; i++) str += String.fromCharCode(input[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4 || 4)) % 4);
  const decoded = atob(padded);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return toBase64Url(new Uint8Array(sig));
}

function decodeUtf8(input: Uint8Array) {
  return new TextDecoder().decode(input);
}

async function sendWhatsAppText(phone: string, text: string) {
  const baseUrl = Deno.env.get('EVOLUTION_API_URL') || '';
  const apiKey = Deno.env.get('EVOLUTION_API_KEY') || '';
  const instance = Deno.env.get('EVOLUTION_INSTANCE') || '';

  if (!baseUrl || !apiKey || !instance) {
    throw new Error('Evolution API não configurada no backend. Defina EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE.');
  }

  const number = sanitizePhone(phone);
  const resp = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ number, text }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Falha ao enviar WhatsApp (${resp.status}): ${body.slice(0, 200)}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método não suportado.' }, { status: 405 });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const otpSecret = Deno.env.get('PORTAL_OTP_SECRET') || '';

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Configuração Supabase ausente no backend.' }, { status: 500 });
    }
    if (!otpSecret) {
      return json({ error: 'Segredo OTP ausente no backend (PORTAL_OTP_SECRET).' }, { status: 500 });
    }

    const payload = (await req.json().catch(() => ({}))) as RequestPayload;
    const action = payload.action;

    if (action === 'request') {
      const cpf = onlyDigits(payload.cpf || '');
      if (cpf.length !== 11) return json({ error: 'Informe um CPF válido.' }, { status: 400 });

      const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
      const { data, error } = await admin
        .from('clients')
        .select('id,name,whatsapp')
        .eq('cpf', cpf)
        .limit(1)
        .maybeSingle();

      if (error) return json({ error: error.message }, { status: 500 });
      if (!data) return json({ error: 'CPF não encontrado na base do escritório.' }, { status: 404 });
      if (!data.whatsapp) return json({ error: 'Cliente sem WhatsApp cadastrado para receber o código.' }, { status: 400 });

      const code = String(Math.floor(1000 + Math.random() * 9000));
      const nonce = crypto.randomUUID();
      const exp = Date.now() + 5 * 60 * 1000;
      const otpHash = await sha256Hex(`${code}:${nonce}`);

      const challengePayload = {
        client_id: data.id,
        client_name: data.name,
        whatsapp_last4: whatsappLast4(data.whatsapp),
        otp_hash: otpHash,
        nonce,
        exp,
      };

      const payloadJson = JSON.stringify(challengePayload);
      const payloadPart = toBase64Url(new TextEncoder().encode(payloadJson));
      const sigPart = await hmacSha256(otpSecret, payloadPart);
      const challenge = `${payloadPart}.${sigPart}`;

      await sendWhatsAppText(
        data.whatsapp,
        `Seu código de segurança para acessar o portal Lima, Lopes & Diógenes é: *${code}*. Ele expira em 5 minutos.`,
      );

      return json({
        ok: true,
        challenge,
        client: {
          id: data.id,
          name: data.name,
          whatsapp_last4: whatsappLast4(data.whatsapp),
        },
      });
    }

    if (action === 'verify') {
      const challenge = String(payload.challenge || '');
      const code = onlyDigits(payload.code || '');

      if (!challenge || !challenge.includes('.')) {
        return json({ error: 'Desafio inválido.' }, { status: 400 });
      }
      if (code.length !== 4) {
        return json({ error: 'Código inválido.' }, { status: 400 });
      }

      const [payloadPart, sigPart] = challenge.split('.');
      const expectedSig = await hmacSha256(otpSecret, payloadPart);
      if (!timingSafeEqual(sigPart || '', expectedSig)) {
        return json({ error: 'Desafio inválido.' }, { status: 401 });
      }

      const payloadJson = decodeUtf8(fromBase64Url(payloadPart));
      const parsed = JSON.parse(payloadJson) as {
        client_id: string;
        client_name: string;
        whatsapp_last4: string;
        otp_hash: string;
        nonce: string;
        exp: number;
      };

      if (!parsed.exp || Date.now() > parsed.exp) {
        return json({ error: 'Código expirado. Solicite um novo.' }, { status: 401 });
      }

      const candidateHash = await sha256Hex(`${code}:${parsed.nonce}`);
      if (!timingSafeEqual(candidateHash, parsed.otp_hash)) {
        return json({ error: 'Código inválido.' }, { status: 401 });
      }

      return json({
        ok: true,
        client: {
          id: parsed.client_id,
          name: parsed.client_name,
          whatsapp_last4: parsed.whatsapp_last4,
        },
      });
    }

    return json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (e) {
    return json({ error: (e as Error).message || 'Erro inesperado.' }, { status: 500 });
  }
});