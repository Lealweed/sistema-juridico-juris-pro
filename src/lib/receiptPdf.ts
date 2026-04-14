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
  client: ClientLite;
  officeName: string;
}): string {
  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Recibo ${receipt.id}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; color: #222; }
          .recibo-box { border: 2px solid #222; border-radius: 12px; padding: 32px; max-width: 500px; margin: 0 auto; }
          .recibo-title { font-size: 1.5em; font-weight: bold; margin-bottom: 24px; text-align: center; }
          .recibo-info { margin-bottom: 16px; }
          .recibo-label { font-weight: bold; }
          .recibo-footer { margin-top: 32px; text-align: right; font-size: 0.95em; color: #666; }
        </style>
      </head>
      <body>
        <div class="recibo-box">
          <div class="recibo-title">Recibo</div>
          <div class="recibo-info"><span class="recibo-label">Cliente:</span> ${client.name}</div>
          <div class="recibo-info"><span class="recibo-label">Valor:</span> R$ ${Number(receipt.amount).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
          <div class="recibo-info"><span class="recibo-label">Descrição:</span> ${receipt.description || '-'}</div>
          <div class="recibo-info"><span class="recibo-label">Data de emissão:</span> ${new Date(receipt.issued_at).toLocaleDateString('pt-BR')}</div>
          <div class="recibo-info"><span class="recibo-label">Status:</span> ${receipt.status}</div>
          <div class="recibo-footer">${officeName}</div>
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
  client: { name: string };
  officeName: string;
}): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const W = 210;
  const ML = 20;

  // Header
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
  doc.text('Documento emitido eletronicamente', W / 2, 27, { align: 'center' });

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 30);
  doc.text('RECIBO', W / 2, 54, { align: 'center' });

  // Content
  const rows: [string, string][] = [
    ['Cliente', client.name],
    ['Valor', Number(receipt.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })],
    ['Descrição', receipt.description || '—'],
    ['Data de emissão', new Date(receipt.issued_at).toLocaleDateString('pt-BR')],
    ['Status', receipt.status],
    ['N° do recibo', receipt.id.slice(0, 8).toUpperCase()],
  ];

  let y = 66;
  doc.setFontSize(10);

  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text(`${label}:`, ML, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    doc.text(value, ML + 42, y);
    y += 9;
  }

  // Separator
  doc.setDrawColor(200, 175, 120);
  doc.setLineWidth(0.4);
  doc.line(ML, y + 4, W - ML, y + 4);

  // Footer
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(
    `Emitido em ${new Date().toLocaleString('pt-BR')} — ${officeName}`,
    W / 2,
    y + 12,
    { align: 'center' },
  );

  return doc.output('blob');
}
