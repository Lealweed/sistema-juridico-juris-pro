type ReqLike = {
  method?: string;
  body?: unknown;
};

type ResLike = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => { json: (payload: unknown) => unknown };
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function onlyDigits(value: string) {
  return (value || '').replace(/\D/g, '');
}

async function resolveOfficeId(supabaseUrl: string, serviceRoleKey: string): Promise<string> {
  const configured = (process.env.LEAD_CAPTURE_OFFICE_ID || process.env.DEFAULT_OFFICE_ID || '').trim();
  if (configured) {
    if (!isUuid(configured)) {
      throw new Error('LEAD_CAPTURE_OFFICE_ID inválido.');
    }
    return configured;
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/offices?select=id&order=created_at.asc&limit=2`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => 'falha ao consultar offices');
    throw new Error(`Falha ao resolver office: ${msg}`);
  }

  const rows = (await res.json().catch(() => [])) as Array<{ id?: string }>;
  const ids = rows.map((row) => String(row.id || '')).filter((id) => isUuid(id));

  if (ids.length === 1) return ids[0];
  if (ids.length === 0) throw new Error('Nenhum escritório encontrado para capturar leads.');
  throw new Error('Múltiplos escritórios detectados. Configure LEAD_CAPTURE_OFFICE_ID no ambiente.');
}

async function insertClient(params: {
  supabaseUrl: string;
  serviceRoleKey: string;
  officeId: string;
  name: string;
  whatsapp: string;
  area: string;
  description: string;
}) {
  const { supabaseUrl, serviceRoleKey, officeId, name, whatsapp, area, description } = params;

  const payload = {
    user_id: null,
    office_id: officeId,
    name,
    whatsapp,
    phone: whatsapp,
    notes: 'Lead captado pelo site',
    contact_type: 'lead',
    legal_area: area,
    case_description: description,
  };

  const res = await fetch(`${supabaseUrl}/rest/v1/clients`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify([payload]),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => 'falha ao inserir lead');
    throw new Error(`Falha ao criar lead: ${msg}`);
  }

  const rows = (await res.json().catch(() => [])) as Array<{ id?: string }>;
  const clientId = String(rows[0]?.id || '');
  if (!isUuid(clientId)) throw new Error('Lead criado sem client_id válido.');

  return clientId;
}

async function insertCase(params: {
  supabaseUrl: string;
  serviceRoleKey: string;
  officeId: string;
  clientId: string;
  area: string;
  description: string;
}) {
  const { supabaseUrl, serviceRoleKey, officeId, clientId, area, description } = params;

  const payload = {
    user_id: null,
    office_id: officeId,
    client_id: clientId,
    title: `Novo Lead (Site): ${area || 'Geral'}`,
    description,
    status: 'Triagem',
    area,
  };

  const res = await fetch(`${supabaseUrl}/rest/v1/cases`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify([payload]),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => 'falha ao criar caso');
    throw new Error(`Falha ao criar caso do lead: ${msg}`);
  }

  const rows = (await res.json().catch(() => [])) as Array<{ id?: string }>;
  const caseId = String(rows[0]?.id || '');
  if (!isUuid(caseId)) throw new Error('Caso criado sem case_id válido.');

  return caseId;
}

export default async function handler(req: ReqLike, res: ResLike) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase server env não configurada.' });
  }

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const name = String(body.name || '').trim();
  const whatsapp = onlyDigits(String(body.whatsapp || ''));
  const area = String(body.area || '').trim();
  const description = String(body.description || '').trim();

  if (!name || !whatsapp || !area || !description) {
    return res.status(400).json({ error: 'Por favor, preencha todos os campos.' });
  }

  try {
    const officeId = await resolveOfficeId(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const clientId = await insertClient({
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      officeId,
      name,
      whatsapp,
      area,
      description,
    });

    const caseId = await insertCase({
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      officeId,
      clientId,
      area,
      description,
    });

    return res.status(200).json({ ok: true, client_id: clientId, case_id: caseId, office_id: officeId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado ao enviar lead.';
    return res.status(500).json({ error: message });
  }
}
