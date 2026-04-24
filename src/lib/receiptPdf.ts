// Utilitário para gerar HTML/PDF de recibo
// Pode ser usado tanto no backend (Node) quanto no frontend (window.print)

import jsPDF from 'jspdf';

import type { Receipt } from '@/lib/receipts';
import type { ClientLite } from './types';

function onlyDigits(v: string | null | undefined) {
  return (v || '').replace(/\D/g, '');
}

function formatCpf(v: string | null | undefined) {
  const d = onlyDigits(v);
  if (d.length !== 11) return v || '';
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatDateShort(dateIso: string) {
  return new Date(dateIso).toLocaleDateString('pt-BR');
}

function formatDateLong(dateIso: string) {
  const d = new Date(dateIso);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function getLawyerDocumentText(receipt: Receipt) {
  const raw = (receipt.lawyer_oab || '').trim();
  const digits = onlyDigits(raw);

  if (!raw) return '';
  if (digits.length === 11) {
    return `, inscrito(a) no CPF sob n° ${formatCpf(digits)}`;
  }

  return `, inscrito(a) na OAB sob n° ${raw}`;
}

function buildReceiptNarrative({
  receipt,
  client,
}: {
  receipt: Receipt;
  client: ClientLite | { name: string; cpf?: string | null };
}) {
  const valor = Number(receipt.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const valorExtenso = receipt.amount_written ? `(${receipt.amount_written})` : '';
  const pagamento = receipt.payment_method ? ` por meio de ${receipt.payment_method.toLowerCase()},` : '';

  const advogadoNome = receipt.lawyer_name || 'ADVOGADO(A) RESPONSÁVEL';
  const advogadoDoc = getLawyerDocumentText(receipt);

  const clientCpf = formatCpf((client as ClientLite).cpf || receipt.client?.cpf || '');
  const clientDoc = clientCpf ? `, inscrito(a) no CPF sob o n° ${clientCpf}` : '';

  const dataCurta = formatDateShort(receipt.issued_at);
  const dataLonga = formatDateLong(receipt.issued_at);
  const cidade = receipt.city || 'Cidade não informada';
  const observacao = receipt.description ? ` ${receipt.description}` : '';

  return {
    advogadoNome,
    dataCurta,
    dataLonga,
    cidade,
    textoPrincipal: `Pelo presente, eu ${advogadoNome}${advogadoDoc}, declaro que RECEBI na data de hoje ${dataCurta}, o valor de ${valor}${valorExtenso}${pagamento} de ${client.name}${clientDoc} referente aos Serviços Jurídicos Prestados.${observacao}`,
    textoFecho: 'Sendo expressão de verdade e sem qualquer coação, firmo o presente recibo.',
  };
}

export function buildReceiptHtml({
  receipt,
  client,
}: {
  receipt: Receipt;
  client: ClientLite | { name: string; cpf?: string | null };
  officeName: string;
}): string {
  const narrative = buildReceiptNarrative({ receipt, client });

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Recibo</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 56px; color: #111; font-size: 16px; line-height: 1.6; }
          .title { text-align: center; font-weight: 700; font-size: 28px; margin-bottom: 30px; letter-spacing: .04em; }
          .paragraph { text-align: justify; }
          .location { margin-top: 26px; }
          .signature { margin-top: 44px; text-align: center; }
          .signature-name { margin-top: 8px; font-weight: 700; letter-spacing: .01em; }
        </style>
      </head>
      <body>
        <div class="title">RECIBO</div>
        <p class="paragraph">${narrative.textoPrincipal}</p>
        <p class="paragraph">${narrative.textoFecho}</p>
        <div class="location">${narrative.cidade}, ${narrative.dataLonga}</div>
        <div class="signature">
          <div class="signature-name">${narrative.advogadoNome}</div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Gera um Blob PDF do recibo usando jsPDF (sem dependências externas de CDN).
 * Retorna o Blob pronto para upload no Supabase Storage.
 */
export function buildReceiptPdfBlob({
  receipt,
  client,
}: {
  receipt: Receipt;
  client: { name: string; cpf?: string | null };
  officeName: string;
}): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const narrative = buildReceiptNarrative({ receipt, client });

  const left = 22;
  const width = 166;
  let y = 28;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('RECIBO', 105, y, { align: 'center' });

  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  const principalLines = doc.splitTextToSize(narrative.textoPrincipal, width);
  doc.text(principalLines, left, y, { align: 'justify', maxWidth: width } as any);
  y += principalLines.length * 7;

  y += 4;
  const fechamentoLines = doc.splitTextToSize(narrative.textoFecho, width);
  doc.text(fechamentoLines, left, y, { align: 'justify', maxWidth: width } as any);
  y += fechamentoLines.length * 7;

  y += 10;
  doc.text(`${narrative.cidade}, ${narrative.dataLonga}`, left, y);

  y += 28;
  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.3);
  doc.line(65, y, 145, y);

  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(narrative.advogadoNome, 105, y, { align: 'center' });

  return doc.output('blob');
}
