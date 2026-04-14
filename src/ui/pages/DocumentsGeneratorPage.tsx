import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ClipboardCopy,
  Download,
  FileText,
  Loader2,
  Printer,
  Search,
  X,
} from 'lucide-react';

import { generateDocumentDocx } from '@/lib/docGenerator';
import { loadClientsLite } from '@/lib/loadClientsLite';
import { getAuthedUser } from '@/lib/supabaseDb';
import type { ClientLite } from '@/lib/types';
import { cn } from '@/ui/utils/cn';
import { Card } from '@/ui/widgets/Card';

/* ─── template catalogue ─── */

type TemplateField = { key: string; label: string; placeholder: string; mask?: 'money' | 'cpf' | 'date' };

type Template = {
  id: string;
  file: string;
  label: string;
  group: 'Contratos' | 'Procurações' | 'Recibos';
  description: string;
  fields: TemplateField[];
};

const TEMPLATES: Template[] = [
  {
    id: 'contrato-incap',
    file: 'CONTRATO_MODELO_AUX_POR_INCAP_TEMPORARIA.docx',
    label: 'Aux. por Incapacidade Temporária',
    group: 'Contratos',
    description: 'Contrato de honorários para ações de auxílio por incapacidade temporária.',
    fields: [
      { key: 'VALOR', label: 'Valor dos honorários', placeholder: '0,00', mask: 'money' },
      { key: 'DESCRICAO', label: 'Descrição do serviço', placeholder: 'Patrocínio de ação previdenciária…' },
      { key: 'CLAUSULA', label: 'Cláusula adicional', placeholder: '(opcional)' },
    ],
  },
  {
    id: 'contrato-bpc',
    file: 'CONTRATO_MODELO_BPC-LOAS.docx',
    label: 'BPC-LOAS',
    group: 'Contratos',
    description: 'Contrato de honorários para ações de BPC/LOAS junto ao INSS.',
    fields: [
      { key: 'VALOR', label: 'Valor dos honorários', placeholder: '0,00', mask: 'money' },
      { key: 'DESCRICAO', label: 'Descrição do serviço', placeholder: 'Patrocínio de ação de BPC-LOAS…' },
      { key: 'CLAUSULA', label: 'Cláusula adicional', placeholder: '(opcional)' },
    ],
  },
  {
    id: 'contrato-trabalhista',
    file: 'CONTRATO_MODELO_RECLAMAÇÃO_TRABALHISTA.docx',
    label: 'Reclamação Trabalhista',
    group: 'Contratos',
    description: 'Contrato de honorários para reclamatória trabalhista.',
    fields: [
      { key: 'VALOR', label: 'Valor dos honorários', placeholder: '0,00', mask: 'money' },
      { key: 'DESCRICAO', label: 'Descrição do serviço', placeholder: 'Patrocínio de reclamação trabalhista…' },
      { key: 'CLAUSULA', label: 'Cláusula adicional', placeholder: '(opcional)' },
    ],
  },
  {
    id: 'procuracao',
    file: 'PROCURAÇÃO.docx',
    label: 'Procuração',
    group: 'Procurações',
    description: 'Procuração geral com dados completos do outorgante.',
    fields: [
      { key: 'CLAUSULA', label: 'Poderes específicos', placeholder: 'representar em juízo, assinar contratos…' },
    ],
  },
];

const GROUPS = ['Contratos', 'Procurações', 'Recibos'] as const;

/* ─── history (localStorage) ─── */

type HistoryEntry = {
  id: string;
  date: string;
  clientName: string;
  templateLabel: string;
  templateFile: string;
};

const HISTORY_KEY = 'docgen_history_v1';

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as HistoryEntry[];
  } catch {
    return [];
  }
}

function saveHistory(entry: HistoryEntry, prev: HistoryEntry[]): HistoryEntry[] {
  const next = [entry, ...prev].slice(0, 20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

/* ─── money mask ─── */

function applyMoneyMask(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const n = Number(digits) / 100;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

/* ─── placeholder preview builder ─── */

function buildPreview(
  template: Template | null,
  client: ClientLite | null,
  fields: Record<string, string>,
): { html: string; missing: string[] } {
  if (!template || !client) {
    const hasClient = Boolean(client);
    const hasTemplate = Boolean(template);
    const step = (n: number, label: string, done: boolean) =>
      `<li style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #1e293b">
        <span style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:${done ? '#064e3b' : '#0f172a'};border:1.5px solid ${done ? '#34d399' : '#334155'};font-size:10px;font-weight:700;color:${done ? '#34d399' : '#475569'};flex-shrink:0">${done ? '✓' : n}</span>
        <span style="color:${done ? '#34d399' : '#94a3b8'};font-size:13px">${label}</span>
      </li>`;
    return {
      html: `<div style="font-family:system-ui,sans-serif">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#475569;margin-bottom:14px">Guia de preenchimento</div>
        <ul style="list-style:none;padding:0;margin:0">
          ${step(1, 'Selecione um cliente', hasClient)}
          ${step(2, 'Selecione um modelo de documento', hasTemplate)}
          ${step(3, 'Preencha os campos do modelo', false)}
        </ul>
        <p style="margin-top:16px;font-size:11px;color:#334155;font-style:italic">O preview será gerado automaticamente conforme você preenche os dados.</p>
      </div>`,
      missing: [],
    };
  }

  const missing: string[] = [];

  const rows = [
    { label: 'Cliente', value: client.name },
    { label: 'CPF', value: client.cpf || '' },
    { label: 'Telefone', value: client.phone || '' },
    { label: 'Modelo', value: template.label },
    { label: 'Grupo', value: template.group },
    ...template.fields.map((f) => ({ label: f.label, value: fields[f.key] || '' })),
  ];

  for (const f of template.fields) {
    if (!fields[f.key]?.trim()) missing.push(f.label);
  }

  const tableRows = rows
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px 14px;color:#94a3b8;font-size:12px;white-space:nowrap">${r.label}</td>
          <td style="padding:8px 14px;color:${r.value ? '#f1f5f9' : '#f59e0b'};font-weight:500">
            ${r.value || '<em style="color:#f59e0b;font-size:11px">⚠ não preenchido</em>'}
          </td>
        </tr>`,
    )
    .join('');

  const html = `<div style="font-family:Georgia,serif;color:#cbd5e1">
    <div style="border-bottom:1px solid #334155;padding-bottom:12px;margin-bottom:18px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#64748b">Documento</div>
      <div style="font-size:18px;font-weight:700;color:#f1f5f9;margin-top:4px">${template.label}</div>
      <div style="font-size:12px;color:#64748b;margin-top:2px">${template.description}</div>
    </div>
    <table style="width:100%;border-collapse:collapse">
      ${tableRows}
    </table>
    <div style="margin-top:18px;padding-top:12px;border-top:1px solid #1e293b;font-size:11px;color:#475569">
      Preview gerado em ${new Date().toLocaleString('pt-BR')} · ${missing.length === 0 ? '✓ Todos os campos preenchidos' : `⚠ ${missing.length} campo(s) pendente(s)`}
    </div>
  </div>`;

  return { html, missing };
}

/* ─── Toast ─── */

function Toast({ message, type, onDismiss }: { message: string; type: 'success' | 'error'; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className={cn(
        'fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border px-5 py-3 shadow-2xl text-sm font-medium',
        type === 'success'
          ? 'border-emerald-400/30 bg-emerald-950 text-emerald-300'
          : 'border-red-400/30 bg-red-950 text-red-300',
      )}
    >
      {type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
      <span>{message}</span>
      <button onClick={onDismiss} className="ml-2 opacity-60 hover:opacity-100">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ─── ClientSearch ─── */

function ClientSearch({
  clients,
  selected,
  onSelect,
  disabled,
}: {
  clients: ClientLite[];
  selected: ClientLite | null;
  onSelect: (c: ClientLite | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(selected?.name ?? '');
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return clients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.cpf || '').replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
          (c.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '')),
      )
      .slice(0, 10);
  }, [clients, query]);

  function handleSelect(c: ClientLite) {
    setQuery(c.name);
    setOpen(false);
    onSelect(c);
  }

  function handleClear() {
    setQuery('');
    onSelect(null);
    inputRef.current?.focus();
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          placeholder="Buscar por nome, CPF ou telefone…"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (!e.target.value) onSelect(null);
          }}
          onFocus={() => query.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="w-full rounded-xl border border-white/10 bg-neutral-900 pl-9 pr-9 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-amber-400/40 disabled:opacity-60"
        />
        {query && (
          <button onClick={handleClear} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 shadow-2xl">
          {matches.map((c, i) => (
            <button
              key={c.id}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(-1)}
              onClick={() => handleSelect(c)}
              className={cn(
                'flex w-full flex-col items-start px-4 py-2.5 text-left transition',
                hover === i ? 'bg-white/10' : 'hover:bg-white/5',
              )}
            >
              <span className="text-sm font-medium text-white">{c.name}</span>
              <span className="text-[11px] text-white/40">
                {[c.cpf, c.phone].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main page ─── */

export function DocumentsGeneratorPage() {
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [selectedClient, setSelectedClient] = useState<ClientLite | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [expandGroup, setExpandGroup] = useState<string>('Contratos');
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await getAuthedUser();
        const data = await loadClientsLite();
        setClients(data);
      } catch {
        // auth guard handles redirect
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Reset fields when template changes
  useEffect(() => {
    setFields({});
  }, [selectedTemplate?.id]);

  const { html: previewHtml, missing } = useMemo(
    () => buildPreview(selectedTemplate, selectedClient, fields),
    [selectedTemplate, selectedClient, fields],
  );

  function setField(key: string, raw: string, mask?: 'money' | 'cpf' | 'date') {
    const value = mask === 'money' ? applyMoneyMask(raw) : raw;
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function buildDocxData() {
    if (!selectedClient || !selectedTemplate) return null;
    return {
      NOME: selectedClient.name,
      NACIONALIDADE: 'Brasileiro(a)',
      ESTADO_CIVIL: '________',
      PROFISSAO: '________',
      CPF: selectedClient.cpf || '________',
      RG: '________',
      ENDERECO_COMPLETO: '________',
      VALOR: fields['VALOR'] || '________',
      DESCRICAO: fields['DESCRICAO'] || '________',
      CLAUSULA: fields['CLAUSULA'] || '________',
      DATA_ATUAL: new Date().toLocaleDateString('pt-BR'),
    };
  }

  async function handleGenerateDocx() {
    if (!selectedClient || !selectedTemplate) return showToast('Selecione cliente e modelo.', 'error');
    const data = buildDocxData();
    if (!data) return;
    setGenerating(true);
    try {
      await generateDocumentDocx(
        data as Parameters<typeof generateDocumentDocx>[0],
        selectedTemplate.file,
      );
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        clientName: selectedClient.name,
        templateLabel: selectedTemplate.label,
        templateFile: selectedTemplate.file,
      };
      setHistory((prev) => saveHistory(entry, prev));
      showToast('Documento DOCX gerado e baixado!', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Falha ao gerar DOCX.', 'error');
    } finally {
      setGenerating(false);
    }
  }

  function handlePrint() {
    if (!selectedClient || !selectedTemplate) return showToast('Selecione cliente e modelo.', 'error');
    const data = buildDocxData();
    if (!data) return;

    const rows = Object.entries(data)
      .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
      .join('');

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${selectedTemplate.label}</title>
<style>body{font-family:Arial,sans-serif;max-width:720px;margin:40px auto;color:#111}
h1{font-size:1.3rem;margin-bottom:18px}table{width:100%;border-collapse:collapse;margin-bottom:24px}
td,th{border:1px solid #ccc;padding:8px 12px;text-align:left}th{background:#f4f4f4}
@media print{button{display:none}}</style></head>
<body><h1>${selectedTemplate.label} — ${selectedClient.name}</h1>
<table><tr><th>Campo</th><th>Valor</th></tr>${rows}</table>
<p style="color:#666;font-size:.8rem">Gerado em ${new Date().toLocaleString('pt-BR')}</p>
<button onclick="window.print()" style="padding:8px 18px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;cursor:pointer">Imprimir / Salvar PDF</button>
</body></html>`;

    const win = window.open('', '_blank', 'width=800,height=900');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      win.print();
    }
  }

  function handleCopyText() {
    if (!selectedClient || !selectedTemplate) return showToast('Selecione cliente e modelo.', 'error');
    const data = buildDocxData();
    if (!data) return;
    const text = Object.entries(data)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    navigator.clipboard.writeText(text).then(
      () => showToast('Dados copiados para a área de transferência.', 'success'),
      () => showToast('Falha ao copiar.', 'error'),
    );
  }

  async function handleRegenerate(entry: HistoryEntry) {
    try {
      const resp = await fetch(`/templates/${entry.templateFile}`);
      if (!resp.ok) throw new Error('Template indisponível.');
      showToast(`Abra o template "${entry.templateLabel}" e preencha os dados novamente.`, 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erro.', 'error');
    }
  }

  const ready = Boolean(selectedClient && selectedTemplate);

  return (
    <div className="min-h-screen space-y-8 px-4 py-8 md:px-6">
      {/* header */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300/70">Escritório</div>
        <h1 className="mt-1 text-2xl font-bold text-white">Gerador de Documentos</h1>
        <p className="mt-1 text-sm text-white/50">
          Selecione o cliente e o modelo, preencha os campos e gere o documento.
        </p>
      </div>

      {/* action bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => void handleGenerateDocx()}
          disabled={!ready || generating}
          title={!ready ? 'Selecione cliente e modelo' : undefined}
          className={cn(
            'flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
            ready
              ? 'bg-amber-400 text-neutral-950 hover:bg-amber-300 active:scale-95'
              : 'bg-white/10 text-white/40',
          )}
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Gerar DOC
        </button>
        <button
          onClick={handlePrint}
          disabled={!ready}
          title={!ready ? 'Selecione cliente e modelo' : undefined}
          className={cn(
            'flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
            ready
              ? 'border-white/20 bg-white/8 text-white hover:bg-white/15 active:scale-95'
              : 'border-white/8 bg-white/4 text-white/40',
          )}
        >
          <Printer className="h-4 w-4" />
          Imprimir / PDF
        </button>
        <button
          onClick={handleCopyText}
          disabled={!ready}
          title={!ready ? 'Selecione cliente e modelo' : undefined}
          className={cn(
            'flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
            ready
              ? 'border-white/20 bg-white/8 text-white hover:bg-white/15 active:scale-95'
              : 'border-white/8 bg-white/4 text-white/40',
          )}
        >
          <ClipboardCopy className="h-4 w-4" />
          Copiar dados
        </button>
      </div>

      {/* 2-column layout */}
      <div className="grid gap-8 lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_480px]">
        {/* ── LEFT COLUMN: form ── */}
        <div className="space-y-6">

          {/* 1. Cliente */}
          <Card className="relative z-30">
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-full bg-amber-400/10 p-1.5">
                <span className="text-[11px] font-bold text-amber-300">1</span>
              </div>
              <h2 className="text-sm font-semibold text-white">Cliente</h2>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-white/40">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando clientes…
              </div>
            ) : (
              <ClientSearch clients={clients} selected={selectedClient} onSelect={setSelectedClient} />
            )}

            {selectedClient && (
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-white/40">Nome</div>
                  <div className="mt-0.5 text-sm font-medium text-white">{selectedClient.name}</div>
                </div>
                {selectedClient.cpf && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-white/40">CPF</div>
                    <div className="mt-0.5 text-sm font-medium text-white">{selectedClient.cpf}</div>
                  </div>
                )}
                {selectedClient.phone && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-white/40">Telefone</div>
                    <div className="mt-0.5 text-sm font-medium text-white">{selectedClient.phone}</div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* 2. Modelo */}
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <div className="rounded-full bg-amber-400/10 p-1.5">
                <span className="text-[11px] font-bold text-amber-300">2</span>
              </div>
              <h2 className="text-sm font-semibold text-white">Modelo de Documento</h2>
            </div>

            <div className="space-y-3">
              {GROUPS.map((group) => {
                const groupTemplates = TEMPLATES.filter((t) => t.group === group);
                const isOpen = expandGroup === group;

                if (groupTemplates.length === 0) {
                  return (
                    <div key={group} className="rounded-xl border border-dashed border-white/10 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-white/40">{group}</span>
                        <span className="text-[10px] text-white/25">em breve</span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={group} className="overflow-hidden rounded-xl border border-white/10">
                    <button
                      onClick={() => setExpandGroup(isOpen ? '' : group)}
                      className="flex w-full items-center justify-between px-4 py-3 hover:bg-white/5 transition"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-amber-300" />
                        <span className="text-sm font-semibold text-white">{group}</span>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/50">
                          {groupTemplates.length}
                        </span>
                      </div>
                      <ChevronDown className={cn('h-4 w-4 text-white/40 transition-transform', isOpen && 'rotate-180')} />
                    </button>

                    {isOpen && (
                      <div className="border-t border-white/10 px-3 pb-3 pt-2 space-y-2">
                        {groupTemplates.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setSelectedTemplate(t)}
                            className={cn(
                              'w-full rounded-xl border px-4 py-3 text-left transition',
                              selectedTemplate?.id === t.id
                                ? 'border-amber-400/40 bg-amber-400/10'
                                : 'border-white/10 bg-white/5 hover:bg-white/10',
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-sm font-medium text-white">{t.label}</div>
                                <div className="mt-0.5 text-[11px] text-white/45">{t.description}</div>
                              </div>
                              {selectedTemplate?.id === t.id && (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-400" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* 3. Campos dinâmicos */}
          {selectedTemplate && (
            <Card>
              <div className="mb-4 flex items-center gap-2">
                <div className="rounded-full bg-amber-400/10 p-1.5">
                  <span className="text-[11px] font-bold text-amber-300">3</span>
                </div>
                <h2 className="text-sm font-semibold text-white">Campos do Documento</h2>
              </div>

              <div className="space-y-4">
                {selectedTemplate.fields.map((f) => (
                  <div key={f.key}>
                    <label className="mb-1.5 block text-xs font-medium text-white/70">
                      {f.label}
                    </label>
                    <div className="relative">
                      {f.mask === 'money' && (
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/40">
                          R$
                        </span>
                      )}
                      <input
                        type="text"
                        value={fields[f.key] || ''}
                        placeholder={f.placeholder}
                        onChange={(e) => setField(f.key, e.target.value, f.mask)}
                        className={cn(
                          'w-full rounded-xl border border-white/10 bg-neutral-900 py-2.5 text-sm text-white placeholder-white/25 outline-none transition focus:border-amber-400/40',
                          f.mask === 'money' ? 'pl-9 pr-3' : 'px-3',
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {missing.length > 0 && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2.5">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <p className="text-xs text-amber-200/80">
                    Campos pendentes: <strong>{missing.join(', ')}</strong>
                  </p>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* ── RIGHT COLUMN: preview ── */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="flex flex-col overflow-hidden">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Preview em tempo real</h2>
              {ready && missing.length === 0 && (
                <span className="flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" />
                  Pronto
                </span>
              )}
              {ready && missing.length > 0 && (
                <span className="flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-300">
                  <AlertCircle className="h-3 w-3" />
                  {missing.length} pendente(s)
                </span>
              )}
            </div>

            <div
              className="min-h-[340px] rounded-xl border border-white/10 bg-neutral-900/60 p-5 text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </Card>

          {/* quick actions repeat */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => void handleGenerateDocx()}
              disabled={!ready || generating}
              title={!ready ? 'Selecione cliente e modelo' : undefined}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
                ready
                  ? 'bg-amber-400 text-neutral-950 hover:bg-amber-300 active:scale-95'
                  : 'bg-white/10 text-white/40',
              )}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {generating ? 'Gerando…' : 'Gerar DOC'}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handlePrint}
                disabled={!ready}
                title={!ready ? 'Selecione cliente e modelo' : undefined}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50',
                  ready
                    ? 'border-white/20 bg-white/8 text-white/80 hover:bg-white/15 active:scale-95'
                    : 'border-white/8 bg-white/4 text-white/40',
                )}
              >
                <Printer className="h-4 w-4" />
                Imprimir
              </button>
              <button
                onClick={handleCopyText}
                disabled={!ready}
                title={!ready ? 'Selecione cliente e modelo' : undefined}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50',
                  ready
                    ? 'border-white/20 bg-white/8 text-white/80 hover:bg-white/15 active:scale-95'
                    : 'border-white/8 bg-white/4 text-white/40',
                )}
              >
                <ClipboardCopy className="h-4 w-4" />
                Copiar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* history */}
      {history.length > 0 && (
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-white">Últimos documentos gerados</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-white/40">
                  <th className="pb-3 pr-6 font-medium">Data</th>
                  <th className="pb-3 pr-6 font-medium">Cliente</th>
                  <th className="pb-3 pr-6 font-medium">Modelo</th>
                  <th className="pb-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {history.map((e) => (
                  <tr key={e.id} className="border-b border-white/5 text-white/70">
                    <td className="py-3 pr-6 text-xs text-white/40">
                      {new Date(e.date).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3 pr-6">{e.clientName}</td>
                    <td className="py-3 pr-6 text-white/60">{e.templateLabel}</td>
                    <td className="py-3">
                      <button
                        onClick={() => void handleRegenerate(e)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60 transition hover:bg-white/10 hover:text-white"
                      >
                        Regerar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
