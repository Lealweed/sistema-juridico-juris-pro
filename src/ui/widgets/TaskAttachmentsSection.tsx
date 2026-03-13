import { useEffect, useState } from 'react';

import type { DocumentRow } from '@/lib/documents';
import { deleteDocument, getDocumentDownloadUrl, listTaskDocuments, uploadTaskDocument } from '@/lib/documents';

export function TaskAttachmentsSection({
  taskId,
  clientId,
  caseId,
}: {
  taskId: string;
  clientId: string | null;
  caseId: string | null;
}) {
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const data = await listTaskDocuments(taskId);
      setRows(data);
      setLoading(false);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar anexos.');
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function onUpload() {
    if (!file) return;
    if (!clientId) {
      setError('Para anexar arquivos, primeiro vincule um cliente à tarefa.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await uploadTaskDocument({
        taskId,
        clientId,
        caseId,
        title: title.trim() || file.name,
        file,
      });

      setUploadOpen(false);
      setTitle('');
      setFile(null);
      setSaving(false);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao enviar arquivo.');
      setSaving(false);
    }
  }

  async function onDownload(doc: DocumentRow) {
    try {
      const url = await getDocumentDownloadUrl(doc.file_path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      setError(e?.message || 'Falha ao gerar link de download.');
    }
  }

  async function onDelete(doc: DocumentRow) {
    if (!confirm('Excluir este anexo?')) return;

    try {
      await deleteDocument({ id: doc.id, file_path: doc.file_path });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao excluir anexo.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Anexos da tarefa</div>
          <div className="text-xs text-white/60">Arquivos internos vinculados a esta tarefa.</div>
        </div>

        <button onClick={() => setUploadOpen(true)} className="btn-primary">
          Enviar arquivo
        </button>
      </div>

      {clientId ? null : (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          Dica: esta tarefa está sem cliente. Para anexar arquivos, primeiro vincule um cliente.
        </div>
      )}

      {error ? <div className="text-sm text-red-200">{error}</div> : null}

      {uploadOpen ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-white/80">
              Título
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Print do atendimento" />
            </label>
            <label className="text-sm text-white/80">
              Arquivo
              <input
                className="input"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                accept="application/pdf,image/*,.doc,.docx"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button disabled={saving || !file} onClick={() => void onUpload()} className="btn-primary">
              {saving ? 'Enviando…' : 'Enviar'}
            </button>
            <button disabled={saving} onClick={() => setUploadOpen(false)} className="btn-ghost">
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-white/5">
        {loading ? <div className="p-4 text-sm text-white/70">Carregando…</div> : null}

        {!loading && rows.length === 0 ? <div className="p-4 text-sm text-white/60">Nenhum anexo.</div> : null}

        {!loading && rows.length ? (
          <div className="divide-y divide-white/10">
            {rows.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="text-sm font-semibold text-white">{d.title}</div>
                  <div className="mt-1 text-xs text-white/50">
                    {new Date(d.created_at).toLocaleString()} {d.mime_type ? `· ${d.mime_type}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => void onDownload(d)} className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs">
                    Baixar
                  </button>
                  <button onClick={() => void onDelete(d)} className="btn-ghost !rounded-lg !px-3 !py-1.5 !text-xs">
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
