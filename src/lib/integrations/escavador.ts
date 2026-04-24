import { getAccessToken } from '@/lib/apiClient';
import { requireSupabase } from '@/lib/supabaseDb';

export type EscavadorProcessoItem = {
  id: string | null;
  numero_cnj: string | null;
  classe: string | null;
  assunto: string | null;
  status: string | null;
  ultima_movimentacao_texto: string | null;
  titulo_polo_ativo: string | null;
  titulo_polo_passivo: string | null;
  data_ultima_movimentacao: string | null;
  quantidade_movimentacoes: number;
  tribunal: { sigla: string | null; nome: string | null };
  url: string | null;
  detalhes: Record<string, unknown>;
};

export type EscavadorSearchParams = {
  nome?: string;
  cpf_cnpj?: string;
  numero_cnj?: string;
  cursor?: string | null;
};

export type EscavadorSearchResult = {
  data: EscavadorProcessoItem[];
  pagination: {
    nextCursor: string | null;
    hasNext: boolean;
  };
  operationalHeaders: {
    creditosUtilizados: string | null;
    rateLimitLimit: string | null;
    rateLimitRemaining: string | null;
  };
};

function normalizePayload(payload: unknown): EscavadorSearchResult {
  const root = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const data = Array.isArray(root.data) ? root.data : [];

  return {
    data: data.map((item) => {
      const node = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const tribunalNode =
        node.tribunal && typeof node.tribunal === 'object' && !Array.isArray(node.tribunal)
          ? (node.tribunal as Record<string, unknown>)
          : {};

      const detalhesNode =
        node.detalhes && typeof node.detalhes === 'object' && !Array.isArray(node.detalhes)
          ? (node.detalhes as Record<string, unknown>)
          : {};

      return {
        id: typeof node.id === 'string' ? node.id : null,
        numero_cnj: typeof node.numero_cnj === 'string' ? node.numero_cnj : null,
        classe: typeof node.classe === 'string' ? node.classe : null,
        assunto: typeof node.assunto === 'string' ? node.assunto : null,
        status: typeof node.status === 'string' ? node.status : null,
        ultima_movimentacao_texto: typeof node.ultima_movimentacao_texto === 'string' ? node.ultima_movimentacao_texto : null,
        titulo_polo_ativo: typeof node.titulo_polo_ativo === 'string' ? node.titulo_polo_ativo : null,
        titulo_polo_passivo: typeof node.titulo_polo_passivo === 'string' ? node.titulo_polo_passivo : null,
        data_ultima_movimentacao: typeof node.data_ultima_movimentacao === 'string' ? node.data_ultima_movimentacao : null,
        quantidade_movimentacoes:
          typeof node.quantidade_movimentacoes === 'number'
            ? node.quantidade_movimentacoes
            : Number(node.quantidade_movimentacoes || 0),
        tribunal: {
          sigla: typeof tribunalNode.sigla === 'string' ? tribunalNode.sigla : null,
          nome: typeof tribunalNode.nome === 'string' ? tribunalNode.nome : null,
        },
        url: typeof node.url === 'string' ? node.url : null,
        detalhes: detalhesNode,
      };
    }),
    pagination: {
      nextCursor:
        root.pagination && typeof root.pagination === 'object' && (root.pagination as Record<string, unknown>).nextCursor
          ? String((root.pagination as Record<string, unknown>).nextCursor)
          : null,
      hasNext: Boolean(
        root.pagination && typeof root.pagination === 'object' && (root.pagination as Record<string, unknown>).hasNext,
      ),
    },
    operationalHeaders: {
      creditosUtilizados:
        root.operationalHeaders && typeof root.operationalHeaders === 'object' && (root.operationalHeaders as Record<string, unknown>).creditosUtilizados
          ? String((root.operationalHeaders as Record<string, unknown>).creditosUtilizados)
          : null,
      rateLimitLimit:
        root.operationalHeaders && typeof root.operationalHeaders === 'object' && (root.operationalHeaders as Record<string, unknown>).rateLimitLimit
          ? String((root.operationalHeaders as Record<string, unknown>).rateLimitLimit)
          : null,
      rateLimitRemaining:
        root.operationalHeaders && typeof root.operationalHeaders === 'object' && (root.operationalHeaders as Record<string, unknown>).rateLimitRemaining
          ? String((root.operationalHeaders as Record<string, unknown>).rateLimitRemaining)
          : null,
    },
  };
}

export async function searchEscavadorProcessos(params: EscavadorSearchParams): Promise<EscavadorSearchResult> {
  const nome = (params.nome || '').trim();
  const cpfCnpj = (params.cpf_cnpj || '').replace(/\D/g, '');
  const numeroCnj = (params.numero_cnj || '').replace(/\D/g, '');

  if (!nome && !cpfCnpj && !numeroCnj) {
    throw new Error('Informe pelo menos nome, cpf_cnpj ou numero_cnj.');
  }

  const query = new URLSearchParams();
  if (nome) query.set('nome', nome);
  if (cpfCnpj) query.set('cpf_cnpj', cpfCnpj);
  if (numeroCnj) query.set('numero_cnj', numeroCnj);
  if (params.cursor) query.set('cursor', params.cursor);

  let token = getAccessToken();

  if (!token) {
    try {
      const sb = requireSupabase();
      const { data } = await sb.auth.getSession();
      token = data.session?.access_token ?? null;
    } catch {
      token = null;
    }
  }

  if (!token) {
    throw new Error('Não autenticado. Faça login novamente.');
  }

  const headers = new Headers({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  });

  const response = await fetch(`/api/integrations/escavador/processos?${query.toString()}`, {
    method: 'GET',
    headers,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const root = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
    const message = typeof root.error === 'string' && root.error.trim() ? root.error : 'Falha ao consultar Escavador.';
    throw new Error(message);
  }

  return normalizePayload(payload);
}
