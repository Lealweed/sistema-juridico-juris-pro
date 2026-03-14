import jsPDF from 'jspdf';

/* ── Tipos ── */
export interface DossierClientData {
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface DossierCaseData {
  title: string;
  status: string;
  process_number?: string | null;
  area?: string | null;
}

export interface DossierFinanceData {
  totalReceitas?: number;
  totalDespesas?: number;
  saldo?: number;
}

/* ── Helpers ── */
const MARGIN_LEFT = 20;
const PAGE_WIDTH = 210; // A4 mm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT * 2;
const LINE_HEIGHT = 7;

function addPageIfNeeded(doc: jsPDF, y: number, needed = 30): number {
  if (y + needed > 280) {
    doc.addPage();
    return 20;
  }
  return y;
}

function drawSeparator(doc: jsPDF, y: number): number {
  doc.setDrawColor(200, 175, 120);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_LEFT, y);
  return y + 6;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

/* ── Gerador principal ── */
export function generateClientDossier(
  clientData: DossierClientData,
  casesData: DossierCaseData[],
  financeData?: DossierFinanceData | null,
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  let y = 20;

  /* ─── Cabeçalho / Logo ─── */
  doc.setFillColor(15, 15, 20);
  doc.rect(0, 0, PAGE_WIDTH, 50, 'F');

  // Faixa dourada decorativa
  doc.setFillColor(200, 175, 120);
  doc.rect(0, 50, PAGE_WIDTH, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(200, 175, 120);
  doc.text('Lima, Lopes & Diógenes', PAGE_WIDTH / 2, 25, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(180, 180, 180);
  doc.text('Advogados Associados', PAGE_WIDTH / 2, 32, { align: 'center' });

  doc.setFontSize(9);
  doc.setTextColor(140, 140, 140);
  doc.text('DOSSIÊ DO CLIENTE', PAGE_WIDTH / 2, 42, { align: 'center' });

  y = 60;

  /* ─── Data de emissão ─── */
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Emitido em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    PAGE_WIDTH - MARGIN_LEFT,
    y,
    { align: 'right' },
  );
  y += 10;

  /* ─── Seção: Dados do Cliente ─── */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text('Dados do Cliente', MARGIN_LEFT, y);
  y += 3;
  y = drawSeparator(doc, y);

  const fields: [string, string][] = [
    ['Nome', clientData.name],
    ['Telefone', clientData.phone || '—'],
    ['WhatsApp', clientData.whatsapp || '—'],
    ['E-mail', clientData.email || '—'],
    ['Cadastro', clientData.created_at ? formatDate(clientData.created_at) : '—'],
  ];

  doc.setFontSize(10);
  for (const [label, value] of fields) {
    y = addPageIfNeeded(doc, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text(`${label}:`, MARGIN_LEFT, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    doc.text(value, MARGIN_LEFT + 35, y);
    y += LINE_HEIGHT;
  }

  if (clientData.notes) {
    y += 2;
    y = addPageIfNeeded(doc, y, 20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text('Observações:', MARGIN_LEFT, y);
    y += LINE_HEIGHT;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    const cleaned = clientData.notes.replace(/\[#origem:[^\]]+\]\s*/gi, '').trim();
    const lines = doc.splitTextToSize(cleaned, CONTENT_WIDTH);
    for (const line of lines) {
      y = addPageIfNeeded(doc, y);
      doc.text(line, MARGIN_LEFT, y);
      y += LINE_HEIGHT - 1;
    }
  }

  y += 8;

  /* ─── Seção: Processos / Casos ─── */
  y = addPageIfNeeded(doc, y, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text('Processos Ativos', MARGIN_LEFT, y);
  y += 3;
  y = drawSeparator(doc, y);

  if (casesData.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text('Nenhum processo vinculado.', MARGIN_LEFT, y);
    y += LINE_HEIGHT;
  } else {
    doc.setFontSize(10);
    for (let i = 0; i < casesData.length; i++) {
      const c = casesData[i];
      y = addPageIfNeeded(doc, y, 22);

      // Fundo alternado
      if (i % 2 === 0) {
        doc.setFillColor(245, 245, 245);
        doc.rect(MARGIN_LEFT - 2, y - 4, CONTENT_WIDTH + 4, 18, 'F');
      }

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text(`${i + 1}. ${c.title}`, MARGIN_LEFT, y);
      y += LINE_HEIGHT;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.setFontSize(9);
      const details = [
        `Status: ${c.status}`,
        c.process_number ? `CNJ: ${c.process_number}` : null,
        c.area ? `Área: ${c.area}` : null,
      ]
        .filter(Boolean)
        .join('  ·  ');
      doc.text(details, MARGIN_LEFT + 4, y);
      doc.setFontSize(10);
      y += LINE_HEIGHT + 3;
    }
  }

  y += 6;

  /* ─── Seção: Resumo Financeiro ─── */
  y = addPageIfNeeded(doc, y, 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text('Resumo Financeiro', MARGIN_LEFT, y);
  y += 3;
  y = drawSeparator(doc, y);

  if (!financeData) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text('Dados financeiros não disponíveis.', MARGIN_LEFT, y);
    y += LINE_HEIGHT;
  } else {
    doc.setFontSize(10);
    const fRows: [string, string][] = [
      ['Total Receitas', formatCurrency(financeData.totalReceitas ?? 0)],
      ['Total Despesas', formatCurrency(financeData.totalDespesas ?? 0)],
      ['Saldo', formatCurrency(financeData.saldo ?? 0)],
    ];
    for (const [label, value] of fRows) {
      y = addPageIfNeeded(doc, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(80, 80, 80);
      doc.text(`${label}:`, MARGIN_LEFT, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 30);
      doc.text(value, MARGIN_LEFT + 45, y);
      y += LINE_HEIGHT;
    }
  }

  /* ─── Rodapé ─── */
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFillColor(15, 15, 20);
    doc.rect(0, 287, PAGE_WIDTH, 10, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text(
      'Lima, Lopes & Diógenes Advogados Associados · Belém — PA · Documento confidencial',
      PAGE_WIDTH / 2,
      293,
      { align: 'center' },
    );
    doc.text(`Pág. ${p}/${pageCount}`, PAGE_WIDTH - MARGIN_LEFT, 293, { align: 'right' });
  }

  /* ─── Download ─── */
  const safeName = clientData.name.replace(/[^a-zA-Z0-9À-ÿ\s]/g, '').trim().replace(/\s+/g, '_');
  doc.save(`Dossie_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
