import { useRef, useState, useEffect } from 'react';
import { Upload, Home, Folder, CreditCard, MessageCircle } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { listClientDocuments } from '@/lib/documents';
import { loadClientTransactions } from '@/lib/finance';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const PORTAL_USER_ID = '00000000-0000-0000-0000-000000000000';

type PortalState = 'login' | 'authenticated';
type PortalClient = { id: string; name: string };
type TabKey = 'home' | 'drive' | 'finance' | 'messages';

export function ClientPortalPage() {
  // Utilitários
  function onlyDigits(value: string) {
    return value.replace(/\D/g, '');
  }

  // Estados principais
  const [state] = useState<PortalState>(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('clientPortalId')) {
      return 'authenticated';
    }
    return 'login';
  });
  const [client] = useState<PortalClient | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<TabKey>('home');

  // Home
  const [clientNotes] = useState<string | null>(null);
  const [nextMeeting] = useState<any>(null);
  // Drive
  const [documents] = useState<any[]>([]);
  const [docsLoading] = useState(false);
  const [uploading] = useState(false);
  const [successMsg] = useState<string | null>(null);
  const [errorMsg] = useState<string | null>(null);
  // Financeiro
  const [transactions] = useState<any[]>([]);
  const [financeLoading] = useState(false);
  // Mensagens
  const [messages] = useState<any[]>([]);
  const [messageInput] = useState('');
  const [sendingMsg] = useState(false);

  // Fetch dados do cliente ao autenticar
  useEffect(() => {
    if (state === 'authenticated' && client?.id && supabase) {
      supabase.from('clients').select('notes').eq('id', client.id).maybeSingle().then(({ data }) => {
        setClientNotes(data?.notes || null);
      });
      supabase.from('agenda_items')
        .select('id,title,start_at')
        .eq('client_id', client.id)
        .gt('start_at', new Date().toISOString())
        .order('start_at', { ascending: true })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => setNextMeeting(data || null));
    }
  }, [state, client]);

  // Fetch documentos
  useEffect(() => {
    if (tab === 'drive' && client?.id) {
      setDocsLoading(true);
      listClientDocuments(client.id)
        .then(setDocuments)
        .catch(() => setDocuments([]))
        .finally(() => setDocsLoading(false));
    }
  }, [tab, client]);

  // Fetch transações financeiras
  useEffect(() => {
    if (tab === 'finance' && client?.id) {
      setFinanceLoading(true);
      loadClientTransactions(client.id)
        .then(setTransactions)
        .catch(() => setTransactions([]))
        .finally(() => setFinanceLoading(false));
    }
  }, [tab, client]);

  // Fetch mensagens
  useEffect(() => {
    if (tab === 'messages' && client?.id && supabase) {
      supabase.from('client_messages')
        .select('id,sender,content,created_at')
        .eq('client_id', client.id)
        .order('created_at', { ascending: true })
        .then(({ data }) => setMessages(data || []));
    }
  }, [tab, client]);

  // Upload de arquivos
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
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao enviar documento.');
    } finally {
      setUploading(false);
    }
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

  // --- Layout com Abas ---
  return (
    <div className="min-h-screen bg-[#08090b] flex flex-col items-center px-0 py-0">
      <img src="/brand/logo.jpg" alt="Lima, Lopes & Diógenes" className="h-16 w-auto rounded-xl shadow-lg mt-6" />
      <div className="flex-1 w-full max-w-md mx-auto flex flex-col mt-4">
        {/* Abas */}
        <nav className="fixed bottom-0 left-0 right-0 z-10 flex justify-around bg-black/70 backdrop-blur border-t border-white/10 py-2 md:static md:rounded-2xl md:border md:bg-white/5 md:mb-4">
          <button className={`flex flex-col items-center gap-1 px-2 ${tab === 'home' ? 'text-amber-300' : 'text-white/60'}`} onClick={() => setTab('home')}><Home className="size-6" /><span className="text-xs">Início</span></button>
          <button className={`flex flex-col items-center gap-1 px-2 ${tab === 'drive' ? 'text-amber-300' : 'text-white/60'}`} onClick={() => setTab('drive')}><Folder className="size-6" /><span className="text-xs">Arquivos</span></button>
          <button className={`flex flex-col items-center gap-1 px-2 ${tab === 'finance' ? 'text-amber-300' : 'text-white/60'}`} onClick={() => setTab('finance')}><CreditCard className="size-6" /><span className="text-xs">Financeiro</span></button>
          <button className={`flex flex-col items-center gap-1 px-2 ${tab === 'messages' ? 'text-amber-300' : 'text-white/60'}`} onClick={() => setTab('messages')}><MessageCircle className="size-6" /><span className="text-xs">Mensagens</span></button>
        </nav>
        <div className="flex-1 w-full px-4 py-6 md:rounded-2xl md:border md:border-white/10 md:bg-white/5 md:mt-4 md:mb-4 min-h-[60vh]">
          {/* Conteúdo das Abas */}
          {tab === 'home' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-amber-300/30 bg-amber-400/5 p-4">
                <div className="font-semibold text-white mb-1">Aviso do Advogado</div>
                <div className="text-sm text-white/80 min-h-[32px]">{clientNotes || 'Nenhum recado no momento.'}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="font-semibold text-white mb-1">Próxima Consulta/Reunião</div>
                {nextMeeting ? (
                  <div className="text-sm text-white/80">
                    <span className="font-medium">{nextMeeting.title}</span><br />
                    <span className="text-xs text-white/60">{new Date(nextMeeting.start_at).toLocaleString('pt-BR')}</span>
                  </div>
                ) : <div className="text-sm text-white/40">Nenhuma consulta agendada.</div>}
              </div>
            </div>
          )}
          {tab === 'drive' && (
            <div className="space-y-6">
              <label className={`relative flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors`}>
                <Upload className="size-8 text-white/40" />
                <span className="text-sm font-medium text-white">Anexar Documentos</span>
                <span className="text-xs text-white/40">Imagens ou PDF • Máx. 25 MB cada</span>
                <input ref={fileRef} type="file" accept="image/*,.pdf" multiple className="absolute inset-0 cursor-pointer opacity-0" disabled />
              </label>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="font-semibold text-white mb-2">Meus Arquivos</div>
                <div className="text-white/40 text-sm">Nenhum arquivo enviado.</div>
              </div>
            </div>
          )}
          {tab === 'finance' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="font-semibold text-white mb-2">Financeiro</div>
                <div className="text-white/40 text-sm">Nenhuma movimentação encontrada.</div>
              </div>
            </div>
          )}
          {tab === 'messages' && (
            <div className="flex flex-col h-full min-h-[50vh]">
              <div className="flex-1 overflow-y-auto space-y-2 mb-2">
                <div className="text-white/40 text-sm">Nenhuma mensagem.</div>
              </div>
              <form className="flex gap-2 mt-auto">
                <input className="flex-1 rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" placeholder="Digite sua mensagem..." disabled />
                <button type="submit" className="btn-primary" disabled>Enviar</button>
              </form>
            </div>
          )}
        </div>
      </div>
      <p className="mt-12 text-[11px] text-white/30 mb-24 md:mb-0">
        Lima, Lopes &amp; Diógenes Advogados &bull; Portal do Cliente
      </p>
    </div>
  );
}
