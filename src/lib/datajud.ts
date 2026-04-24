import { searchEscavadorProcessos } from '@/lib/integrations/escavador';
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

export async function fetchEscavadorProcesso(cnj: string): Promise<BrasilApiProcesso> {
  const cnjLimpo = sanitizeCnj(cnj);

  if (cnjLimpo.length !== 20) {
    throw new Error('Informe um CNJ válido com 20 dígitos.');
  }

  const response = await searchEscavadorProcessos({ numero_cnj: cnjLimpo });
  const processo = response.data[0];

  if (!processo) {
    throw new Error('Processo não encontrado no Escavador.');
  }

  return {
    numero: processo.numero_cnj || formatCnj(cnjLimpo),
    tribunal: processo.tribunal.sigla || processo.tribunal.nome || 'Tribunal não informado',
    ultimoAndamento: processo.titulo_polo_ativo || 'Consulta processual realizada no Escavador.',
    dataUltimoAndamento: processo.data_ultima_movimentacao || new Date().toISOString(),
    status: 'Consulta Escavador',
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

