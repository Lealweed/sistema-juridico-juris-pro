// Utilitário para gerar HTML/PDF de recibo
// Pode ser usado tanto no backend (Node) quanto no frontend (window.print)

import jsPDF from 'jspdf';

import type { Receipt } from '@/lib/receipts';
import type { ClientLite } from './types';

export function buildReceiptHtml({
  receipt,
  client,
  officeName,
}: {
  receipt: Receipt;
  client: ClientLite | { name: string; cpf?: string | null };
  officeName: string;
}): string {
  const valor = Number(receipt.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const clientCpf = (client as ClientLite).cpf || receipt.client?.cpf || '';
  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Recibo de Honorários</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; color: #222; }
          .recibo-box { border: 2px solid #222; border-radius: 12px; padding: 32px; max-width: 560px; margin: 0 auto; }
          .recibo-title { font-size: 1.5em; font-weight: bold; margin-bottom: 8px; text-align: center; letter-spacing: .08em; }
          .recibo-subtitle { font-size: .85em; color: #555; text-align: center; margin-bottom: 24px; }
          .recibo-valor { font-size: 1.2em; font-weight: bold; text-align: center; background: #f4f4f4; border-radius: 8px; padding: 12px; margin-bottom: 20px; }
          .recibo-info { margin-bottom: 10px; }
          .recibo-label { font-weight: bold; }
          .recibo-assinatura { margin-top: 48px; border-top: 1px solid #aaa; padding-top: 8px; text-align: center; font-size: .88em; color: #555; }
          .recibo-footer { margin-top: 16px; text-align: right; font-size: 0.8em; color: #999; }
        </style>
      </head>
      <body>
        <div class="recibo-box">
          <div class="recibo-title">${officeName}</div>
          <div class="recibo-subtitle">RECIBO DE HONORÁRIOS</div>
          <div class="recibo-valor">${valor}</div>
          ${receipt.amount_written ? `<div class="recibo-info"><span class="recibo-label">Por extenso:</span> ${receipt.amount_written}</div>` : ''}
          <div class="recibo-info"><span class="recibo-label">Recebi de:</span> ${client.name}${clientCpf ? ` (CPF: ${clientCpf})` : ''}</div>
          <div class="recibo-info"><span class="recibo-label">Referente a:</span> ${receipt.description || '—'}</div>
          ${receipt.payment_method ? `<div class="recibo-info"><span class="recibo-label">Forma de pagamento:</span> ${receipt.payment_method}</div>` : ''}
          <div class="recibo-info"><span class="recibo-label">Data de emissão:</span> ${new Date(receipt.issued_at).toLocaleDateString('pt-BR')}</div>
          ${receipt.city ? `<div class="recibo-info"><span class="recibo-label">Cidade:</span> ${receipt.city}</div>` : ''}
          <div class="recibo-assinatura">
            ${receipt.lawyer_name || 'Advogado(a)'}<br/>
            ${receipt.lawyer_oab ? `OAB ${receipt.lawyer_oab}` : ''}
          </div>
          <div class="recibo-footer">N° ${receipt.id.slice(0, 8).toUpperCase()} — ${officeName}</div>
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
  officeName,
}: {
  receipt: Receipt;
  client: { name: string; cpf?: string | null };
  officeName: string;
}): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const W = 210;
  const ML = 20;

  // Header band
  doc.setFillColor(15, 15, 20);
  doc.rect(0, 0, W, 40, 'F');
  doc.setFillColor(180, 140, 60);
  doc.rect(0, 40, W, 1, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(200, 175, 120);
  doc.text(officeName, W / 2, 18, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(160, 160, 160);
  doc.text('RECIBO DE HONORÁRIOS', W / 2, 27, { align: 'center' });

  // Valor em destaque
  const valor = Number(receipt.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  doc.setFillColor(245, 245, 240);
  doc.roundedRect(ML, 46, W - 2 * ML, 14, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  doc.text(valor, W / 2, 55, { align: 'center' });

  // Content rows
  const clientCpf = client.cpf ? ` (CPF: ${client.cpf})` : '';
  const rows: [string, string][] = [
    ['Recebi de', `${client.name}${clientCpf}`],
    ...(receipt.amount_written ? [['Por extenso', receipt.amount_written] as [string, string]] : []),
    ['Referente a', receipt.description || '—'],
    ...(receipt.payment_method ? [['Forma de pagamento', receipt.payment_method] as [string, string]] : []),
    ['Data de emissão', new Date(receipt.issued_at).toLocaleDateString('pt-BR')],
    ...(receipt.city ? [['Cidade', receipt.city] as [string, string]] : []),
    ['N° do recibo', receipt.id.slice(0, 8).toUpperCase()],
  ];

  let y = 72;
  doc.setFontSize(10);

  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text(`${label}:`, ML, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    const lines = doc.splitTextToSize(value, W - ML - 50);
    doc.text(lines, ML + 48, y);
    y += (lines.length > 1 ? lines.length * 6 : 9);
  }

  // Assinatura
  y += 20;
  doc.setDrawColor(180, 140, 60);
  doc.setLineWidth(0.4);
  doc.line(W / 2 - 40, y, W / 2 + 40, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  if (receipt.lawyer_name) {
    doc.text(receipt.lawyer_name, W / 2, y, { align: 'center' });
    y += 5;
  }
  if (receipt.lawyer_oab) {
    doc.text(`OAB ${receipt.lawyer_oab}`, W / 2, y, { align: 'center' });
    y += 5;
  }

  // Footer
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(
    `Emitido em ${new Date().toLocaleString('pt-BR')} — ${officeName}`,
    W / 2,
    285,
    { align: 'center' },
  );

  return doc.output('blob');
}
