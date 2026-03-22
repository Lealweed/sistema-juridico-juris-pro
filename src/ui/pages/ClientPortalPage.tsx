import { useRef, useState, useEffect } from 'react';
import { Upload, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import { hasSupabaseEnv, supabase } from '@/lib/supabaseClient';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const PORTAL_USER_ID = '00000000-0000-0000-0000-000000000000';

type PortalState = 'login' | 'authenticated';

type PortalClient = {
  id: string;
  name: string;
};

export function ClientPortalPage() {
  function onlyDigits(value: string) {
    return value.replace(/\D/g, '');
  }

  function formatCpfMask(value: string) {
    const digits = onlyDigits(value).slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  const [state, setState] = useState<PortalState>(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('clientPortalId')) {
      return 'authenticated';
    }
    return 'login';
  });
  const [client, setClient] = useState<PortalClient | null>(null);
  const [cpfInput, setCpfInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function getErrorMessage(err: unknown, fallback: string) {
    if (err instanceof Error && err.message) return err.message;
    return fallback;
  }

  // Mantém sessão autenticada
  useEffect(() => {
    if (state === 'authenticated' && client?.id) {
      sessionStorage.setItem('clientPortalId', client.id);
    }
    if (state === 'login') {
      sessionStorage.removeItem('clientPortalId');
    }
  }, [state, client]);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length || !client?.id || !supabase) return;

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
        const path = `clients/${client.id}/portal/${docId}_${safeName}`;

        const { error: upErr } = await supabase.storage
          .from('documents')
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) throw new Error(upErr.message);

        const { error: insErr } = await supabase.from('documents').insert({
          id: docId,
          user_id: PORTAL_USER_ID,
          client_id: client.id,
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
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, 'Falha ao enviar documento.'));
    } finally {
      setUploading(false);
    }
  }

  /* ── Layout ── */

  if (!hasSupabaseEnv || !supabase) {
    return (
      <div className="min-h-screen bg-[#08090b] flex flex-col items-center justify-center gap-4 px-4">
        <AlertTriangle className="size-12 text-red-400" />
        <h1 className="text-xl font-semibold text-white">Portal Indisponível</h1>
        <p className="text-sm text-white/50 text-center max-w-sm">
          Configuração de ambiente não encontrada para acessar o portal do cliente.
        </p>
      </div>
    );
  }

  if (state === 'login') {
    return (
      <div className="min-h-screen bg-[#08090b] flex flex-col items-center px-4 py-8">
        <img
          src="/brand/logo.jpg"
          alt="Lima, Lopes & Diógenes"
          className="h-16 w-auto rounded-xl shadow-lg"
        />
        <div className="mt-8 w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-xl font-semibold text-white">Acessar Meu Portal</h1>
          <p className="mt-2 text-sm text-white/60">Informe seu CPF e sua Senha Numérica (PIN) para acessar o portal.</p>

          <form className="mt-5 grid gap-3" onSubmit={async (e) => {
            e.preventDefault();
            setAuthLoading(true);
            setAuthError(null);
            try {
              const cpfLimpo = onlyDigits(cpfInput);
              if (cpfLimpo.length !== 11) throw new Error('CPF inválido.');
              if (!pinInput.trim()) throw new Error('Informe sua senha numérica (PIN).');
              if (!supabase) throw new Error('Portal indisponível no momento.');
              const { data, error } = await supabase
                .from('clients')
                .select('id,name')
                .eq('cpf', cpfLimpo)
                .eq('portal_pin', pinInput.trim())
                .maybeSingle();
              if (error) throw new Error(error.message);
              if (!data?.id) throw new Error('CPF ou Senha incorretos.');
              setClient({ id: data.id, name: data.name });
              setState('authenticated');
            } catch (err) {
              setAuthError(getErrorMessage(err, 'CPF ou Senha incorretos.'));
            } finally {
              setAuthLoading(false);
            }
          }}>
            <label className="text-sm text-white/80">
              CPF
              <input
                className="input mt-1"
                value={cpfInput}
                onChange={(e) => setCpfInput(formatCpfMask(e.target.value))}
                inputMode="numeric"
                maxLength={14}
                placeholder="000.000.000-00"
                autoFocus
              />
            </label>
            <label className="text-sm text-white/80">
              Senha (PIN)
              <input
                className="input mt-1"
                value={pinInput}
                onChange={(e) => setPinInput(onlyDigits(e.target.value).slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
                placeholder="PIN numérico"
                type="password"
              />
            </label>
            {authError ? (
              <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">{authError}</div>
            ) : null}
            <button className="btn-primary mt-1" type="submit" disabled={authLoading}>
              {authLoading ? 'Acessando...' : 'Acessar meu Portal'}
            </button>
          </form>
        </div>
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
            Olá, {client?.name?.split(' ')[0]}!
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
            {uploading ? 'Enviando…' : 'Anexar Documentos'}
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
