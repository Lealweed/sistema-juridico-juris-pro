import { useNavigate, useSearchParams } from 'react-router-dom';
import { escapeHtml } from '@/lib/documentSafeHtml';
import { letterheadBodyStart, letterheadBodyEnd, letterheadPrintStyles } from '@/lib/documentPrintLayout';
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
  Receipt,
  Search,
  X,
} from 'lucide-react';

import { generateDocumentDocx, resolveTemplateAssetName } from '@/lib/documentDocxGenerator';
import { DOCUMENT_TEMPLATES as TEMPLATES, assertDocumentTemplateAvailable, getMissingDocumentFields, initialDocumentFields, isDocumentTemplateAvailable, prepareDocumentData, type DocumentTemplate as Template } from '@/lib/documentData';
import { findRequestedDocumentClient } from '@/lib/documentClientSelection';
import { requireSupabase } from '@/lib/supabaseDb';
import { getDocumentOfficeContext, loadDocumentClients } from '@/lib/documentScopedAccess';
import { appendDocumentHistory, documentHistoryKey, readDocumentHistory, type DocumentHistoryContext, type DocumentHistoryEntry as HistoryEntry } from '@/lib/documentHistory';
import type { ClientLite } from '@/lib/types';
import { cn } from '@/ui/utils/cn';
import { Card } from '@/ui/widgets/Card';

/* ─── template catalogue ─── */

const GROUPS = ['Contratos', 'Procurações', 'Recibos'] as const;

/* ─── history (localStorage) ─── */

function getHistoryStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
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
      `<li style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--workspace-preview-border, #1e293b)">
        <span style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:${done ? 'var(--workspace-preview-success-bg, #064e3b)' : 'var(--workspace-preview-step-bg, #0f172a)'};border:1.5px solid ${done ? 'var(--workspace-preview-success, #34d399)' : 'var(--workspace-preview-border, #334155)'};font-size:10px;font-weight:700;color:${done ? 'var(--workspace-preview-success, #34d399)' : 'var(--workspace-preview-hint, #475569)'};flex-shrink:0">${done ? '✓' : n}</span>
        <span style="color:${done ? 'var(--workspace-preview-success, #34d399)' : 'var(--workspace-preview-muted, #94a3b8)'};font-size:13px">${label}</span>
      </li>`;
    return {
      html: `<div style="font-family:system-ui,sans-serif">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--workspace-preview-hint, #475569);margin-bottom:14px">Guia de preenchimento</div>
        <ul style="list-style:none;padding:0;margin:0">
          ${step(1, 'Selecione um cliente', hasClient)}
          ${step(2, 'Selecione um modelo de documento', hasTemplate)}
          ${step(3, 'Preencha os campos do modelo', false)}
        </ul>
        <p style="margin-top:16px;font-size:11px;color:var(--workspace-preview-hint, #334155);font-style:italic">O resumo será gerado automaticamente conforme você preenche os dados.</p>
      </div>`,
      missing: [],
    };
  }

  const missing: string[] = [];

  const rows = [
    { label: 'Cliente', value: client.name },
    ...(client.phone ? [{ label: 'Telefone', value: client.phone }] : []),
    { label: 'Modelo', value: template.label },
    { label: 'Grupo', value: template.group },
    ...template.fields.map((f) => ({ label: f.label, value: fields[f.key] || '' })),
  ];

  missing.push(...getMissingDocumentFields({ NOME: client.name, ...fields }, template.file));

  const tableRows = rows
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px 14px;color:var(--workspace-preview-muted, #94a3b8);font-size:12px;white-space:nowrap">${escapeHtml(r.label)}</td>
          <td style="padding:8px 14px;color:${r.value ? 'var(--workspace-preview-strong, #f1f5f9)' : 'var(--workspace-preview-pending, #f59e0b)'};font-weight:500">
            ${r.value ? escapeHtml(r.value) : '<em style="color:var(--workspace-preview-pending, #f59e0b);font-size:11px">⚠ não preenchido</em>'}
          </td>
        </tr>`,
    )
    .join('');

  const html = `<div style="font-family:Georgia,serif;color:var(--workspace-preview-text, #cbd5e1)">
    <div style="border-bottom:1px solid var(--workspace-preview-border, #334155);padding-bottom:12px;margin-bottom:18px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:var(--workspace-preview-subtle, #64748b)">Documento</div>
      <div style="font-size:18px;font-weight:700;color:var(--workspace-preview-strong, #f1f5f9);margin-top:4px">${escapeHtml(template.label)}</div>
      <div style="font-size:12px;color:var(--workspace-preview-subtle, #64748b);margin-top:2px">${escapeHtml(template.description)}</div>
    </div>
    <table style="width:100%;border-collapse:collapse">
      ${tableRows}
    </table>
    <div style="margin-top:18px;padding-top:12px;border-top:1px solid var(--workspace-preview-border, #1e293b);font-size:11px;color:var(--workspace-preview-hint, #475569)">
      Resumo gerado em ${new Date().toLocaleString('pt-BR')} · ${missing.length === 0 ? '✓ Todos os campos preenchidos' : `⚠ ${missing.length} campo(s) pendente(s)`}
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

/* ─── normalize helper ─── */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ─── ClientSearch ─── */

const SHOW_INITIAL = 20;

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

  const trimmedQuery = query.trim();

  const { matches, isEmptyQuery } = useMemo(() => {
    if (!trimmedQuery) {
      return { matches: clients.slice(0, SHOW_INITIAL), isEmptyQuery: true };
    }
    const q = normalize(trimmedQuery);
    const qDigits = q.replace(/\D/g, '');
    const found = clients.filter((c) => {
      if (normalize(c.name).includes(q)) return true;
      if (c.email && normalize(c.email).includes(q)) return true;
      const cpfDigits = (c.cpf || '').replace(/\D/g, '');
      if (qDigits && cpfDigits && cpfDigits.includes(qDigits)) return true;
      const phoneDigits = (c.phone || '').replace(/\D/g, '');
      if (qDigits && phoneDigits && phoneDigits.includes(qDigits)) return true;
      return false;
    });
    return { matches: found.slice(0, 30), isEmptyQuery: false };
  }, [clients, trimmedQuery]);

  const showNoResults = open && !isEmptyQuery && matches.length === 0;

  function handleSelect(c: ClientLite) {
    setQuery(c.name);
    setOpen(false);
    setHover(-1);
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
          placeholder="Buscar por nome, CPF, telefone ou e-mail…"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (selected && e.target.value !== selected.name) onSelect(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          className="w-full rounded-xl border border-white/10 bg-neutral-900 pl-9 pr-9 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-amber-400/40 disabled:opacity-60"
          autoComplete="off"
        />
        {query && (
          <button onClick={handleClear} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (matches.length > 0 || showNoResults) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 shadow-2xl">
          {/* counter header */}
          <div className="sticky top-0 flex items-center justify-between border-b bg-neutral-900 px-4 py-2">
            <span className="text-[10px] text-white/35">
              {isEmptyQuery
                ? `${clients.length} clientes — mostrando ${matches.length} primeiros`
                : `${matches.length} encontrado${matches.length !== 1 ? 's' : ''}`}
            </span>
          </div>

          {showNoResults ? (
            <div className="px-4 py-4 text-center text-sm text-white/40">
              Nenhum cliente encontrado para &ldquo;{trimmedQuery}&rdquo;
            </div>
          ) : (
            matches.map((c, i) => (
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
                  {[c.cpf, c.phone, c.email].filter(Boolean).join(' · ')}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main page ─── */

export function DocumentsGeneratorPage() {
  const [searchParams] = useSearchParams();
  const requestedClientId = searchParams.get('client');
  const [context, setContext] = useState<DocumentHistoryContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<DocumentHistoryContext | null>(null);
  useEffect(() => {
    let alive = true;
    let latestRequest = 0;
    async function refreshContext() {
      const request = ++latestRequest;
      try {
        const scope = await getDocumentOfficeContext();
        const { officeId, userId } = scope;
        if (!alive || request !== latestRequest) return;
        if (current.current?.officeId === officeId && current.current?.userId === userId) return;
        current.current = scope; setContext(scope); setError(null);
      } catch (err) {
        if (!alive || request !== latestRequest) return;
        current.current = null; setContext(null);
        setError(err instanceof Error ? err.message : 'Não foi possível confirmar o acesso aos documentos.');
      }
    }
    void refreshContext();
    const onFocus = () => { void refreshContext(); };
    window.addEventListener('focus', onFocus);
    const auth = requireSupabase().auth?.onAuthStateChange((_event, session) => {
      if (session?.user.id !== current.current?.userId) {
        latestRequest++;
        current.current = null; setContext(null);
      }
      // Avoid awaiting Supabase calls inside its Auth callback.
      window.setTimeout(() => { if (alive) void refreshContext(); }, 0);
    });
    return () => { alive = false; window.removeEventListener('focus', onFocus); auth?.data.subscription.unsubscribe(); };
  }, []);
  if (!context) return <div className="p-4 text-sm text-white/70" role={error ? 'alert' : 'status'}>{error || 'Verificando acesso aos documentos…'}</div>;
  return <ScopedDocumentsGeneratorPage key={`${documentHistoryKey(context)}:client:${encodeURIComponent(requestedClientId || '')}`} context={context} requestedClientId={requestedClientId} isActiveContext={() => current.current?.officeId === context.officeId && current.current?.userId === context.userId} />;
}

function ScopedDocumentsGeneratorPage({ context, requestedClientId, isActiveContext }: { context: DocumentHistoryContext; requestedClientId: string | null; isActiveContext: () => boolean }) {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [selectedClient, setSelectedClient] = useState<ClientLite | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [expandGroup, setExpandGroup] = useState<string>('Contratos');
  const [history, setHistory] = useState<HistoryEntry[]>(() => readDocumentHistory(getHistoryStorage(), context));
  const alive = useRef(true);
  const downloadAttempt = useRef(0);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    let active = true;
    alive.current = true;
    (async () => {
      try {
        const data = await loadDocumentClients(context);
        if (active) {
          setClients(data);
          if (requestedClientId) {
            const requested = findRequestedDocumentClient(data, requestedClientId);
            if (requested) {
              setSelectedClient(requested);
              setFields(initialDocumentFields(requested, null));
            } else {
              showToast('O cliente solicitado não está disponível neste escritório. Selecione um cliente autorizado.', 'error');
            }
          }
        }
      } catch (err) {
        if (active) showToast(err instanceof Error ? err.message : 'Não foi possível carregar os clientes.', 'error');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; alive.current = false; };
  }, [showToast, requestedClientId, context]);

  function selectClient(client: ClientLite | null) {
    downloadAttempt.current++;
    setGenerating(false);
    setSelectedClient(client);
    setFields(initialDocumentFields(client, selectedTemplate));
  }

  function selectTemplate(template: Template) {
    if (!isDocumentTemplateAvailable(template)) {
      showToast('Este modelo está em conferência e ainda não pode ser gerado.', 'error');
      return;
    }
    downloadAttempt.current++;
    setGenerating(false);
    setSelectedTemplate(template);
    setFields(initialDocumentFields(selectedClient, template));
  }

  const { html: previewHtml, missing } = useMemo(
    () => buildPreview(selectedTemplate, selectedClient, fields),
    [selectedTemplate, selectedClient, fields],
  );

  function setField(key: string, value: string) {
    downloadAttempt.current++;
    setGenerating(false);
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function buildDocxData() {
    if (!selectedClient || !selectedTemplate) return null;
    return prepareDocumentData({ NOME: selectedClient.name, ...fields });
  }

  async function handleGenerateDocx() {
    if (generating) return;
    if (!selectedClient || !selectedTemplate) return showToast('Selecione cliente e modelo.', 'error');
    if (missing.length) return showToast(`Preencha antes de gerar: ${missing.join(', ')}.`, 'error');
    const data = buildDocxData();
    if (!data) return;
    const attempt = ++downloadAttempt.current;
    async function validateDownloadAccess() {
      if (!alive.current || !isActiveContext() || attempt !== downloadAttempt.current) throw new Error('O acesso mudou. Reabra o gerador antes de gerar este documento.');
      const live = await getDocumentOfficeContext(context);
      if (!alive.current || !isActiveContext() || attempt !== downloadAttempt.current
        || live.userId !== context.userId || live.officeId !== context.officeId) {
        throw new Error('O acesso mudou. Reabra o gerador antes de gerar este documento.');
      }
    }
    setGenerating(true);
    try {
      await validateDownloadAccess();
      await generateDocumentDocx(
        data,
        selectedTemplate.file,
        validateDownloadAccess,
      );
      try {
        await validateDownloadAccess();
      } catch {
        if (alive.current && isActiveContext() && attempt === downloadAttempt.current) {
          showToast('Documento baixado. O acesso mudou antes do registro do histórico.', 'success');
        }
        return;
      }
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        clientName: selectedClient.name,
        templateLabel: selectedTemplate.label,
        templateFile: selectedTemplate.file,
      };
      const storage = getHistoryStorage();
      const result = appendDocumentHistory(storage, context, entry, history);
      if (alive.current && isActiveContext() && attempt === downloadAttempt.current) {
        setHistory(result.entries);
        showToast(result.persisted ? 'Documento DOCX gerado e baixado!' : 'Documento DOCX gerado e baixado! O histórico local não pôde ser salvo neste navegador.', 'success');
      }
    } catch (err: unknown) {
      if (alive.current && isActiveContext() && attempt === downloadAttempt.current) showToast(err instanceof Error ? err.message : 'Falha ao gerar DOCX.', 'error');
    } finally {
      if (alive.current && attempt === downloadAttempt.current) setGenerating(false);
    }
  }

  function handlePrint() {
    if (!isActiveContext()) return showToast('O acesso mudou. Reabra o gerador antes de continuar.', 'error');
    if (!selectedClient || !selectedTemplate) return showToast('Selecione cliente e modelo.', 'error');
    const data = buildDocxData();
    if (!data) return;

    const rows = Object.entries(data)
      .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
      .join('');

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${escapeHtml(selectedTemplate.label)}</title>
<style>${letterheadPrintStyles}
h1{font-size:1.3rem;margin-bottom:18px}table{width:100%;border-collapse:collapse;margin-bottom:24px}
td,th{border:1px solid #ccc;padding:8px 12px;text-align:left}th{background:#f4f4f4}
@media print{button{display:none}}</style></head>
<body>${letterheadBodyStart}<h1>${escapeHtml(selectedTemplate.label)} — ${escapeHtml(selectedClient.name)}</h1>
<table><tr><th>Campo</th><th>Valor</th></tr>${rows}</table>
<p style="color:#666;font-size:.8rem">Gerado em ${new Date().toLocaleString('pt-BR')}</p>
<button onclick="window.print()" style="padding:8px 18px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;cursor:pointer">Imprimir / Salvar PDF</button>
${letterheadBodyEnd}</body></html>`;

    const win = window.open('', '_blank', 'width=800,height=900');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      const image = win.document.querySelector('img');
      if (image) {
        void image.decode().then(() => win.print(),() => showToast('Não foi possível carregar o timbrado para impressão.','error'));
      }
    }
  }

  function handleCopyText() {
    if (!isActiveContext()) return showToast('O acesso mudou. Reabra o gerador antes de continuar.', 'error');
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
      assertDocumentTemplateAvailable(entry.templateFile);
      const resp = await fetch(`/templates/${resolveTemplateAssetName(entry.templateFile)}`);
      if (!resp.ok) throw new Error('Template indisponível.');
      showToast(`Abra o template "${entry.templateLabel}" e preencha os dados novamente.`, 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erro.', 'error');
    }
  }

  const ready = Boolean(selectedClient && selectedTemplate);

  return (
    <div className="min-h-screen legacy-space-y-8 px-4 py-8 md:px-6">
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
          disabled={!ready || missing.length > 0 || generating}
          title={!ready ? 'Selecione cliente e modelo' : undefined}
          className={cn(
            'flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
            ready
              ? 'bg-amber-400 text-neutral-950 hover:bg-amber-300 active:scale-95'
              : 'bg-white/10 text-white/40',
          )}
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Gerar DOCX
        </button>
        <button
          onClick={handlePrint}
          disabled={!ready}
          title={!ready ? 'Selecione cliente e modelo' : undefined}
          className={cn(
            'flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
            ready
              ? 'border-white/20 text-white hover:bg-white/15 active:scale-95'
              : 'text-white/40',
          )}
        >
          <Printer className="h-4 w-4" />
          Imprimir resumo
        </button>
        <button
          onClick={handleCopyText}
          disabled={!ready}
          title={!ready ? 'Selecione cliente e modelo' : undefined}
          className={cn(
            'flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
            ready
              ? 'border-white/20 text-white hover:bg-white/15 active:scale-95'
              : 'text-white/40',
          )}
        >
          <ClipboardCopy className="h-4 w-4" />
          Copiar dados
        </button>
      </div>

      {/* 2-column layout */}
      <div className="grid gap-8 lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_480px]">
        {/* ── LEFT COLUMN: form ── */}
        <div className="legacy-space-y-6">

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
              <ClientSearch clients={clients} selected={selectedClient} onSelect={selectClient} />
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

            <div className="legacy-space-y-3">
              {GROUPS.map((group) => {
                const groupTemplates = TEMPLATES.filter((t) => t.group === group);
                const isOpen = expandGroup === group;

                if (groupTemplates.length === 0) {
                  // Recibos: redirect to the dedicated ReceiptsPage
                  if (group === 'Recibos') {
                    return (
                      <div
                        key={group}
                        className="w-full rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-left"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Receipt className="h-4 w-4 text-amber-400" />
                            <span className="text-sm font-semibold text-white">{group}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => navigate('/app/recibos')}
                            className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-400/20"
                          >
                            Abrir módulo
                          </button>
                        </div>
                        <p className="mt-1.5 text-xs text-white/40">
                          Gere recibos de honorários com PDF, valor por extenso e histórico de emissões sem sair desta tela.
                        </p>
                      </div>
                    );
                  }
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
                      <div className="border-t border-white/10 px-3 pb-3 pt-2 legacy-space-y-2">
                        {groupTemplates.map((t) => (
                          <button
                            key={t.id}
                            disabled={!isDocumentTemplateAvailable(t)}
                            title={!isDocumentTemplateAvailable(t) ? 'Modelo aguardando conferência do documento.' : undefined}
                            onClick={() => selectTemplate(t)}
                            className={cn(
                              'w-full rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50',
                              selectedTemplate?.id === t.id
                                ? 'border-amber-400/40 bg-amber-400/10'
                                : 'border-white/10 bg-white/5 hover:bg-white/10',
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-sm font-medium text-white">{t.label}</div>
                                <div className="mt-0.5 text-[11px] text-white/45">{t.description}</div>
                                {!isDocumentTemplateAvailable(t) && <div className="mt-1 text-[11px] text-amber-200">Modelo em conferência</div>}
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

              <p className="mb-4 text-xs leading-relaxed text-white/50">
                Estes dados preenchem o Word e valem apenas para esta emissão. A data é a de hoje.
                As cláusulas e os honorários seguem o texto do modelo selecionado. Revise o DOCX antes de assinar.
              </p>
              <div className="legacy-space-y-4">
                {selectedTemplate.fields.map((f) => (
                  <div key={f.key}>
                    <label htmlFor={`document-${f.key}`} className="mb-1.5 block text-xs font-medium text-white/70">
                      {f.label}
                    </label>
                    <div className="relative">
                      <input
                        id={`document-${f.key}`}
                        type="text"
                        value={fields[f.key] || ''}
                        placeholder={f.placeholder}
                        onChange={(e) => setField(f.key, e.target.value)}
                        className={cn(
                          'w-full rounded-xl border border-white/10 bg-neutral-900 py-2.5 text-sm text-white placeholder-white/25 outline-none transition focus:border-amber-400/40',
                          'px-3',
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
        <div className="legacy-space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="flex flex-col overflow-hidden">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Resumo dos dados</h2>
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

          <p className="text-xs leading-relaxed text-white/40">
            A impressão contém o resumo dos dados. O documento completo com as cláusulas é o arquivo Word.
          </p>
          {/* quick actions repeat */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => void handleGenerateDocx()}
              disabled={!ready || missing.length > 0 || generating}
              title={!ready ? 'Selecione cliente e modelo' : undefined}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
                ready
                  ? 'bg-amber-400 text-neutral-950 hover:bg-amber-300 active:scale-95'
                  : 'bg-white/10 text-white/40',
              )}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {generating ? 'Gerando…' : 'Gerar DOCX'}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handlePrint}
                disabled={!ready}
                title={!ready ? 'Selecione cliente e modelo' : undefined}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50',
                  ready
                    ? 'border-white/20 text-white/80 hover:bg-white/15 active:scale-95'
                    : 'text-white/40',
                )}
              >
                <Printer className="h-4 w-4" />
                Imprimir resumo
              </button>
              <button
                onClick={handleCopyText}
                disabled={!ready}
                title={!ready ? 'Selecione cliente e modelo' : undefined}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50',
                  ready
                    ? 'border-white/20 text-white/80 hover:bg-white/15 active:scale-95'
                    : 'text-white/40',
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
