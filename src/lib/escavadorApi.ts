import { searchEscavadorProcessos } from '@/lib/integrations/escavador';

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

export async function fetchProcessoEscavador(numeroCnj: string): Promise<EscavadorProcessoBasico> {
  const cnj = (numeroCnj || '').trim();
  if (!cnj) throw new Error('Informe o número CNJ do processo.');

  const result = await searchEscavadorProcessos({ numero_cnj: cnj });
  const processo = result.data[0];

  if (!processo) {
    throw new Error('Nenhum processo encontrado para o CNJ informado.');
  }

  return {
    numero_cnj: processo.numero_cnj,
    tribunal: processo.tribunal.sigla || processo.tribunal.nome,
    classe: null,
    assunto: null,
    status: null,
    ultima_movimentacao: {
      texto: null,
      data: processo.data_ultima_movimentacao,
    },
  };
}
