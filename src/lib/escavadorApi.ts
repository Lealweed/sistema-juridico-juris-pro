export type EscavadorMovimentacao = {
  texto: string | null;
  data: string | null;
};

export type EscavadorProcessoBasico = {
  numero_cnj: string | null;
  tribunal: string | null;
  classe: string | null;
  assunto: string | null;
  status: string | null;
  ultima_movimentacao: EscavadorMovimentacao;
};

type AnyNode = Record<string, unknown>;

function asNode(value: unknown): AnyNode | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as AnyNode;
}

function pickRoot(payload: unknown): AnyNode {
  const node = asNode(payload);
  if (!node) return {};

  const data = node.data;
  if (Array.isArray(data) && data.length > 0) {
    const first = asNode(data[0]);
    if (first) return first;
  }

  const dataNode = asNode(data);
  if (dataNode) return dataNode;

  return node;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function readTribunal(processo: AnyNode): string | null {
  const tribunal = asNode(processo.tribunal);
  if (tribunal) {
    return pickString(tribunal.sigla, tribunal.nome, tribunal.descricao);
  }
  return pickString(processo.tribunal_sigla, processo.tribunal_nome);
}

function readFirstMovimentacao(processo: AnyNode): EscavadorMovimentacao {
  const movimentacoes = processo.movimentacoes;
  if (!Array.isArray(movimentacoes) || movimentacoes.length === 0) {
    return { texto: null, data: null };
  }

  const first = asNode(movimentacoes[0]);
  if (!first) return { texto: null, data: null };

  return {
    texto: pickString(first.texto, first.nome, first.descricao, first.conteudo),
    data: pickString(first.data, first.data_hora, first.data_movimentacao, first.data_publicacao, first.created_at),
  };
}

export async function fetchProcessoEscavador(numeroCnj: string): Promise<EscavadorProcessoBasico> {
  const token = import.meta.env.VITE_ESCAVADOR_API_TOKEN as string | undefined;
  if (!token) throw new Error('VITE_ESCAVADOR_API_TOKEN não configurada.');

  const cnj = (numeroCnj || '').trim();
  if (!cnj) throw new Error('Informe o número CNJ do processo.');

  const url = `https://api.escavador.com/api/v1/processos/numero/${encodeURIComponent(cnj)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = asNode(payload)?.message;
    throw new Error(typeof message === 'string' && message.trim() ? message : 'Falha ao consultar Escavador.');
  }

  const processo = pickRoot(payload);
  return {
    numero_cnj: pickString(processo.numero_cnj, processo.numero),
    tribunal: readTribunal(processo),
    classe: pickString(processo.classe, asNode(processo.classe_processual)?.nome),
    assunto: pickString(processo.assunto_principal, asNode(processo.assunto)?.nome),
    status: pickString(processo.status),
    ultima_movimentacao: readFirstMovimentacao(processo),
  };
}
