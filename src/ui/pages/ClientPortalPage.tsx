import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Upload, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import { hasSupabaseEnv, supabase } from '@/lib/supabaseClient';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const PORTAL_USER_ID = '00000000-0000-0000-0000-000000000000';

export function ClientPortalPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [clientName, setClientName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!clientId || !hasSupabaseEnv || !supabase) {
      setInvalid(true);
      setLoading(false);
      return;
    }

    supabase
      .from('clients')
      .select('name')
      .eq('id', clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          setInvalid(true);
        } else {
          setClientName(data.name);
        }
        setLoading(false);
      });
  }, [clientId]);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length || !clientId || !supabase) return;

    setUploading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > MAX_UPLOAD_BYTES) {
          throw new Error(`"${file.name}" excede 25 MB.`);
        }

        const docId = crypto.randomUUID();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `clients/${clientId}/portal/${docId}_${safeName}`;

        const { error: upErr } = await supabase.storage
          .from('documents')
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) throw new Error(upErr.message);

        const { error: insErr } = await supabase.from('documents').insert({
          id: docId,
          user_id: PORTAL_USER_ID,
          client_id: clientId,
          kind: 'personal',
          title: `Portal: ${file.name}`,
          file_path: path,
          mime_type: file.type || null,
          size_bytes: file.size || null,
          is_public: true,
        });

        if (insErr) {
          await supabase.storage.from('documents').remove([path]).catch(() => null);
          throw new Error(insErr.message);
        }
      }

      setSuccessMsg(
        files.length === 1
          ? 'Documento recebido com sucesso!'
          : `${files.length} documentos recebidos com sucesso!`,
      );
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: any) {
      setErrorMsg(err?.message || 'Falha ao enviar documento.');
    } finally {
      setUploading(false);
    }
  }

  /* ── Layout ── */

  if (loading) {
    return (
      <div className="min-h-screen bg-[#08090b] flex items-center justify-center">
        <p className="text-white/50 animate-pulse">Carregando…</p>
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="min-h-screen bg-[#08090b] flex flex-col items-center justify-center gap-4 px-4">
        <AlertTriangle className="size-12 text-red-400" />
        <h1 className="text-xl font-semibold text-white">Link Inválido</h1>
        <p className="text-sm text-white/50 text-center max-w-sm">
          Este link de portal não corresponde a nenhum cliente cadastrado. Verifique com seu advogado.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08090b] flex flex-col items-center px-4 py-8">
      {/* Logo */}
      <img
        src="/brand/logo.jpg"
        alt="Lima, Lopes & Diógenes"
        className="h-16 w-auto rounded-xl shadow-lg"
      />

      <div className="mt-8 w-full max-w-md space-y-6">
        {/* Boas-vindas */}
        <div className="text-center">
          <h1 className="text-xl font-semibold text-white">
            Olá, {clientName?.split(' ')[0]}!
          </h1>
          <p className="mt-2 text-sm text-white/60">
            Envie os documentos solicitados pelo seu advogado abaixo.
          </p>
        </div>

        {/* Upload Area */}
        <label
          className={`relative flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed
                      p-10 text-center transition-colors
                      ${uploading ? 'border-amber-400/40 bg-amber-400/5' : 'border-white/15 bg-white/5 hover:border-amber-300/40 hover:bg-white/10'}`}
        >
          <Upload className={`size-10 ${uploading ? 'animate-bounce text-amber-400' : 'text-white/40'}`} />
          <span className="text-sm font-medium text-white">
            {uploading ? 'Enviando…' : 'Toque aqui para anexar documentos'}
          </span>
          <span className="text-xs text-white/40">Imagens ou PDF • Máx. 25 MB cada</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={handleFiles}
            disabled={uploading}
          />
        </label>

        {/* Feedback */}
        {successMsg && (
          <div className="flex items-center gap-3 rounded-xl border border-green-400/30 bg-green-400/10 p-4">
            <CheckCircle2 className="size-5 shrink-0 text-green-300" />
            <span className="text-sm text-green-200">{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="flex items-center gap-3 rounded-xl border border-red-400/30 bg-red-400/10 p-4">
            <AlertTriangle className="size-5 shrink-0 text-red-300" />
            <span className="text-sm text-red-200">{errorMsg}</span>
          </div>
        )}

        {/* Info footer */}
        <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 p-4">
          <FileText className="mt-0.5 size-4 shrink-0 text-amber-300/70" />
          <p className="text-xs leading-relaxed text-white/50">
            Seus documentos são enviados de forma segura diretamente ao sistema do escritório.
            Apenas a equipe autorizada terá acesso.
          </p>
        </div>
      </div>

      <p className="mt-12 text-[11px] text-white/30">
        Lima, Lopes &amp; Diógenes Advogados &bull; Portal do Cliente
      </p>
    </div>
  );
}
