import { APPROVED_CONTRACT_TEMPLATES } from './approvedContractCatalog';

export type ProcuracaoData = {
  nome: string;
  nacionalidade: string;
  estadoCivil: string;
  profissao: string;
  cpf: string;
  rg: string;
  enderecoCompleto: string;
};

export const DOCUMENT_BLANK = '________';

/** Build emission variables without changing the saved client record. */
export function prepareDocumentData(
  data: ProcuracaoData | Record<string, string>,
  issuedAt = new Date(),
): Record<string, string> {
  const mapped: Record<string, string> = 'nome' in data
    ? {
        NOME: data.nome, NACIONALIDADE: data.nacionalidade,
        ESTADO_CIVIL: data.estadoCivil, PROFISSAO: data.profissao,
        CPF: data.cpf, RG: data.rg, ENDERECO_COMPLETO: data.enderecoCompleto,
      }
    : { ...data };
  for (const key of ['NOME', 'NACIONALIDADE', 'ESTADO_CIVIL', 'PROFISSAO', 'CPF', 'RG', 'ENDERECO_COMPLETO', 'ENDERECO']) {
    mapped[key] = mapped[key]?.trim() || DOCUMENT_BLANK;
  }
  mapped.DATA_ATUAL = mapped.DATA_ATUAL?.trim() || issuedAt.toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  return mapped;
}

export type DocumentField = { key: string; label: string; placeholder: string; required?: boolean };
export type DocumentTemplate = {
  id: string;
  file: string;
  label: string;
  group: 'Contratos' | 'Procurações' | 'Recibos';
  description: string;
  availability?: 'ready' | 'pending';
  fields: DocumentField[];
};

const qualificationFields: DocumentField[] = [
  { key: 'CPF', label: 'CPF do cliente', placeholder: 'CPF para este documento' },
  { key: 'RG', label: 'RG do cliente', placeholder: 'Número e órgão emissor' },
  { key: 'ENDERECO_COMPLETO', label: 'Endereço completo', placeholder: 'Rua, número, complemento, bairro, cidade, UF e CEP' },
];

// Every editable field is present in the corresponding official Word template.
export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: 'contrato-incap', file: 'CONTRATO_MODELO_AUX_POR_INCAP_TEMPORARIA.docx',
    label: 'Aux. por Incapacidade Temporária', group: 'Contratos',
    description: 'Contrato de honorários para ações de auxílio por incapacidade temporária.',
    availability: 'ready',
    fields: qualificationFields,
  },
  {
    id: 'contrato-bpc', file: 'CONTRATO_MODELO_BPC-LOAS.docx', label: 'BPC-LOAS — pessoa com deficiência', group: 'Contratos',
    description: 'Contrato de honorários para benefício assistencial à pessoa com deficiência (BPC/LOAS), conforme o modelo existente.', availability: 'ready', fields: qualificationFields,
  },
  {
    id: 'contrato-trabalhista', file: 'CONTRATO_MODELO_RECLAMAÇÃO_TRABALHISTA.docx',
    label: 'Reclamação Trabalhista', group: 'Contratos',
    description: 'Contrato de honorários para reclamatória trabalhista.', availability: 'ready', fields: qualificationFields,
  },
  {
    id: 'procuracao', file: 'PROCURAÇÃO.docx', label: 'Procuração', group: 'Procurações',
    description: 'Procuração geral com dados completos do outorgante.',
    availability: 'ready',
    fields: [...qualificationFields, { key: 'PROFISSAO', label: 'Profissão do cliente', placeholder: 'Profissão do outorgante' }],
  },
  ...APPROVED_CONTRACT_TEMPLATES,
];

export function isDocumentTemplateAvailable(template: DocumentTemplate): boolean {
  return template.availability !== 'pending';
}

export function assertDocumentTemplateAvailable(templateFile: string): void {
  const template = DOCUMENT_TEMPLATES.find(item => item.file === templateFile);
  if (!template) throw new Error('Modelo de documento não suportado. Selecione um modelo oficial.');
  if (!isDocumentTemplateAvailable(template)) throw new Error('Este modelo está em conferência e ainda não pode ser gerado.');
}

/** Only per-document drafts are initialized; the client record is never modified. */
export function initialDocumentFields(
  client: { name: string; cpf?: string | null } | null,
  template: DocumentTemplate | null,
): Record<string, string> {
  return {
    CPF: client?.cpf || '',
    ...(template?.fields.some(field => field.key === 'NOME') ? { NOME: client?.name || '' } : {}),
  };
}

/** Validate the official model's qualifications in the main document generator. */
export function getMissingDocumentFields(
  data: ProcuracaoData | Record<string, string>,
  templateFile: string,
): string[] {
  const template = DOCUMENT_TEMPLATES.find((item) => item.file === templateFile);
  if (!template) throw new Error('Modelo de documento não suportado. Selecione um modelo oficial.');

  const prepared = prepareDocumentData(data);
  const fields = template.fields.filter(field => field.required !== false);
  const required = fields.some(field => field.key === 'NOME')
    ? fields
    : [{ key: 'NOME', label: 'Nome do cliente' }, ...fields];
  return required
    .filter(({ key }) => !prepared[key]?.trim() || prepared[key].trim() === DOCUMENT_BLANK)
    .map(({ label }) => label);
}
export function resolveTemplateAssetName(templateName: string): string {
  // Keep catalog/history names stable while using dated, sanitized assets in new tabs.
  const datedAssets: Record<string, string> = {
    'CONTRATO_MODELO_AUX_POR_INCAP_TEMPORARIA.docx': 'CONTRATO_MODELO_AUX_POR_INCAP_TEMPORARIA_v2.docx',
    'CONTRATO_MODELO_BPC-LOAS.docx': 'CONTRATO_MODELO_BPC-LOAS_v2.docx',
    'CONTRATO_MODELO_RECLAMAÇÃO_TRABALHISTA.docx': 'CONTRATO_MODELO_RECLAMACAO_TRABALHISTA_v2.docx',
    'CONTRATO_MODELO_RECLAMACAO_TRABALHISTA.docx': 'CONTRATO_MODELO_RECLAMACAO_TRABALHISTA_v2.docx',
    'PROCURAÇÃO.docx': 'PROCURACAO_v2.docx',
    'PROCURACAO.docx': 'PROCURACAO_v2.docx',
  };
  return datedAssets[templateName] || templateName;
}
