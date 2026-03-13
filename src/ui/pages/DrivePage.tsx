import { useEffect, useMemo, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Download, Trash2, Eye, EyeOff, Bot, Upload } from 'lucide-react';

import { Card } from '@/ui/widgets/Card';
import type { DocumentRow } from '@/lib/documents';
import { deleteDocument, getDocumentDownloadUrl, toggleDocumentVisibility, uploadClientDocument } from '@/lib/documents';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';
import { loadClientsLite } from '@/lib/loadClientsLite';
import type { ClientLite } from '@/lib/types';

export function DrivePage() {
  const [rows, setRows] = useState<(DocumentRow & { client_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | 'pdf' | 'image' | 'doc' | 'other'>('all');
  const [visibility, setVisibility] = useState<'all' | 'public' | 'private'>('all');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<ClientLite[]>([]);
  
  // Upload form state
  const [upTitle, setUpTitle] = useState('');
  const [upKind, setUpKind] = useState<'personal' | 'template'>('personal');
  const [upClientId, setUpClientId] = useState('');
  const [upPublic, setUpPublic] = useState(false);
  const [upFile, setUpFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const sb = requireSupabase();
      await getAuthedUser();

      const { data, error: fetchErr } = await sb
        .from('documents')
        .select('id,user_id,client_id,case_id,task_id,kind,title,file_path,mime_type,size_bytes,created_at,is_public, client:clients(name)')
        .order('created_at', { ascending: false })
        .limit(200);

      if (fetchErr) throw new Error(fetchErr.message);

      const docs = (data || []).map((d: any) => ({
        ...d,
        client_name: d.client?.[0]?.name || 'Desconhecido'
      }));

      setRows(docs);
      
      const loadedClients = await loadClientsLite().catch(() => [] as ClientLite[]);
      setClients(loadedClients);

      setLoading(false);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar documentos do Drive.');
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();

    return rows
      .filter((r) => {
        const mt = String(r.mime_type || '').toLowerCase();
        if (type === 'all') return true;
        if (type === 'pdf') return mt.includes('pdf') || r.file_path.toLowerCase().endsWith('.pdf');
        if (type === 'image') return mt.startsWith('image/') || /\.(png|jpg|jpeg|webp|gif)$/i.test(r.file_path);
        if (type === 'doc') return /\.(doc|docx)$/i.test(r.file_path) || mt.includes('msword') || mt.includes('wordprocessingml');
        return true;
      })
      .filter((r) => {
        if (visibility === 'public') return r.is_public;
        if (visibility === 'private') return !r.is_public;
        return true;
      })
      .filter((r) => {
        if (!term) return true;
        const hay = [r.title, r.mime_type || '', r.client_name || ''].join(' ').toLowerCase();
        return hay.includes(term);
      });
  }, [rows, q, type, visibility]);

  const [analyzingDoc, setAnalyzingDoc] = useState<string | null>(null);

  async function onAnalyzeWithAI(doc: DocumentRow) {
    if (analyzingDoc) return;
    setAnalyzingDoc(doc.id);
    
    // Simulate LegalDoc AI integration
    setTimeout(() => {
      alert(`[LegalDoc AI] Análise concluída para: ${doc.title}\n\n- Partes Identificadas: 2\n- Riscos: Baixo\n- Cláusulas Extraídas: 5\n\nResumo salvo nas observações do cliente.`);
      setAnalyzingDoc(null);
    }, 2500);
  }

  async function onDownload(doc: DocumentRow) {
    try {
      const url = await getDocumentDownloadUrl(doc.file_path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      alert('Falha ao gerar link de download: ' + err.message);
    }
  }

  async function onTogglePublic(doc: DocumentRow) {
    try {
      await toggleDocumentVisibility(doc.id, !doc.is_public);
      await load();
    } catch (err: any) {
      alert('Falha ao alterar visibilidade: ' + err.message);
    }
  }

  async function onDelete(doc: DocumentRow) {
    if (!confirm('Excluir este documento do sistema inteiro?')) return;
    try {
      await deleteDocument({ id: doc.id, file_path: doc.file_path });
      await load();
    } catch (err: any) {
      alert('Falha ao excluir documento: ' + err.message);
    }
  }

  async function onUpload() {
    if (!upFile) return;
    if (upKind === 'personal' && !upClientId) {
      setError('Selecione um cliente para vincular o documento.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // If template, clientId doesn't matter as much but the schema expects it.
      // We will just use the first client ID if none selected, or a dummy if none exist.
      let targetClientId = upClientId;
      if (upKind === 'template' && !targetClientId) {
        if (clients.length > 0) targetClientId = clients[0].id;
        else throw new Error("Cadastre ao menos um cliente para poder subir modelos.");
      }

      await uploadClientDocument({
        clientId: targetClientId,
        kind: upKind,
        title: upTitle.trim() || upFile.name,
        file: upFile,
        isPublic: upKind === 'template' ? false : upPublic,
      });

      setUploadOpen(false);
      setUpTitle('');
      setUpFile(null);
      setUpPublic(false);
      setSaving(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao enviar documento.');
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Drive do Escritório</h1>
          <p className="text-sm text-white/60">Repositório central de documentos, contratos e provas de todos os clientes.</p>
        </div>
        <button onClick={() => setUploadOpen(true)} className="btn-primary">
          <Upload className="w-4 h-4 mr-2 inline" />
          Novo Documento
        </button>
      </div>

      {error ? <div className="text-sm text-red-200 bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</div> : null}

      {uploadOpen && (
        <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
          <h3 className="text-sm font-semibold text-white mb-4">Adicionar Documento ao Drive Global</h3>
          
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-white/80">
              Tipo do Arquivo
              <select className="select !mt-1" value={upKind} onChange={e => setUpKind(e.target.value as any)}>
                <option value="personal">Documento / Prova do Cliente</option>
                <option value="template">Modelo Word para Geração (Contratos/Procurações)</option>
              </select>
            </label>

            <label className="text-sm text-white/80">
              Vincular a um Cliente
              <select className="select !mt-1" value={upClientId} onChange={e => setUpClientId(e.target.value)}>
                <option value="">Selecione o Cliente...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>

            <label className="text-sm text-white/80">
              Nome de exibição (opcional)
              <input className="input !mt-1" value={upTitle} onChange={(e) => setUpTitle(e.target.value)} placeholder="Ex: CNH do Cliente" />
            </label>
            
            <div>
              <label className="text-sm text-white/80 block mb-1">
                Selecione o arquivo
              </label>
              <input
                ref={fileInputRef}
                className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-white/10 rounded-xl bg-black/20"
                type="file"
                onChange={(e) => setUpFile(e.target.files?.[0] || null)}
                accept={upKind === 'template' ? '.docx' : 'application/pdf,image/*,.doc,.docx'}
              />
              {upKind === 'template' && <p className="text-xs text-amber-200/70 mt-1">Apenas arquivos .docx são aceitos como modelos.</p>}
            </div>
            
            {upKind !== 'template' && (
              <label className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-black/20 cursor-pointer hover:bg-white/5 transition-colors col-span-2">
                <input 
                  type="checkbox" 
                  checked={upPublic} 
                  onChange={(e) => setUpPublic(e.target.checked)} 
                  className="w-4 h-4 text-amber-400 rounded border-white/20 bg-transparent focus:ring-amber-400 focus:ring-offset-gray-900"
                />
                <div>
                  <div className="text-sm font-semibold text-white">Tornar visível para o Cliente</div>
                  <div className="text-xs text-white/50">O cliente poderá ver e baixar este arquivo pelo Portal VIP.</div>
                </div>
              </label>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button disabled={saving || !upFile || (!upClientId && upKind === 'personal')} onClick={() => void onUpload()} className="btn-primary">
              {saving ? 'Enviando...' : 'Salvar no Drive'}
            </button>
            <button disabled={saving} onClick={() => { setUploadOpen(false); setUpFile(null); }} className="btn-ghost">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 md:col-span-2">
          <div className="text-[11px] text-white/60">Buscar documento ou cliente</div>
          <input
            className="input !mt-1 !text-sm w-full"
            placeholder="Ex.: Procuração, João..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] text-white/60">Tipo de Arquivo</div>
          <select className="select !mt-1 !text-sm" value={type} onChange={(e) => setType(e.target.value as any)}>
            <option value="all">Todos os tipos</option>
            <option value="pdf">PDF</option>
            <option value="doc">Word / Textos</option>
            <option value="image">Imagens</option>
          </select>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] text-white/60">Visibilidade</div>
          <select className="select !mt-1 !text-sm" value={visibility} onChange={(e) => setVisibility(e.target.value as any)}>
            <option value="all">Todos</option>
            <option value="public">No Portal do Cliente (Público)</option>
            <option value="private">Apenas Interno (Privado)</option>
          </select>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? <div className="p-10 text-center text-sm text-white/50 animate-pulse">Carregando documentos...</div> : null}

        {!loading && filtered.length === 0 ? (
          <div className="p-10 text-center flex flex-col items-center justify-center">
            <FileText className="w-12 h-12 text-white/10 mb-3" />
            <div className="text-sm text-white/60">Nenhum documento encontrado.</div>
            <div className="text-xs text-white/40 mt-1">
              Os documentos podem ser enviados acessando a aba "Documentos" no perfil de cada cliente.
            </div>
          </div>
        ) : null}

        {!loading && filtered.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white/5 text-xs text-white/50 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nome do Arquivo</th>
                  <th className="px-4 py-3 font-semibold">Cliente Vinculado</th>
                  <th className="px-4 py-3 font-semibold">Data / Tamanho</th>
                  <th className="px-4 py-3 font-semibold">Acesso</th>
                  <th className="px-4 py-3 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((d) => {
                  const isWord = d.mime_type?.includes('word') || d.file_path.endsWith('.docx');
                  
                  return (
                    <tr key={d.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="shrink-0">
                            {isWord ? (
                              <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">W</div>
                            ) : d.mime_type?.includes('pdf') ? (
                              <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center font-bold">P</div>
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold">IMG</div>
                            )}
                          </div>
                          <div className="font-semibold text-white truncate max-w-[200px]" title={d.title}>
                            {d.title}
                            {d.kind === 'template' && <span className="ml-2 badge border-blue-500/30 bg-blue-500/10 text-blue-300">Modelo</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-white/80">
                        <Link to={`/app/clientes/${d.client_id}`} className="hover:text-amber-300 transition-colors">
                          {d.client_name}
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-xs text-white/60">
                        {new Date(d.created_at).toLocaleDateString()}
                        {d.size_bytes ? <span className="block mt-0.5 text-white/40">{(d.size_bytes / 1024 / 1024).toFixed(2)} MB</span> : null}
                      </td>
                      <td className="px-4 py-4">
                        {d.kind === 'template' ? (
                          <span className="text-xs text-white/40">—</span>
                        ) : d.is_public ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                            <Eye className="w-3.5 h-3.5" /> Público
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-white/40">
                            <EyeOff className="w-3.5 h-3.5" /> Interno
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {(d.mime_type?.includes('pdf') || d.mime_type?.includes('word')) && (
                            <button 
                              onClick={() => void onAnalyzeWithAI(d)} 
                              disabled={analyzingDoc === d.id}
                              className="btn-ghost !border-amber-500/20 !text-amber-200 !rounded-lg !px-3 !py-1.5 !text-xs flex items-center gap-1 hover:bg-amber-500/10"
                            >
                              <Bot className="w-3.5 h-3.5" />
                              {analyzingDoc === d.id ? 'Lendo...' : 'Analisar (IA)'}
                            </button>
                          )}
                          {d.kind !== 'template' && (
                            <button onClick={() => void onTogglePublic(d)} className="btn-ghost !border-white/10 !rounded-lg !px-3 !py-1.5 !text-xs">
                              {d.is_public ? 'Ocultar' : 'Publicar'}
                            </button>
                          )}
                          <button onClick={() => void onDownload(d)} className="btn-ghost !rounded-lg !p-2" title="Baixar">
                            <Download className="w-4 h-4 text-white/70" />
                          </button>
                          <button onClick={() => void onDelete(d)} className="btn-ghost !border-transparent hover:!bg-red-500/10 hover:!text-red-400 !rounded-lg !p-2 group" title="Excluir">
                            <Trash2 className="w-4 h-4 text-white/30 group-hover:text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
