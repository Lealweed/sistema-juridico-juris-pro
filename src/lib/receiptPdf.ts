// Utilitário para gerar HTML/PDF de recibo

import jsPDF from 'jspdf';

import type { Receipt } from '@/lib/receipts';
import type { ClientLite } from './types';

const BRAND_LOGO_URL = '/brand/logo.jpg';

function onlyDigits(v: string | null | undefined) {
  return (v || '').replace(/\D/g, '');
}

function escapeHtml(v: string | null | undefined) {
  return (v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function normalizeObservation(v: string | null | undefined) {
  const text = (v || '').trim();
  if (!text) return '';
  if (text.startsWith('(') && text.endsWith(')')) return text;
  return `(${text})`;
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
  const pagamento = receipt.payment_method ? `, por meio de ${receipt.payment_method.toLowerCase()},` : ',';

  const advogadoNome = (receipt.lawyer_name || 'ADVOGADO(A) RESPONSÁVEL').trim();
  const advogadoDoc = getLawyerDocumentText(receipt);

  const clienteNome = (client.name || 'CLIENTE').trim();
  const clientCpf = formatCpf((client as ClientLite).cpf || receipt.client?.cpf || '');
  const clientDoc = clientCpf ? `, inscrito(a) no CPF sob o n° ${clientCpf}` : '';

  const dataCurta = formatDateShort(receipt.issued_at);
  const dataLonga = formatDateLong(receipt.issued_at);
  const cidade = receipt.city || 'Cidade não informada';
  const observacao = normalizeObservation(receipt.description);

  return {
    advogadoNome,
    clienteNome,
    clientCpf,
    valor,
    valorExtenso,
    pagamento,
    dataCurta,
    dataLonga,
    cidade,
    observacao,
    textoPrincipal: `Pelo presente, eu ${advogadoNome}${advogadoDoc}, declaro que RECEBI na data de hoje ${dataCurta}, o valor de ${valor}${valorExtenso}${pagamento} de ${clienteNome}${clientDoc} referente aos Serviços Jurídicos Prestados.`,
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
  const n = buildReceiptNarrative({ receipt, client });

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Recibo</title>
        <style>
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: #efefef; }
          body { font-family: 'Times New Roman', serif; color: #111; }
          .page {
            width: 794px;
            min-height: 1123px;
            margin: 0 auto;
            background: #f7f7f7;
            position: relative;
            overflow: hidden;
            border: 1px solid #e0e0e0;
          }
          .header {
            height: 170px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .header img { width: 260px; height: auto; object-fit: contain; }
          .title {
            text-align: center;
            font-size: 48px;
            margin: 0;
            letter-spacing: .04em;
            font-weight: 700;
          }
          .content {
            margin: 24px 54px 0;
            border: 1px solid #d6d6d6;
            background: #f2f2f2;
            min-height: 735px;
            position: relative;
            padding: 34px 34px 120px;
          }
          .watermark {
            position: absolute;
            inset: 60px 100px 110px;
            background: url('${BRAND_LOGO_URL}') center/70% no-repeat;
            opacity: .08;
            pointer-events: none;
          }
          .title-bar {
            text-align: center;
            font-size: 44px;
            margin: 0 0 14px;
            font-weight: 700;
          }
          .p {
            position: relative;
            z-index: 2;
            font-size: 17px;
            line-height: 1.55;
            text-align: justify;
            margin: 0;
          }
          .obs {
            position: relative;
            z-index: 2;
            text-align: center;
            font-size: 17px;
            margin-top: 24px;
          }
          .closure { margin-top: 120px; }
          .location {
            margin-top: 74px;
            text-align: right;
            font-size: 40px;
          }
          .footer {
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
            height: 96px;
            background: #0a1633;
            color: #fff;
            border-top: 4px solid #b9974f;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 26px;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 14px;
          }
          .footer small { display: block; font-size: 12px; opacity: .9; margin-top: 2px; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header"><img src="${BRAND_LOGO_URL}" alt="Logo" /></div>
          <div class="content">
            <div class="watermark"></div>
            <h1 class="title-bar">RECIBO</h1>
            <p class="p">
              Pelo presente, eu <strong>${escapeHtml(n.advogadoNome.toUpperCase())}</strong>${escapeHtml(getLawyerDocumentText(receipt))},
              declaro que <strong>RECEBI</strong> na data de hoje ${escapeHtml(n.dataCurta)}, o valor de
              ${escapeHtml(n.valor)}${escapeHtml(n.valorExtenso)}${escapeHtml(n.pagamento)}
              de <strong>${escapeHtml(n.clienteNome.toUpperCase())}</strong>${n.clientCpf ? `, inscrito(a) no CPF sob o n° ${escapeHtml(n.clientCpf)}` : ''}
              referente aos Serviços Jurídicos Prestados.
            </p>
            ${n.observacao ? `<div class="obs">${escapeHtml(n.observacao)}</div>` : ''}
            <p class="p closure">${escapeHtml(n.textoFecho)}</p>
            <div class="location">${escapeHtml(n.cidade)}, ${escapeHtml(n.dataLonga)}</div>
          </div>

          <div class="footer">
            <div>
              <div>JOSÉ LOPES DA SILVA FILHO</div>
              <small>OAB/PA n° 36.029</small>
            </div>
            <div>
              <div>${escapeHtml(n.advogadoNome.toUpperCase())}</div>
              <small>${escapeHtml((receipt.lawyer_oab || '').trim() ? `OAB/PA n° ${receipt.lawyer_oab}` : '')}</small>
            </div>
            <div style="text-align:right;">
              <div>@bldadvogados</div>
              <small>(94) 9 9212-3917</small>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onloadend = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Gera um Blob PDF do recibo usando jsPDF.
 */
export async function buildReceiptPdfBlob({
  receipt,
  client,
}: {
  receipt: Receipt;
  client: { name: string; cpf?: string | null };
  officeName: string;
}): Promise<Blob> {
  const n = buildReceiptNarrative({ receipt, client });
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = 210;
  const left = 18;
  const width = pageW - (left * 2);

  // Header com logo
  const logoDataUrl = await urlToDataUrl(BRAND_LOGO_URL);
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'JPEG', 58, 10, 94, 24);
  }

  // Caixa principal
  doc.setDrawColor(210, 210, 210);
  doc.setFillColor(242, 242, 242);
  doc.rect(left, 40, width, 210, 'FD');

  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.text('RECIBO', pageW / 2, 47, { align: 'center' });

  doc.setFont('times', 'normal');
  doc.setFontSize(12);
  const textoPrincipal = `Pelo presente, eu ${n.advogadoNome.toUpperCase()}${getLawyerDocumentText(receipt)}, declaro que RECEBI na data de hoje ${n.dataCurta}, o valor de ${n.valor}${n.valorExtenso}${n.pagamento} de ${n.clienteNome.toUpperCase()}${n.clientCpf ? `, inscrito(a) no CPF sob o n° ${n.clientCpf}` : ''} referente aos Serviços Jurídicos Prestados.`;
  const pLines = doc.splitTextToSize(textoPrincipal, width - 16);
  doc.text(pLines, left + 8, 62);

  let y = 62 + (pLines.length * 6);
  if (n.observacao) {
    y += 10;
    doc.text(n.observacao, pageW / 2, y, { align: 'center' });
  }

  y += 40;
  doc.text(n.textoFecho, pageW / 2, y, { align: 'center' });

  y += 30;
  doc.text(`${n.cidade}, ${n.dataLonga}`, pageW - 24, y, { align: 'right' });

  // Rodapé
  doc.setFillColor(10, 22, 51);
  doc.rect(0, 284, pageW, 13, 'F');
  doc.setFillColor(185, 151, 79);
  doc.rect(0, 282.5, pageW, 1.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('JOSÉ LOPES DA SILVA FILHO', 21, 288.8);
  doc.text('OAB/PA n° 36.029', 21, 292.1);
  doc.text(n.advogadoNome.toUpperCase(), 75, 288.8);
  doc.text(receipt.lawyer_oab ? `OAB/PA n° ${receipt.lawyer_oab}` : '', 75, 292.1);
  doc.text('@bldadvogados', 145, 288.8);
  doc.text('(94) 9 9212-3917', 172, 288.8);

  return doc.output('blob');
}
