import type { DocumentTemplate } from './documentData';

// Exact slots of the supplied models, verified with fictitious contexts and full-page review.
export const APPROVED_CONTRACT_TEMPLATES: DocumentTemplate[] = [
  {
    "id": "contrato_salario_maternidade",
    "file": "contrato_salario_maternidade.docx",
    "label": "Contrato de salário-maternidade",
    "group": "Contratos",
    "description": "30% sobre o valor bruto total, conforme o modelo enviado.",
    "availability": "ready",
    "fields": [
      {
        "key": "NOME",
        "label": "Nome completo do cliente",
        "placeholder": "Confirme o nome completo",
        "required": true
      },
      {
        "key": "NACIONALIDADE",
        "label": "Nacionalidade do cliente",
        "placeholder": "Informe, por exemplo, brasileira ou brasileiro",
        "required": true
      },
      {
        "key": "CPF",
        "label": "CPF do cliente",
        "placeholder": "Confirme o CPF",
        "required": true
      },
      {
        "key": "RG",
        "label": "RG do cliente",
        "placeholder": "Informe o RG",
        "required": true
      },
      {
        "key": "ENDERECO",
        "label": "Endereço completo do cliente",
        "placeholder": "Informe logradouro, número, bairro, cidade e UF",
        "required": true
      }
    ]
  },
  {
    "id": "contrato_aposentadorias",
    "file": "contrato_aposentadorias.docx",
    "label": "Contrato de aposentadorias",
    "group": "Contratos",
    "description": "8 salários mínimos da época da concessão e 30% dos retroativos, conforme o modelo enviado.",
    "availability": "ready",
    "fields": [
      {
        "key": "NOME",
        "label": "Nome completo do cliente",
        "placeholder": "Confirme o nome completo",
        "required": true
      },
      {
        "key": "NACIONALIDADE",
        "label": "Nacionalidade do cliente",
        "placeholder": "Informe, por exemplo, brasileira ou brasileiro",
        "required": true
      },
      {
        "key": "CPF",
        "label": "CPF do cliente",
        "placeholder": "Confirme o CPF",
        "required": true
      },
      {
        "key": "RG",
        "label": "RG do cliente",
        "placeholder": "Informe o RG",
        "required": true
      },
      {
        "key": "ENDERECO",
        "label": "Endereço completo do cliente",
        "placeholder": "Informe logradouro, número, bairro, cidade e UF",
        "required": true
      }
    ]
  },
  {
    "id": "contrato_revisao_aposentadoria",
    "file": "contrato_revisao_aposentadoria.docx",
    "label": "Contrato de revisão de aposentadoria",
    "group": "Contratos",
    "description": "30% sobre o valor bruto total, conforme o modelo enviado.",
    "availability": "ready",
    "fields": [
      {
        "key": "NOME",
        "label": "Nome completo do cliente",
        "placeholder": "Confirme o nome completo",
        "required": true
      },
      {
        "key": "NACIONALIDADE",
        "label": "Nacionalidade do cliente",
        "placeholder": "Informe, por exemplo, brasileira ou brasileiro",
        "required": true
      },
      {
        "key": "CPF",
        "label": "CPF do cliente",
        "placeholder": "Confirme o CPF",
        "required": true
      },
      {
        "key": "ENDERECO",
        "label": "Endereço completo do cliente",
        "placeholder": "Informe logradouro, número, bairro, cidade e UF",
        "required": true
      }
    ]
  },
  {
    "id": "contrato_auxilio_acidente",
    "file": "contrato_auxilio_acidente.docx",
    "label": "Contrato de auxílio-acidente",
    "group": "Contratos",
    "description": "6 benefícios da época da concessão e 30% dos retroativos, conforme o modelo enviado.",
    "availability": "ready",
    "fields": [
      {
        "key": "NOME",
        "label": "Nome completo do cliente",
        "placeholder": "Confirme o nome completo",
        "required": true
      },
      {
        "key": "NACIONALIDADE",
        "label": "Nacionalidade do cliente",
        "placeholder": "Informe, por exemplo, brasileira ou brasileiro",
        "required": true
      },
      {
        "key": "CPF",
        "label": "CPF do cliente",
        "placeholder": "Confirme o CPF",
        "required": true
      },
      {
        "key": "RG",
        "label": "RG do cliente",
        "placeholder": "Informe o RG",
        "required": true
      },
      {
        "key": "ENDERECO",
        "label": "Endereço completo do cliente",
        "placeholder": "Informe logradouro, número, bairro, cidade e UF",
        "required": true
      }
    ]
  },
  {
    "id": "contrato_alimentos",
    "file": "contrato_alimentos.docx",
    "label": "Contrato de alimentos",
    "group": "Contratos",
    "description": "Honorários de R$ 4.000,00, conforme o modelo enviado.",
    "availability": "ready",
    "fields": [
      {
        "key": "NOME",
        "label": "Nome completo do cliente",
        "placeholder": "Confirme o nome completo",
        "required": true
      },
      {
        "key": "NACIONALIDADE",
        "label": "Nacionalidade do cliente",
        "placeholder": "Informe, por exemplo, brasileira ou brasileiro",
        "required": true
      },
      {
        "key": "CPF",
        "label": "CPF do cliente",
        "placeholder": "Confirme o CPF",
        "required": true
      },
      {
        "key": "RG",
        "label": "RG do cliente",
        "placeholder": "Informe o RG",
        "required": true
      },
      {
        "key": "ENDERECO",
        "label": "Endereço completo do cliente",
        "placeholder": "Informe logradouro, número, bairro, cidade e UF",
        "required": true
      }
    ]
  },
  {
    "id": "contrato_divorcio",
    "file": "contrato_divorcio.docx",
    "label": "Contrato de divórcio",
    "group": "Contratos",
    "description": "Honorários de R$ 4.000,00, conforme o modelo enviado.",
    "availability": "ready",
    "fields": [
      {
        "key": "NOME",
        "label": "Nome completo do cliente",
        "placeholder": "Confirme o nome completo",
        "required": true
      },
      {
        "key": "NACIONALIDADE",
        "label": "Nacionalidade do cliente",
        "placeholder": "Informe, por exemplo, brasileira ou brasileiro",
        "required": true
      },
      {
        "key": "CPF",
        "label": "CPF do cliente",
        "placeholder": "Confirme o CPF",
        "required": true
      },
      {
        "key": "RG",
        "label": "RG do cliente",
        "placeholder": "Informe o RG",
        "required": true
      },
      {
        "key": "ENDERECO",
        "label": "Endereço completo do cliente",
        "placeholder": "Informe logradouro, número, bairro, cidade e UF",
        "required": true
      }
    ]
  }
];
