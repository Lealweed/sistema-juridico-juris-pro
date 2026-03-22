import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Folder,
  Home,
  LogOut,
  MessageCircle,
  Upload,
  User,
} from 'lucide-react';
import {
  getPortalClientContext,
  getPortalRpcError,
  listPortalClientDocuments,
  listPortalClientMessages,
  listPortalClientTransactions,
  loginClientPortal,
  sendPortalClientMessage,
  type PortalClient,
  type PortalMeeting,
  type PortalMessage,
} from '@/lib/clientPortal';
import { ClientAvatar } from '@/ui/widgets/ClientAvatar';
import type { DocumentRow } from '@/lib/documents';
import { centsToBRL, type FinanceTx } from '@/lib/finance';
import { hasSupabaseEnv, supabase } from '@/lib/supabaseClient';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const PORTAL_USER_ID = '00000000-0000-0000-0000-000000000000';

type PortalState = 'login' | 'authenticated';
type TabKey = 'home' | 'drive' | 'finance' | 'messages';

export function ClientPortalPage() {
  // Utilitários
  function onlyDigits(value: string) {
    return value.replace(/\D/g, '');
  }

  function cleanPortalNotice(value: string | null | undefined) {
    if (!value) return null;
    return value
      .replace(/\[#origem:[^\]]+\]\s*/gi, '')
      .replace(/Nacionalidade:\s*[^\n]+\n?/gi, '')
      .trim() || null;
  }


  function formatCpfMask(value: string) {
    const digits = onlyDigits(value).slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  // Estados principais
  const [state, setState] = useState<PortalState>(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('clientPortalSessionToken')) {
      return 'authenticated';
    }
    return 'login';
  });
  const [portalSessionToken, setPortalSessionToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem('clientPortalSessionToken');
  });
  const [client, setClient] = useState<PortalClient | null>(() => {
    if (typeof window === 'undefined') return null;
    const storedClient = sessionStorage.getItem('clientPortalClient');
    if (!storedClient) return null;
    try {
      return JSON.parse(storedClient) as PortalClient;
    } catch {
      return null;
    }
  });
  const [cpfInput, setCpfInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<TabKey>('home');

  // Home
  const [clientNotes, setClientNotes] = useState<string | null>(null);
  const [nextMeeting, setNextMeeting] = useState<PortalMeeting | null>(null);
  // Drive
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Financeiro
  const [transactions, setTransactions] = useState<FinanceTx[]>([]);
  const [financeLoading, setFinanceLoading] = useState(false);
  // Mensagens
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const showLegacyCards =
    typeof window !== 'undefined'
      && Boolean((window as Window & { __portalLegacyCards?: boolean }).__portalLegacyCards);

  // Fetch dados do cliente ao autenticar
  useEffect(() => {
    if (state !== 'authenticated' || !portalSessionToken) return;

    getPortalClientContext(portalSessionToken)
      .then(({ client: portalClient, nextMeeting }) => {
        setAuthError(null);
        setClient(portalClient);
        setClientNotes(cleanPortalNotice(portalClient.notes));
        setNextMeeting(nextMeeting);
      })
      .catch((err) => {
        setAuthError(getPortalRpcError(err, 'Sessao do portal invalida. Faca login novamente.'));
        setPortalSessionToken(null);
        setClient(null);
        setClientNotes(null);
        setNextMeeting(null);
        setMessages([]);
        setState('login');
      });
  }, [state, portalSessionToken]);

  // Fetch documentos
  useEffect(() => {
    if (tab !== 'drive' || !portalSessionToken) return;

    setDocsLoading(true);
    listPortalClientDocuments(portalSessionToken)
      .then(setDocuments)
      .catch(() => setDocuments([]))
      .finally(() => setDocsLoading(false));
  }, [tab, portalSessionToken]);

  // Fetch transações financeiras
  useEffect(() => {
    if (tab !== 'finance' || !portalSessionToken) return;

    setFinanceLoading(true);
    listPortalClientTransactions(portalSessionToken)
      .then(setTransactions)
      .catch(() => setTransactions([]))
      .finally(() => setFinanceLoading(false));
  }, [tab, portalSessionToken]);

  // Fetch mensagens
  useEffect(() => {
    if (tab !== 'messages' || !portalSessionToken) return;

    setMessagesError(null);
    listPortalClientMessages(portalSessionToken)
      .then(setMessages)
      .catch((err) => {
        setMessages([]);
        setMessagesError(getPortalRpcError(err, 'Nao foi possivel carregar as mensagens.'));
      });
  }, [tab, portalSessionToken]);

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
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, 'Falha ao enviar documento.'));
    } finally {
      setUploading(false);
    }
  }

  // Mantém sessão autenticada
  useEffect(() => {
    if (state === 'authenticated' && portalSessionToken) {
      sessionStorage.setItem('clientPortalSessionToken', portalSessionToken);
      if (client) {
        sessionStorage.setItem('clientPortalClient', JSON.stringify(client));
      }
    }
    if (state === 'login') {
      sessionStorage.removeItem('clientPortalId');
      sessionStorage.removeItem('clientPortalSessionToken');
      sessionStorage.removeItem('clientPortalClient');
    }
  }, [state, portalSessionToken, client]);

  function getErrorMessage(err: unknown, fallback: string) {
    if (err instanceof Error && err.message) return err.message;
    return fallback;
  }

  /* ── Layout ── */

  function handlePortalExit() {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('clientPortalId');
      sessionStorage.removeItem('clientPortalSessionToken');
      sessionStorage.removeItem('clientPortalClient');
    }
    setPortalSessionToken(null);
    setClient(null);
    setClientNotes(null);
    setNextMeeting(null);
    setMessages([]);
    setDocuments([]);
    setTransactions([]);
    setTab('home');
    setState('login');
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  }

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
              if (cpfLimpo.length !== 11) throw new Error('CPF invÃ¡lido.');
              if (!pinInput.trim()) throw new Error('Informe sua senha numÃ©rica (PIN).');
              const portalLogin = await loginClientPortal(cpfLimpo, pinInput.trim());
              setPortalSessionToken(portalLogin.sessionToken);
              setClient(portalLogin.client);
              setClientNotes(cleanPortalNotice(portalLogin.client.notes));
              setState('authenticated');
              return;
              if (cpfLimpo.length !== 11) throw new Error('CPF inválido.');
              if (!pinInput.trim()) throw new Error('Informe sua senha numérica (PIN).');
              if (!supabase) throw new Error('Portal indisponível no momento.');
              const { data, error } = await (supabase as NonNullable<typeof supabase>)
                .rpc('login_client_portal', { p_cpf: cpfLimpo, p_pin: pinInput.trim() })
                .maybeSingle();
              if (error) throw new Error(error?.message || 'CPF ou Senha incorretos.');
              const result = data as { id: string, name: string } | null;
              if (!result?.id) throw new Error('CPF ou Senha incorretos.');
              setClient({ id: result?.id || '', name: result?.name || '' });
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
              <div className="relative mt-1">
                <input
                  className="input w-full pr-10"
                  value={pinInput}
                  onChange={(e) => setPinInput(onlyDigits(e.target.value).slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="PIN numérico"
                  type={showPin ? "text" : "password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-white/40 hover:text-white/80"
                  tabIndex={-1}
                >
                  {showPin ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
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

  // --- Layout com Abas ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0c10] via-[#10131a] to-[#181c24] flex flex-col items-center px-0 py-0">
      <div className="mt-10 mb-4 flex w-full max-w-xl items-center justify-between gap-4 px-4">
        <img src="/brand/logo.jpg" alt="Lima, Lopes & Diógenes" className="h-20 w-auto rounded-2xl border-2 border-white/10 shadow-2xl" />
        <button
          type="button"
          onClick={handlePortalExit}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <LogOut className="size-4" />
          Sair
        </button>
      </div>
      {/* Dados do cliente no topo */}
      {state === 'authenticated' && client && (
        <div className="flex flex-col items-center gap-3 mt-2 mb-6">
          <div className="flex items-center gap-4">
            {/* Avatar do cliente */}
            <ClientAvatar name={client.name} avatarPath={client.avatar_path} size={72} />
            <div>
              <div className="text-2xl font-bold text-white font-[Space_Grotesk] drop-shadow-lg">{client.name}</div>
              <div className="text-sm text-white/70 font-[Inter]">{client.email || '—'}</div>
            </div>
          </div>
          <div className="flex gap-6 text-base text-white/90 mt-2 font-[Inter]">
            <span className="flex items-center gap-1"><span className="text-amber-300">📱</span> {client.phone || '—'}</span>
            <span className="flex items-center gap-1"><span className="text-amber-300">💬</span> {client.whatsapp || '—'}</span>
          </div>
        </div>
      )}
      <div className="flex-1 w-full max-w-xl mx-auto flex flex-col mt-2">
        <nav className="fixed bottom-0 left-0 right-0 z-10 flex justify-around bg-black/70 backdrop-blur border-t border-white/10 py-3 md:static md:rounded-2xl md:border md:bg-white/5 md:mb-6">
          <button className={`flex flex-col items-center gap-1 px-2 ${tab === 'home' ? 'text-amber-300' : 'text-white/60'}`} onClick={() => setTab('home')}><Home className="size-6" /><span className="text-xs">Início</span></button>
          <button className={`flex flex-col items-center gap-1 px-2 ${tab === 'drive' ? 'text-amber-300' : 'text-white/60'}`} onClick={() => setTab('drive')}><Folder className="size-6" /><span className="text-xs">Arquivos</span></button>
          <button className={`flex flex-col items-center gap-1 px-2 ${tab === 'finance' ? 'text-amber-300' : 'text-white/60'}`} onClick={() => setTab('finance')}><CreditCard className="size-6" /><span className="text-xs">Financeiro</span></button>
          <button className={`flex flex-col items-center gap-1 px-2 ${tab === 'messages' ? 'text-amber-300' : 'text-white/60'}`} onClick={() => setTab('messages')}><MessageCircle className="size-6" /><span className="text-xs">Mensagens</span></button>
        </nav>
        <div className="flex-1 w-full px-4 py-6 md:rounded-2xl md:border md:border-white/10 md:bg-white/5 md:mt-4 md:mb-4 min-h-[60vh]">
          {showLegacyCards && (
            <div className="space-y-6">
              <div className="rounded-xl border border-amber-300/30 bg-amber-400/5 p-4">
                <div className="font-semibold text-white mb-1">Aviso do Advogado</div>
                <div className="text-sm text-white/80 min-h-[32px]">{clientNotes}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="font-semibold text-white mb-1">Próxima Consulta/Reunião</div>
                {nextMeeting ? (
                  <div className="text-sm text-white/80">
                    <span className="font-medium">{nextMeeting?.title}</span><br />
                    <span className="text-xs text-white/60">{new Date(nextMeeting?.starts_at ?? '').toLocaleString('pt-BR')}</span>
                  </div>
                ) : <div className="text-sm text-white/40">Nenhuma consulta agendada.</div>}
              </div>
            </div>
          )}
          {showLegacyCards && (
            <div className="space-y-6">
              <div className="rounded-xl border border-amber-300/30 bg-amber-400/5 p-4">
                <div className="font-semibold text-white mb-1">Aviso do Advogado</div>
                <div className="text-sm text-white/80 min-h-[32px]">{clientNotes}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="font-semibold text-white mb-1">Próxima Consulta/Reunião</div>
                {nextMeeting ? (
                  <div className="text-sm text-white/80">
                    <span className="font-medium">{nextMeeting?.title}</span><br />
                    <span className="text-xs text-white/60">{new Date(nextMeeting?.starts_at ?? '').toLocaleString('pt-BR')}</span>
                  </div>
                ) : <div className="text-sm text-white/40">Nenhuma consulta agendada.</div>}
              </div>
            </div>
          )}
          {tab === 'home' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-amber-300/30 bg-amber-400/5 p-4">
                <div className="font-semibold text-white mb-1">Aviso do Advogado</div>
                <div className="text-sm text-white/80 min-h-[32px]">{clientNotes}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="font-semibold text-white mb-1">Próxima Consulta/Reunião</div>
                {nextMeeting ? (
                  <div className="text-sm text-white/80">
                    <span className="font-medium">{nextMeeting.title}</span><br />
                    <span className="text-xs text-white/60">{new Date(nextMeeting.starts_at).toLocaleString('pt-BR')}</span>
                  </div>
                ) : <div className="text-sm text-white/40">Nenhuma consulta agendada.</div>}
              </div>
            </div>
          )}
          {tab === 'drive' && (
            <div className="space-y-6">
              <label className={`relative flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${uploading ? 'border-amber-400/40 bg-amber-400/5' : 'border-white/15 bg-white/5 hover:border-amber-300/40 hover:bg-white/10'}`}>
                <Upload className={`size-8 ${uploading ? 'animate-bounce text-amber-400' : 'text-white/40'}`} />
                <span className="text-sm font-medium text-white">{uploading ? 'Enviando...' : 'Anexar Documentos'}</span>
                <span className="text-xs text-white/40">Imagens ou PDF • Máx. 25 MB cada</span>
                <input ref={fileRef} type="file" accept="image/*,.pdf" multiple className="absolute inset-0 cursor-pointer opacity-0" onChange={handleFiles} disabled={uploading} />
              </label>

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

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="font-semibold text-white mb-2">Meus Arquivos</div>
                {docsLoading ? <div className="text-white/40 text-sm">Carregando...</div> : documents.length > 0 ? (
                  <ul className="space-y-2">
                    {documents.map((doc) => (
                      <li key={doc.id} className="flex items-center gap-2 text-sm text-white/80">
                        <FileText className="size-4 text-amber-300" />
                        <span className="truncate">{doc.title}</span>
                      </li>
                    ))}
                  </ul>
                ) : <div className="text-white/40 text-sm">Nenhum arquivo enviado.</div>}
              </div>
            </div>
          )}
          {tab === 'finance' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="font-semibold text-white mb-2">Financeiro</div>
                {financeLoading ? <div className="text-white/40 text-sm">Carregando...</div> : transactions.length > 0 ? (
                  <ul className="space-y-3">
                    {transactions.map((tx) => (
                      <li key={tx.id} className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                        <div>
                          <div className="text-white/80">{tx.description || 'Parcela'}</div>
                          <div className="text-xs text-white/40">
                            {tx.due_date ? new Date(tx.due_date).toLocaleDateString('pt-BR') : 'Sem vencimento'}
                          </div>
                        </div>
                        <div className={`font-medium ${tx.status === 'paid' ? 'text-green-400' : 'text-amber-400'}`}>
                          {centsToBRL(tx.amount_cents)}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <div className="text-white/40 text-sm">Nenhuma movimentação encontrada.</div>}
              </div>
            </div>
          )}
          {tab === 'messages' && (
            <div className="flex flex-col h-full min-h-[50vh]">
              <div className="flex-1 overflow-y-auto space-y-3 mb-2 pr-1 max-h-[50vh]">
                {messagesError && (
                  <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
                    {messagesError}
                  </div>
                )}
                {messages.length === 0 && (
                  <div className="text-white/40 text-sm">Nenhuma mensagem.</div>
                )}
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex items-start gap-2 ${msg.sender === 'client' ? 'flex-row-reverse' : ''}`}>
                    {msg.sender === 'client' ? (
                      <ClientAvatar name={client?.name || 'Cliente'} avatarPath={client?.avatar_path} size={32} />
                    ) : (
                      <div className="rounded-full bg-amber-300/80 flex items-center justify-center w-8 h-8">
                        <User className="text-black/80 w-5 h-5" />
                      </div>
                    )}
                    <div className={`rounded-2xl px-4 py-2 max-w-[70%] text-sm shadow ${msg.sender === 'client' ? 'bg-amber-400/20 text-white/90' : 'bg-white/10 text-white/80'}`}>
                      <div>{msg.content}</div>
                      <div className="text-xs text-white/40 mt-1 text-right">{new Date(msg.created_at).toLocaleString('pt-BR')}</div>
                    </div>
                  </div>
                ))}
              </div>
              <form className="flex gap-2 mt-auto" onSubmit={async (e) => {
                e.preventDefault();
                if (!messageInput.trim() || !portalSessionToken) return;
                setSendingMsg(true);
                setMessagesError(null);
                try {
                  await sendPortalClientMessage(portalSessionToken, messageInput.trim());
                  setMessageInput('');
                  setMessages(await listPortalClientMessages(portalSessionToken));
                } catch (err) {
                  setMessagesError(getPortalRpcError(err, 'Nao foi possivel enviar sua mensagem.'));
                } finally {
                  setSendingMsg(false);
                }
              }}>
                <input
                  className="flex-1 rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white placeholder:text-white/40"
                  placeholder="Digite sua mensagem..."
                  value={messageInput}
                  onChange={e => setMessageInput(e.target.value)}
                  disabled={sendingMsg}
                />
                <button type="submit" className="btn-primary" disabled={sendingMsg || !messageInput.trim()}>Enviar</button>
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
