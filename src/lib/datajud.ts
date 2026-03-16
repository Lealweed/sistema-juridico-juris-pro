import { requireSupabase } from '@/lib/supabaseDb';

export type DataJudLastMovement = {
  last_movement_text: string | null;
  last_movement_at: string | null;
  tribunal?: string;
};

export type BrasilApiProcesso = {
  numero: string;
  tribunal: string;
  ultimoAndamento: string;
  dataUltimoAndamento: string;
  status: string;
  source: 'escavador';
  warning?: string;
};

function sanitizeCnj(cnj: string) {
  return (cnj || '').replace(/\D/g, '');
}

function formatCnj(cnjDigits: string) {
  if (cnjDigits.length !== 20) return cnjDigits;
  return cnjDigits.replace(/(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})/, '$1-$2.$3.$4.$5.$6');
}

type EscavadorNode = Record<string, unknown>;

function pickProcessRoot(payload: EscavadorNode): EscavadorNode {
  const data = payload.data;
  if (Array.isArray(data)) {
    return ((data[0] as EscavadorNode | undefined) || payload) as EscavadorNode;
  }
  if (data && typeof data === 'object') {
    return data as EscavadorNode;
  }
  return payload;
}

function readMovementText(node: EscavadorNode) {
  const candidates = [
    node['texto'],
    node['nome'],
    node['descricao'],
    node['descricao_texto'],
    node['conteudo'],
  ];

  const value = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
  return typeof value === 'string' ? value.trim() : 'Sem movimentação disponível';
}

function readMovementDate(node: EscavadorNode) {
  const candidates = [
    node['data'],
    node['data_hora'],
    node['data_movimentacao'],
    node['data_publicacao'],
    node['created_at'],
  ];

  const value = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
  return typeof value === 'string' ? value : new Date().toISOString();
}

function pickLastMovement(processo: EscavadorNode) {
  const fromUltima = processo['ultima_movimentacao'];
  if (fromUltima && typeof fromUltima === 'object' && !Array.isArray(fromUltima)) {
    return fromUltima as EscavadorNode;
  }

  const movimentacoes = processo['movimentacoes'];
  if (Array.isArray(movimentacoes) && movimentacoes.length > 0) {
    const parsed = movimentacoes.filter((item): item is EscavadorNode => Boolean(item && typeof item === 'object'));
    if (!parsed.length) return null;
    return parsed.sort((left, right) => {
      const leftTime = new Date(readMovementDate(left)).getTime();
      const rightTime = new Date(readMovementDate(right)).getTime();
      return rightTime - leftTime;
    })[0];
  }

  return null;
}

export async function fetchEscavadorProcesso(cnj: string): Promise<BrasilApiProcesso> {
  const cnjLimpo = sanitizeCnj(cnj);
  const apiKey = import.meta.env.VITE_ESCAVADOR_API_KEY as string | undefined;

  if (cnjLimpo.length !== 20) {
    throw new Error('Informe um CNJ válido com 20 dígitos.');
  }

  if (!apiKey) {
    throw new Error('VITE_ESCAVADOR_API_KEY não configurada.');
  }

  const resp = await fetch(`https://api.escavador.com/api/v2/processos/numero_cnj/${cnjLimpo}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  const payload = (await resp.json().catch(() => null)) as EscavadorNode | null;

  if (!resp.ok || !payload) {
    const message = typeof payload?.error === 'string' ? payload.error : 'Falha ao consultar Escavador.';
    throw new Error(message);
  }

  const processo = pickProcessRoot(payload);
  const tribunalNode = processo['tribunal'];
  const tribunal =
    tribunalNode && typeof tribunalNode === 'object' && typeof (tribunalNode as EscavadorNode)['sigla'] === 'string'
      ? String((tribunalNode as EscavadorNode)['sigla'])
      : 'Tribunal não informado';

  const lastMovement = pickLastMovement(processo);
  const ultimoAndamento = lastMovement ? readMovementText(lastMovement) : 'Sem movimentação disponível';
  const dataUltimoAndamento = lastMovement ? readMovementDate(lastMovement) : new Date().toISOString();
  const status = typeof processo['status'] === 'string' && processo['status'] ? String(processo['status']) : 'Consulta Escavador';

  return {
    numero: typeof processo['numero_cnj'] === 'string' && processo['numero_cnj'] ? String(processo['numero_cnj']) : formatCnj(cnjLimpo),
    tribunal,
    ultimoAndamento,
    dataUltimoAndamento,
    status,
    source: 'escavador',
  };
}

export async function fetchBrasilApiProcesso(cnj: string): Promise<BrasilApiProcesso> {
  return fetchEscavadorProcesso(cnj);
}

export async function fetchDatajudLastMovement(processNumber: string): Promise<DataJudLastMovement> {
  const sb = requireSupabase();
  const { data: sessionData, error: sErr } = await sb.auth.getSession();
  if (sErr) throw new Error(sErr.message);
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sessão inválida. Faça login novamente.');

  const url = `${(sb as unknown as Record<string, unknown>).supabaseUrl}/functions/v1/datajud-last-movement`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ process_number: processNumber }),
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.error || 'Falha ao consultar DataJud.');

  return {
    last_movement_text: json?.last_movement_text ?? null,
    last_movement_at: json?.last_movement_at ?? null,
  };
}

