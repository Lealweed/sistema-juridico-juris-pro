import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';

export type ProcuracaoData = {
  nome: string;
  nacionalidade: string;
  estadoCivil: string;
  profissao: string;
  cpf: string;
  rg: string;
  enderecoCompleto: string;
};

export function buildProcuracaoData(client: {
  name: string;
  cpf?: string | null;
  rg?: string | null;
  profession?: string | null;
  civil_status?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_cep?: string | null;
}): ProcuracaoData {
  const parts = [
    client.address_street,
    client.address_number ? `nº ${client.address_number}` : null,
    client.address_complement,
    client.address_neighborhood,
    client.address_city,
    client.address_state,
    client.address_cep ? `CEP ${client.address_cep}` : null,
  ].filter(Boolean);

  const BLANK = '________';

  return {
    nome: client.name || BLANK,
    nacionalidade: 'Brasileiro(a)',
    estadoCivil: client.civil_status || BLANK,
    profissao: client.profession || BLANK,
    cpf: client.cpf || BLANK,
    rg: client.rg || BLANK,
    enderecoCompleto: parts.join(', ') || BLANK,
  };
}

export async function generateProcuracaoDocx(data: ProcuracaoData): Promise<void> {
  const resp = await fetch('/templates/procuracao_template.docx');
  if (!resp.ok) {
    throw new Error(
      'Template não encontrado. Coloque o arquivo procuracao_template.docx em public/templates/.',
    );
  }

  const buf = await resp.arrayBuffer();
  const zip = new PizZip(buf);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });

  doc.render({
    NOME: data.nome,
    NACIONALIDADE: data.nacionalidade,
    ESTADO_CIVIL: data.estadoCivil,
    PROFISSAO: data.profissao,
    CPF: data.cpf,
    RG: data.rg,
    ENDERECO_COMPLETO: data.enderecoCompleto,
  });

  const out = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  const safeName = data.nome.replace(/[^a-zA-Z0-9À-ÿ ]/g, '').replace(/\s+/g, '_');
  saveAs(out, `Procuracao_${safeName}.docx`);
}
