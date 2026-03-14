import { requireSupabase } from '@/lib/supabaseDb';

export type DataJudLastMovement = {
  last_movement_text: string | null;
  last_movement_at: string | null;
  tribunal?: string;
};

export async function fetchDatajudLastMovement(processNumber: string): Promise<DataJudLastMovement> {
  const sb = requireSupabase();
  const { data: sessionData, error: sErr } = await sb.auth.getSession();
  if (sErr) throw new Error(sErr.message);
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sessão inválida. Faça login novamente.');

  const url = `${(sb as Record<string, unknown>).supabaseUrl}/functions/v1/datajud-last-movement`;

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

export async function fetchEscavadorProcesso(cnj: string): Promise<DataJudLastMovement> {
  const apiKey = import.meta.env.VITE_ESCAVADOR_API_KEY;
  if (!apiKey) {
    throw new Error('Chave do Escavador não configurada no .env.local');
  }

  const cnjLimpo = cnj.replace(/\D/g, '');
  
  const response = await fetch(`https://api.escavador.com/api/v1/processos/numero_cnj/${cnjLimpo}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'X-Requested-With': 'XMLHttpRequest',
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Processo não encontrado na base do Escavador ou em segredo de justiça.');
    }
    throw new Error(`Erro na consulta: ${response.statusText}`);
  }

  const data = await response.json();
  
  // O Escavador retorna um array "items" quando busca por CNJ
  if (!data.items || data.items.length === 0) {
    throw new Error('Processo não encontrado.');
  }

  const processo = data.items[0];
  const tribunal = processo.fontes?.[0]?.sigla || 'TJ';
  const movimentacoes = processo.movimentacoes || [];
  
  let ultimaMovimentacao = null;
  let dataMovimentacao = null;

  if (movimentacoes.length > 0) {
    ultimaMovimentacao = movimentacoes[0].tipo || movimentacoes[0].conteudo;
    dataMovimentacao = movimentacoes[0].data;
  }

  return {
    last_movement_text: ultimaMovimentacao,
    last_movement_at: dataMovimentacao,
    tribunal: tribunal
  };
}

