export type ClientMock = {
  id: string;
  name: string;
  kind: 'Pessoa' | 'Empresa';
  status: 'Ativo' | 'Em negociação' | 'Inativo';
  source: string;
  lastContact: string;
  cases: string[];
  messages: Array<{ when: string; text: string }>;
};

export const clientsMock: ClientMock[] = [
  {
    id: 'c1',
    name: 'Ana Souza',
    kind: 'Pessoa',
    status: 'Em negociação',
    source: 'Indicação',
    lastContact: 'há 2 dias',
    cases: ['Ação trabalhista • 0001234-56.2025.8.26.0100'],
    messages: [
      { when: 'Hoje 08:10', text: 'Enviei os documentos. Você consegue validar?' },
      { when: 'Ontem 16:22', text: 'Perfeito, vamos avançar com a proposta.' },
    ],
  },
  {
    id: 'c2',
    name: 'Empresa Alfa LTDA',
    kind: 'Empresa',
    status: 'Ativo',
    source: 'Google',
    lastContact: 'há 6 dias',
    cases: ['Cobrança • 0007788-11.2024.8.26.0100', 'Contrato • Revisão anual'],
    messages: [{ when: '03/02 11:40', text: 'Podem enviar a minuta do aditivo?' }],
  },
  {
    id: 'c3',
    name: 'Carlos Lima',
    kind: 'Pessoa',
    status: 'Ativo',
    source: 'WhatsApp',
    lastContact: 'hoje',
    cases: ['Consumidor • Negativação indevida'],
    messages: [{ when: 'Hoje 10:01', text: 'Tenho urgência, consigo atendimento hoje?' }],
  },
];
