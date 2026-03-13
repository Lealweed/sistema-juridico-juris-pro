import { useEffect, useMemo, useState, useRef } from 'react';
import { Eye, EyeOff, FileText, Upload, Download, Trash2 } from 'lucide-react';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';

import type { DocumentRow } from '@/lib/documents';
import { deleteDocument, getDocumentDownloadUrl, listClientDocuments, uploadClientDocument, toggleDocumentVisibility } from '@/lib/documents';
import { requireSupabase, getAuthedUser } from '@/lib/supabaseDb';

export function DocumentsSection({ clientId, caseId }: { clientId: string; caseId?: string | null }) {
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<'all' | 'personal' | 'case' | 'task' | 'template'>(caseId ? 'case' : 'all');
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | 'pdf' | 'image' | 'doc' | 'other'>('all');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [clientData, setClientData] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();

    return rows
      .filter((r) => {
        if (tab === 'personal') return r.kind === 'personal';
        if (tab === 'template') return r.kind === 'template';
        if (tab === 'case') {
          if (caseId) return r.kind === 'case' && r.case_id === caseId;
          return r.kind === 'case';
        }
        if (tab === 'task') return r.kind === 'task';
        return true;
      })
      .filter((r) => {
        const mt = String(r.mime_type || '').toLowerCase();
        if (type === 'all') return true;
        if (type === 'pdf') return mt.includes('pdf') || r.file_path.toLowerCase().endsWith('.pdf');
        if (type === 'image') return mt.startsWith('image/') || /\.(png|jpg|jpeg|webp|gif)$/i.test(r.file_path);
        if (type === 'doc') return /\.(doc|docx)$/i.test(r.file_path) || mt.includes('msword');
        return true;
      })
      .filter((r) => {
        if (!term) return true;
        const hay = [r.title, r.mime_type || '', r.file_path].join(' ').toLowerCase();
        return hay.includes(term);
      });
  }, [rows, tab, caseId, q, type]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await listClientDocuments(clientId);
      setRows(data);
      
      // Load client info for templates
      const sb = requireSupabase();
      const user = await getAuthedUser();
      setUserId(user.id);
      
      const { data: cData } = await sb.from('clients').select('*').eq('id', clientId).single();
      if (cData) setClientData(cData);
      
      setLoading(false);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar documentos.');
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function onUpload() {
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      const kind = tab === 'template' ? 'template' : (tab === 'case' ? 'case' : 'personal');
      await uploadClientDocument({
        clientId,
        kind,
        title: title.trim() || file.name,
        file,
        caseId: kind === 'case' ? caseId || null : null,
        isPublic: kind === 'template' ? false : isPublic,
      });
      setUploadOpen(false);
      setTitle('');
      setFile(null);
      setIsPublic(false);
      setSaving(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao enviar documento.');
      setSaving(false);
    }
  }

  async function onTogglePublic(doc: DocumentRow) {
    try {
      await toggleDocumentVisibility(doc.id, !doc.is_public);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao alterar visibilidade.');
    }
  }

  async function generateFromTemplate(doc: DocumentRow) {
    if (!clientData) {
      alert("Faltam dados do cliente para preencher o modelo.");
      return;
    }
    
    setSaving(true);
    setError("Gerando documento... Aguarde.");
    try {
      const url = await getDocumentDownloadUrl(doc.file_path);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Erro ao baixar o modelo.");
      
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      
      const zip = new PizZip(arrayBuffer);
      const docx = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });
      
      // Variables to inject into the Word Document
      // Lawyers can use {{nome_cliente}}, {{telefone}}, {{email}}, etc. inside the Word file
      docx.render({
        nome_cliente: clientData.name || '',
        telefone: clientData.phone || '',
        email: clientData.email || '',
        cpf: clientData.document || '', // assuming document field exists
        data_atual: new Date().toLocaleDateString('pt-BR'),
        id_cliente: clientData.id.slice(0, 8),
      });
      
      const out = docx.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      
      const generatedFileName = `${doc.title}_${clientData.name.split(' ')[0]}.docx`.replace(/\s+/g, '_');
      
      // Ask user if they want to save to the system or just download
      if (confirm("Documento gerado com sucesso! Deseja salvar uma cópia no painel do cliente automaticamente?")) {
        await uploadClientDocument({
          clientId,
          kind: 'personal',
          title: generatedFileName,
          file: out,
          fileName: generatedFileName,
          isPublic: false,
        });
        await load();
      }
      
      // Always trigger download for the lawyer
      saveAs(out, generatedFileName);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Falha ao gerar documento. O arquivo não é um .docx válido ou as chaves estão mal formatadas.');
    } finally {
      setSaving(false);
    }
  }

  async function onDownload(doc: DocumentRow) {
    try {
      const url = await getDocumentDownloadUrl(doc.file_path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setError(err?.message || 'Falha ao gerar link de download.');
    }
  }

  async function onDelete(doc: DocumentRow) {
    if (!confirm('Excluir este documento? Esta ação não pode ser desfeita.')) return;
    try {
      await deleteDocument({ id: doc.id, file_path: doc.file_path });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao excluir documento.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Smart Drive & Contratos</div>
          <div className="text-xs text-white/60">Controle de documentos e geração de Word.</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: 'personal', label: 'Cliente' },
                { id: 'case', label: 'Processos' },
                { id: 'template', label: 'Modelos Word' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={
                  'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ' +
                  (tab === t.id ? 'bg-amber-400 text-neutral-950 shadow-md shadow-amber-400/20' : 'text-white/70 hover:text-white')
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              if (tab === 'task' || tab === 'all') {
                setTab(caseId ? 'case' : 'personal');
              }
              setUploadOpen(true);
            }}
            className="btn-primary"
          >
            <Upload className="w-4 h-4 mr-2 inline" />
            Enviar Arquivo
          </button>
        </div>
      </div>

      {error ? (
        <div className={`text-sm p-3 rounded-xl border ${error.includes('Aguarde') ? 'bg-amber-500/10 border-amber-500/20 text-amber-200' : 'bg-red-500/10 border-red-500/20 text-red-200'}`}>
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            className="input w-72 max-w-full !mt-0 !text-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar documento..."
          />
          <select className="select w-44 !mt-0 !text-sm" value={type} onChange={(e) => setType(e.target.value as any)}>
            <option value="all">Tipos</option>
            <option value="pdf">PDF</option>
            <option value="doc">Word / Textos</option>
            <option value="image">Imagens</option>
          </select>
        </div>

        <div className="text-xs font-semibold text-white/50">{filtered.length} ARQUIVOS</div>
      </div>

      {uploadOpen ? (
        <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
          <h3 className="text-sm font-semibold text-white mb-4">Adicionar Documento ao Drive</h3>
          
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-white/80">
              Nome de exibição (opcional)
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: CNH do Cliente" />
            </label>
            
            <div>
              <label className="text-sm text-white/80 block mb-1">
                Selecione o arquivo
              </label>
              <input
                ref={fileInputRef}
                className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-white/10 rounded-xl bg-black/20"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                accept={tab === 'template' ? '.docx' : 'application/pdf,image/*,.doc,.docx'}
              />
              {tab === 'template' && <p className="text-xs text-amber-200/70 mt-1">Apenas arquivos .docx são aceitos como modelos.</p>}
            </div>
            
            {tab !== 'template' && (
              <label className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-black/20 cursor-pointer hover:bg-white/5 transition-colors col-span-2">
                <input 
                  type="checkbox" 
                  checked={isPublic} 
                  onChange={(e) => setIsPublic(e.target.checked)} 
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
            <button disabled={saving || !file} onClick={() => void onUpload()} className="btn-primary">
              {saving ? 'Enviando Cofre...' : 'Salvar no Drive'}
            </button>
            <button disabled={saving} onClick={() => { setUploadOpen(false); setFile(null); }} className="btn-ghost">
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-neutral-900/30">
        {loading ? <div className="p-8 text-center text-sm text-white/50 animate-pulse">Carregando documentos...</div> : null}

        {!loading && filtered.length === 0 ? (
          <div className="p-10 text-center flex flex-col items-center justify-center">
            <FileText className="w-12 h-12 text-white/10 mb-3" />
            <div className="text-sm text-white/60">Cofre vazio.</div>
            <div className="text-xs text-white/40 mt-1">
              {tab === 'template' 
                ? 'Suba um arquivo .docx com tags como {{nome_cliente}} para gerar contratos automáticos.' 
                : 'Faça o upload de documentos para mantê-los seguros.'}
            </div>
          </div>
        ) : null}

        {!loading && filtered.length ? (
          <div className="divide-y divide-white/5">
            {filtered.map((d) => {
              const isWord = d.mime_type?.includes('word') || d.file_path.endsWith('.docx');
              
              return (
                <div key={d.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-1">
                      {isWord ? (
                        <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">W</div>
                      ) : d.mime_type?.includes('pdf') ? (
                        <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center">P</div>
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">IMG</div>
                      )}
                    </div>
                    
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate max-w-xs md:max-w-md" title={d.title}>
                        {d.title}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-white/50">
                        <span>{new Date(d.created_at).toLocaleDateString()}</span>
                        {d.size_bytes ? <span>· {(d.size_bytes / 1024 / 1024).toFixed(2)} MB</span> : null}
                        
                        {d.kind === 'template' ? (
                          <span className="badge border-blue-500/30 bg-blue-500/10 text-blue-300">Modelo</span>
                        ) : d.is_public ? (
                          <span className="flex items-center gap-1 text-emerald-400" title="Cliente pode ver no portal"><Eye className="w-3 h-3" /> Público</span>
                        ) : (
                          <span className="flex items-center gap-1 text-white/40" title="Apenas advogados do escritório"><EyeOff className="w-3 h-3" /> Interno</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {d.kind === 'template' && isWord ? (
                      <button 
                        onClick={() => void generateFromTemplate(d)} 
                        disabled={saving}
                        className="btn-primary !rounded-lg !px-3 !py-1.5 !text-xs whitespace-nowrap"
                      >
                        ⚡ Gerar Doc
                      </button>
                    ) : null}
                  
                    {d.kind !== 'template' ? (
                      <button 
                        onClick={() => void onTogglePublic(d)} 
                        className="btn-ghost !border-white/10 !rounded-lg !px-3 !py-1.5 !text-xs"
                      >
                        {d.is_public ? 'Ocultar' : 'Publicar'}
                      </button>
                    ) : null}
                    
                    <button onClick={() => void onDownload(d)} className="btn-ghost !rounded-lg !p-2">
                      <Download className="w-4 h-4 text-white/70" />
                    </button>
                    
                    {tab !== 'template' || d.user_id === userId ? (
                      <button onClick={() => void onDelete(d)} className="btn-ghost !border-transparent hover:!bg-red-500/10 hover:!text-red-400 !rounded-lg !p-2 group">
                        <Trash2 className="w-4 h-4 text-white/30 group-hover:text-red-400" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
