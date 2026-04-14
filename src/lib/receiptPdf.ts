// Utilitário para gerar HTML de recibo para PDF
// Pode ser usado tanto no backend (Node) quanto no frontend (window.print)

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
