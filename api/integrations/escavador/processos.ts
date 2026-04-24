type EscavadorApiNode = Record<string, unknown>;

type EscavadorNormalizedProcesso = {
  id: string | null;
  numero_cnj: string | null;
  titulo_polo_ativo: string | null;
  titulo_polo_passivo: string | null;
  data_ultima_movimentacao: string | null;
  quantidade_movimentacoes: number;
  tribunal: { sigla: string | null; nome: string | null };
  url: string | null;
};

function asNode(value: unknown): EscavadorApiNode | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as EscavadorApiNode;
}

function asString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function parseDataArray(payload: unknown): EscavadorApiNode[] {
  if (Array.isArray(payload)) return payload.filter((item): item is EscavadorApiNode => !!asNode(item));

  const root = asNode(payload);
  if (!root) return [];

  if (Array.isArray(root.items)) {
    return root.items.filter((item): item is EscavadorApiNode => !!asNode(item));
  }

  if (Array.isArray(root.data)) {
    return root.data.filter((item): item is EscavadorApiNode => !!asNode(item));
  }

  const single = asNode(root.data);
  if (single) return [single];
  return [];
}

function parseNextCursor(payload: unknown): string | null {
  const root = asNode(payload);
  const links = asNode(root?.links);
  const next = asString(links?.next);
  if (!next) return null;

  try {
    const parsed = new URL(next);
    return parsed.searchParams.get('cursor');
  } catch {
    try {
      const parsedRelative = new URL(next, 'https://api.escavador.com');
      return parsedRelative.searchParams.get('cursor');
    } catch {
      return null;
    }
  }
}

function normalizeProcesso(raw: EscavadorApiNode): EscavadorNormalizedProcesso {
  const tribunalNode = asNode(raw.tribunal);
  const primeiraFonte = Array.isArray(raw.fontes) && raw.fontes.length > 0 ? asNode(raw.fontes[0]) : null;
  const tribunalFonte = asNode(primeiraFonte?.tribunal);

  return {
    id: asString(raw.id, raw.uuid),
    numero_cnj: asString(raw.numero_cnj, raw.numero),
    titulo_polo_ativo: asString(raw.titulo_polo_ativo),
    titulo_polo_passivo: asString(raw.titulo_polo_passivo),
    data_ultima_movimentacao: asString(raw.data_ultima_movimentacao, raw.data_atualizacao),
    quantidade_movimentacoes: asNumber(raw.quantidade_movimentacoes),
    tribunal: {
      sigla: asString(tribunalNode?.sigla, tribunalFonte?.sigla, raw.tribunal_sigla),
      nome: asString(tribunalNode?.nome, tribunalFonte?.nome, raw.tribunal_nome),
    },
    url: asString(raw.url, primeiraFonte?.url, raw.link),
  };
}

function mapErrorMessage(status: number, fallback: string) {
  if (status === 401) return 'Token Escavador inválido ou ausente no servidor.';
  if (status === 429) return 'Limite de consultas da Escavador atingido. Tente novamente em instantes.';
  if (status >= 500) return 'Escavador temporariamente indisponível. Tente novamente mais tarde.';
  return fallback;
}

type ReqLike = {
  method?: string;
  headers?: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
};

type ResLike = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => { json: (payload: unknown) => unknown };
};

export default async function handler(req: ReqLike, res: ResLike) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const authHeader = req.headers?.authorization;
  if (!authHeader || !String(authHeader).startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  const nome = typeof req.query?.nome === 'string' ? req.query.nome.trim() : '';
  const cpfCnpj = typeof req.query?.cpf_cnpj === 'string' ? req.query.cpf_cnpj.replace(/\D/g, '') : '';
  const numeroCnj = typeof req.query?.numero_cnj === 'string' ? req.query.numero_cnj.replace(/\D/g, '') : '';
  const cursor = typeof req.query?.cursor === 'string' ? req.query.cursor.trim() : '';

  if (!nome && !cpfCnpj && !numeroCnj) {
    return res.status(400).json({ error: 'Informe pelo menos nome, cpf_cnpj ou numero_cnj.' });
  }

  const escavadorToken = process.env.ESCAVADOR_API_TOKEN;
  if (!escavadorToken) {
    return res.status(500).json({ error: 'ESCAVADOR_API_TOKEN não configurado no ambiente servidor.' });
  }

  const params = new URLSearchParams();
  if (nome) params.set('nome', nome);
  if (cpfCnpj) params.set('cpf_cnpj', cpfCnpj);
  if (cursor) params.set('cursor', cursor);

  const url = numeroCnj
    ? `https://api.escavador.com/api/v2/processos/numero_cnj/${encodeURIComponent(numeroCnj)}`
    : `https://api.escavador.com/api/v2/envolvido/processos?${params.toString()}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${escavadorToken}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    const payload = await response.json().catch(() => null);

    const operationalHeaders = {
      creditosUtilizados: response.headers.get('Creditos-Utilizados') ?? null,
      rateLimitLimit: response.headers.get('X-RateLimit-Limit') ?? null,
      rateLimitRemaining: response.headers.get('X-RateLimit-Remaining') ?? null,
    };

    if (!response.ok) {
      const root = asNode(payload);
      const fallback = asString(root?.message, root?.error, 'Falha ao consultar Escavador.') ?? 'Falha ao consultar Escavador.';
      return res.status(response.status).json({
        error: mapErrorMessage(response.status, fallback),
        operationalHeaders,
      });
    }

    const data = parseDataArray(payload).map(normalizeProcesso);
    const nextCursor = parseNextCursor(payload);

    return res.status(200).json({
      data,
      pagination: {
        nextCursor,
        hasNext: Boolean(nextCursor),
      },
      operationalHeaders,
    });
  } catch {
    return res.status(502).json({
      error: 'Falha de comunicação com Escavador.',
      operationalHeaders: {
        creditosUtilizados: null,
        rateLimitLimit: null,
        rateLimitRemaining: null,
      },
    });
  }
}
