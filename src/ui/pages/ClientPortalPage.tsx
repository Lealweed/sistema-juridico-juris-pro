import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
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
import { subscribeToPortalMessages } from '@/lib/clientPortal';
import { ClientAvatar } from '@/ui/widgets/ClientAvatar';
import type { DocumentRow } from '@/lib/documents';
import { centsToBRL, type FinanceTx } from '@/lib/finance';
import { hasSupabaseEnv, supabase } from '@/lib/supabaseClient';
import { DOCS_BUCKET } from '@/lib/documents';
import { listReceipts, type Receipt } from '@/lib/receipts';
import toast from 'react-hot-toast';
import { AppToaster } from '@/ui/widgets/AppToaster';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MESSAGE_NOTIFICATION_COOLDOWN_MS = 5000;
const MESSAGE_BADGE_STORAGE_PREFIX = 'clientPortalLastSeenMessageAt:';
const PORTAL_NOTIFICATION_TAG = 'client-portal-office-message';
const PORTAL_MESSAGES_POLL_INTERVAL_MS = 8000;

type PortalState = 'login' | 'authenticated';
type TabKey = 'home' | 'drive' | 'finance' | 'messages';
type BrowserNotificationState = NotificationPermission | 'unsupported';

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

  function getMessageSeenStorageKey(clientId: string) {
    return `${MESSAGE_BADGE_STORAGE_PREFIX}${clientId}`;
  }

  function getLatestMessageTimestamp(items: PortalMessage[]) {
    return items.length ? items[items.length - 1]?.created_at || null : null;
  }

  function getLatestMessageTimestampBySender(items: PortalMessage[], sender: PortalMessage['sender']) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (items[index]?.sender === sender) return items[index]?.created_at || null;
    }
    return null;
  }

  function countUnreadOfficeMessages(items: PortalMessage[], lastSeenAt: string | null) {
    if (!lastSeenAt) return 0;
    const lastSeenMs = new Date(lastSeenAt).getTime();
    return items.filter((item) => item.sender === 'office' && new Date(item.created_at).getTime() > lastSeenMs).length;
  }

  function mergePortalMessages(current: PortalMessage[], incoming: PortalMessage) {
    if (current.some((item) => item.id === incoming.id)) return current;
    return [...current, incoming].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }

  function formatRelativePortalTime(value: string | null) {
    if (!value) return 'Sem atividade recente';
    const diffMs = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(diffMs)) return 'Sem atividade recente';

    const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
    if (diffMinutes < 1) return 'Agora há pouco';
    if (diffMinutes < 60) return `Há ${diffMinutes} min`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Há ${diffHours} h`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `Há ${diffDays} dia${diffDays === 1 ? '' : 's'}`;

    return new Date(value).toLocaleDateString('pt-BR');
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
  // Recibos
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
    // Fetch recibos do cliente autenticado
    useEffect(() => {
      if (tab !== 'finance' || !client?.id) return;
      setReceiptsLoading(true);
      listReceipts(100)
        .then(rs => setReceipts(rs.filter(r => r.client_id === client.id)))
        .catch(() => setReceipts([]))
        .finally(() => setReceiptsLoading(false));
    }, [tab, client]);
  // Mensagens
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState<BrowserNotificationState>('default');
  const showLegacyCards =
    typeof window !== 'undefined'
      && Boolean((window as Window & { __portalLegacyCards?: boolean }).__portalLegacyCards);
  const messagesWrapRef = useRef<HTMLDivElement | null>(null);
  const isMessagesTabActiveRef = useRef(false);
  const notificationAudioContextRef = useRef<AudioContext | null>(null);
  const hasAudioPermissionRef = useRef(false);
  const hasNotificationPermissionRef = useRef(false);
  const lastNotificationAtRef = useRef(0);
  const hydratedClientIdRef = useRef<string | null>(null);
  const messagesRef = useRef<PortalMessage[]>([]);

  function syncNotificationPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      hasNotificationPermissionRef.current = false;
      return false;
    }
    hasNotificationPermissionRef.current = window.Notification.permission === 'granted';
    setNotificationPermission(window.Notification.permission);
    return hasNotificationPermissionRef.current;
  }

  const requestPortalNotificationPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      hasNotificationPermissionRef.current = false;
      return false;
    }

    try {
      const permission = await window.Notification.requestPermission();
      hasNotificationPermissionRef.current = permission === 'granted';
      setNotificationPermission(permission);
      return permission === 'granted';
    } catch {
      hasNotificationPermissionRef.current = false;
      setNotificationPermission(window.Notification.permission);
      return false;
    }
  }, []);

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
        setMessagesLoaded(false);
        setUnreadMessagesCount(0);
        hydratedClientIdRef.current = null;
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

  const refreshMessages = useCallback(async () => {
    if (!portalSessionToken) return [] as PortalMessage[];
    const rows = await listPortalClientMessages(portalSessionToken);
    setMessages(rows);
    setMessagesLoaded(true);
    return rows;
  }, [portalSessionToken]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const markMessagesAsSeen = useCallback(
    (items: PortalMessage[]) => {
      if (!client?.id) return;
      const latestTimestamp = getLatestMessageTimestamp(items);
      setUnreadMessagesCount(0);
      if (typeof window !== 'undefined') {
        const key = getMessageSeenStorageKey(client.id);
        if (latestTimestamp) sessionStorage.setItem(key, latestTimestamp);
        else sessionStorage.removeItem(key);
      }
    },
    [client?.id],
  );

  const playPortalMessageTone = useCallback(() => {
    if (!hasAudioPermissionRef.current || typeof window === 'undefined') return;
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    try {
      const audioContext = notificationAudioContextRef.current || new AudioContextCtor();
      notificationAudioContextRef.current = audioContext;

      if (audioContext.state === 'suspended') {
        void audioContext.resume().catch(() => null);
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.25);
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.26);
    } catch {
      // ignore browser audio failures silently
    }
  }, []);

  const showPortalBrowserNotification = useCallback((incoming: PortalMessage) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (!syncNotificationPermission()) return;

    const notification = new window.Notification('Nova mensagem do escritório', {
      body: incoming.content,
      tag: PORTAL_NOTIFICATION_TAG,
      requireInteraction: false,
    });

    notification.onclick = () => {
      window.focus();
      setTab('messages');
      notification.close();
    };
  }, []);

  const processIncomingOfficeMessages = useCallback((incomingMessages: PortalMessage[]) => {
    if (!client?.id || incomingMessages.length === 0) return;

    const isMessagesTabVisible = isMessagesTabActiveRef.current && document.visibilityState === 'visible';
    if (isMessagesTabVisible) {
      const latestIncoming = incomingMessages[incomingMessages.length - 1];
      setUnreadMessagesCount(0);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(getMessageSeenStorageKey(client.id), latestIncoming.created_at);
      }
      return;
    }

    setUnreadMessagesCount((current) => current + incomingMessages.length);

    const latestIncoming = incomingMessages[incomingMessages.length - 1];
    const now = Date.now();
    if (now - lastNotificationAtRef.current < MESSAGE_NOTIFICATION_COOLDOWN_MS) return;
    lastNotificationAtRef.current = now;

    toast.success(`Nova mensagem do escritório: ${latestIncoming.content}`, {
      duration: 4000,
    });
    playPortalMessageTone();
    showPortalBrowserNotification(latestIncoming);
  }, [client?.id, playPortalMessageTone, showPortalBrowserNotification]);

  // Habilita audio do portal apos a primeira interacao do usuario.
  useEffect(() => {
    function unlockAudio() {
      hasAudioPermissionRef.current = true;
      if (notificationAudioContextRef.current?.state === 'suspended') {
        void notificationAudioContextRef.current.resume().catch(() => null);
      }

      if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'default') {
        void requestPortalNotificationPermission();
      } else {
        syncNotificationPermission();
      }
    }

    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, [requestPortalNotificationPermission]);

  useEffect(() => {
    syncNotificationPermission();
  }, []);

  // Carrega mensagens sempre que a sessao estiver autenticada.
  useEffect(() => {
    if (state !== 'authenticated' || !portalSessionToken) return;

    let cancelled = false;
    setMessagesError(null);
    setMessagesLoaded(false);

    refreshMessages()
      .catch((err) => {
        if (cancelled) return;
        setMessages([]);
        setMessagesLoaded(true);
        setMessagesError(getPortalRpcError(err, 'Nao foi possivel carregar as mensagens.'));
      });

    return () => {
      cancelled = true;
    };
  }, [state, portalSessionToken, refreshMessages]);

  // Hidrata marcador de ultima visualizacao ao carregar a sessao do cliente.
  useEffect(() => {
    if (!client?.id || !messagesLoaded || hydratedClientIdRef.current === client.id) return;

    hydratedClientIdRef.current = client.id;
    const storageKey = getMessageSeenStorageKey(client.id);
    const storedSeenAt = typeof window !== 'undefined' ? sessionStorage.getItem(storageKey) : null;

    if (storedSeenAt) {
      setUnreadMessagesCount(countUnreadOfficeMessages(messages, storedSeenAt));
      return;
    }

    const lastClientMessageAt = getLatestMessageTimestampBySender(messages, 'client');
    const derivedUnreadCount = lastClientMessageAt
      ? countUnreadOfficeMessages(messages, lastClientMessageAt)
      : messages.filter((item) => item.sender === 'office').length;

    setUnreadMessagesCount(derivedUnreadCount);

    if (derivedUnreadCount > 0) return;

    const latestTimestamp = getLatestMessageTimestamp(messages);
    if (typeof window !== 'undefined' && latestTimestamp) {
      sessionStorage.setItem(storageKey, latestTimestamp);
    }
  }, [client?.id, messages, messagesLoaded]);

  // Atualiza leitura quando a aba de mensagens estiver aberta.
  useEffect(() => {
    isMessagesTabActiveRef.current = tab === 'messages';
    if (tab === 'messages' && messagesLoaded) {
      markMessagesAsSeen(messages);
    }
  }, [tab, messages, messagesLoaded, markMessagesAsSeen]);

  // Scroll automatico ao final do chat quando novas mensagens chegarem.
  useEffect(() => {
    if (tab !== 'messages') return;
    const container = messagesWrapRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, tab]);

  // Realtime do chat do portal: atualiza historico, badge, toast e som.
  useEffect(() => {
    if (state !== 'authenticated' || !client?.id || !messagesLoaded) return;

    return subscribeToPortalMessages(client.id, (incoming) => {
      setMessages((current) => mergePortalMessages(current, incoming));

      if (incoming.sender !== 'office') return;

      processIncomingOfficeMessages([incoming]);
    });
  }, [client?.id, messagesLoaded, processIncomingOfficeMessages, state]);

  // Fallback: confere mensagens novas periodicamente caso o realtime oscile.
  useEffect(() => {
    if (state !== 'authenticated' || !portalSessionToken || !client?.id || !messagesLoaded) return;

    let cancelled = false;
    const sessionToken = portalSessionToken;

    async function pollPortalMessages() {
      try {
        const latestRows = await listPortalClientMessages(sessionToken);
        if (cancelled) return;

        const currentRows = messagesRef.current;
        const currentIds = new Set(currentRows.map((item) => item.id));
        const newOfficeMessages = latestRows.filter((item) => item.sender === 'office' && !currentIds.has(item.id));

        setMessages(latestRows);
        setMessagesLoaded(true);

        if (newOfficeMessages.length > 0) {
          processIncomingOfficeMessages(newOfficeMessages);
        }
      } catch {
        if (cancelled) return;
      }
    }

    void pollPortalMessages();

    const intervalId = window.setInterval(() => {
      void pollPortalMessages();
    }, PORTAL_MESSAGES_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [client?.id, messagesLoaded, portalSessionToken, processIncomingOfficeMessages, state]);

  const latestPortalMessage = useMemo(
    () => (messages.length ? messages[messages.length - 1] : null),
    [messages],
  );

  const latestOfficeMessage = useMemo(
    () => [...messages].reverse().find((item) => item.sender === 'office') || null,
    [messages],
  );

  const bellSummary = unreadMessagesCount > 0
    ? `${unreadMessagesCount} nova${unreadMessagesCount === 1 ? '' : 's'}`
    : latestOfficeMessage
      ? `Última: ${formatRelativePortalTime(latestOfficeMessage.created_at)}`
      : 'Sem novidades';

  const liveStatusLabel = unreadMessagesCount > 0
    ? 'Nova mensagem no portal'
    : latestPortalMessage
      ? `Última atividade ${formatRelativePortalTime(latestPortalMessage.created_at).toLowerCase()}`
      : 'Canal de mensagens ativo';

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
          .from(DOCS_BUCKET)
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) {
          const msg = upErr.message || '';
          const status = String((upErr as { statusCode?: string | number }).statusCode || '');
          if (msg.toLowerCase().includes('bucket not found') || msg.toLowerCase().includes('the resource was not found') || status === '404') {
            console.error('[Portal] Bucket não encontrado:', DOCS_BUCKET, upErr);
            throw new Error(`Bucket de documentos não configurado. Avise o administrador (bucket: ${DOCS_BUCKET}).`);
          }
          console.error('[Portal] Erro de upload:', { status, message: msg });
          throw new Error(msg || 'Falha ao enviar arquivo.');
        }
        // Usa RPC security definer para contornar RLS (anon não tem INSERT direto)
        const { error: insErr } = await supabase.rpc('portal_insert_document', {
          p_session_token: portalSessionToken,
          p_doc_id: docId,
          p_client_id: client.id,
          p_title: `Portal: ${file.name}`,
          p_file_path: path,
          p_mime_type: file.type || null,
          p_size_bytes: file.size || null,
        });
        if (insErr) {
          await supabase.storage.from(DOCS_BUCKET).remove([path]).catch(() => null);
          console.error('[Portal] Erro ao registrar documento:', insErr);
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
    setMessagesLoaded(false);
    setUnreadMessagesCount(0);
    hydratedClientIdRef.current = null;
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
      <>
        <AppToaster />
        <div className="min-h-screen bg-[#08090b] flex flex-col items-center justify-center gap-4 px-4">
          <AlertTriangle className="size-12 text-red-400" />
          <h1 className="text-xl font-semibold text-white">Portal Indisponível</h1>
          <p className="text-sm text-white/50 text-center max-w-sm">
            Configuração de ambiente não encontrada para acessar o portal do cliente.
          </p>
        </div>
      </>
    );
  }

  if (state === 'login') {
    return (
      <>
        <AppToaster />
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
      </>
    );
  }

  // --- Layout com Abas ---
  return (
    <>
      <AppToaster />
      <div className="min-h-screen w-full bg-gradient-to-br from-[#0a0c10] via-[#10131a] to-[#181c24] px-3 py-4 sm:px-4 sm:py-6">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="mt-2 flex w-full items-start justify-between gap-3 sm:mt-4">
        <img src="/brand/logo.jpg" alt="Lima, Lopes & Diógenes" className="h-16 w-auto rounded-2xl border-2 border-white/10 shadow-2xl sm:h-20" />
        <button
          type="button"
          onClick={handlePortalExit}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white sm:px-4"
        >
          <LogOut className="size-4" />
          Sair
        </button>
      </div>
      {/* Dados do cliente no topo */}
      {state === 'authenticated' && client && (
        <div className="mt-1 mb-4 rounded-[28px] border border-white/10 bg-white/[0.04] px-4 py-5 shadow-[0_20px_80px_rgba(0,0,0,0.28)] backdrop-blur sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4 sm:gap-5">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
            {/* Avatar do cliente */}
            <ClientAvatar name={client.name} avatarPath={client.avatar_path} size={72} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xl font-bold text-white font-[Space_Grotesk] drop-shadow-lg sm:text-2xl">{client.name}</div>
              <div className="text-sm text-white/70 font-[Inter]">{client.email || '—'}</div>
            </div>
            <button
              type="button"
              onClick={() => setTab('messages')}
              className={`portal-bell-button ${unreadMessagesCount > 0 ? 'portal-bell-button-active' : ''}`}
              aria-label={unreadMessagesCount > 0 ? `Abrir mensagens com ${unreadMessagesCount} nova${unreadMessagesCount === 1 ? '' : 's'} mensagem${unreadMessagesCount === 1 ? '' : 'ens'}` : 'Abrir mensagens do portal'}
            >
              <span className={`portal-bell-icon ${unreadMessagesCount > 0 ? 'portal-bell-icon-active' : ''}`}>
                <Bell className="size-5" />
              </span>
              <span className="text-left">
                <span className="block text-[11px] uppercase tracking-[0.24em] text-white/45">Mensagens</span>
                <span className="block text-sm font-semibold text-white">
                  {bellSummary}
                </span>
              </span>
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-white/90 font-[Inter] sm:justify-start sm:text-base">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5"><span className="text-amber-300">📱</span> {client.phone || '—'}</span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5"><span className="text-amber-300">💬</span> {client.whatsapp || '—'}</span>
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold sm:text-sm ${unreadMessagesCount > 0 ? 'border border-amber-300/30 bg-amber-400/10 text-amber-100' : 'border border-emerald-300/20 bg-emerald-400/10 text-emerald-100'}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${unreadMessagesCount > 0 ? 'portal-live-dot-active' : 'bg-emerald-300/90'}`} />
              {liveStatusLabel}
            </span>
          </div>
          </div>
        </div>
      )}
      <div className="flex-1 w-full max-w-xl mx-auto flex flex-col mt-1">
        <nav className="fixed inset-x-3 bottom-3 z-10 grid grid-cols-4 rounded-[28px] border border-white/10 bg-black/75 px-1 py-2 shadow-[0_16px_48px_rgba(0,0,0,0.35)] backdrop-blur md:static md:mb-6 md:rounded-2xl md:border md:bg-white/5 md:px-2 md:py-3 md:shadow-none">
          <button className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 transition ${tab === 'home' ? 'bg-amber-400/10 text-amber-300' : 'text-white/60'}`} onClick={() => setTab('home')}><Home className="size-5 sm:size-6" /><span className="text-[11px] sm:text-xs">Início</span></button>
          <button className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 transition ${tab === 'drive' ? 'bg-amber-400/10 text-amber-300' : 'text-white/60'}`} onClick={() => setTab('drive')}><Folder className="size-5 sm:size-6" /><span className="text-[11px] sm:text-xs">Arquivos</span></button>
          <button className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 transition ${tab === 'finance' ? 'bg-amber-400/10 text-amber-300' : 'text-white/60'}`} onClick={() => setTab('finance')}><CreditCard className="size-5 sm:size-6" /><span className="text-[11px] sm:text-xs">Financeiro</span></button>
          <button className={`relative flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 transition ${tab === 'messages' ? 'bg-amber-400/10 text-amber-300' : 'text-white/60'}`} onClick={() => setTab('messages')}>
            <MessageCircle className="size-6" />
            {unreadMessagesCount > 0 ? (
              <span className="absolute right-2 top-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white shadow-[0_0_12px_rgba(239,68,68,0.45)]">
                {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
              </span>
            ) : null}
            <span className="text-[11px] sm:text-xs">Mensagens</span>
          </button>
        </nav>
        <div className="flex-1 w-full px-1 pb-28 pt-4 sm:px-0 md:rounded-2xl md:border md:border-white/10 md:bg-white/5 md:px-4 md:py-6 md:mt-4 md:mb-4 min-h-[60vh]">
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
                <div className="font-semibold text-white mb-2">Meus Recibos</div>
                {receiptsLoading ? <div className="text-white/40 text-sm">Carregando...</div> : receipts.length > 0 ? (
                  <ul className="space-y-3">
                    {receipts.map((r) => (
                      <li key={r.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border-b border-white/5 pb-2">
                        <div>
                          <div className="text-white/80 font-semibold">{r.description || 'Recibo'}</div>
                          <div className="text-xs text-white/40">
                            Emissão: {new Date(r.issued_at).toLocaleDateString('pt-BR')}<br/>
                            Valor: <span className="text-white/70">R$ {Number(r.amount).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {r.pdf_url && (
                            <a href={r.pdf_url} target="_blank" rel="noopener noreferrer" className="btn-secondary">Visualizar PDF</a>
                          )}
                          {r.pdf_url && (
                            <button className="btn-secondary" onClick={() => r.pdf_url && window.open(r.pdf_url, '_blank')}>Imprimir</button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <div className="text-white/40 text-sm">Nenhum recibo encontrado.</div>}
              </div>
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
              {notificationPermission !== 'granted' ? (
                <div className={`mb-3 rounded-xl border px-3 py-3 text-sm ${notificationPermission === 'denied' ? 'border-amber-400/30 bg-amber-400/10 text-amber-100' : 'border-white/10 bg-white/5 text-white/75'}`}>
                  <div className="font-medium text-white">
                    {notificationPermission === 'unsupported'
                      ? 'Seu navegador não suporta notificações nativas.'
                      : notificationPermission === 'denied'
                        ? 'As notificações do navegador estão bloqueadas para este portal.'
                        : 'Ative as notificações do navegador para receber avisos fora da conversa.'}
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    {notificationPermission === 'denied'
                      ? 'Libere a permissão nas configurações do navegador e recarregue a página para voltar a receber alertas.'
                      : notificationPermission === 'unsupported'
                        ? 'O badge, o toast interno e o som continuam funcionando nesta página.'
                        : 'Isso permite alerta mesmo quando a aba do portal não estiver visível.'}
                  </div>
                  {notificationPermission === 'default' ? (
                    <button
                      type="button"
                      onClick={() => void requestPortalNotificationPermission()}
                      className="btn-secondary mt-3"
                    >
                      Ativar notificações do navegador
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div ref={messagesWrapRef} className="flex-1 overflow-y-auto space-y-3 mb-2 pr-1 max-h-[50vh]">
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
                    <div className={`rounded-2xl px-4 py-2 max-w-[82%] sm:max-w-[70%] text-sm shadow ${msg.sender === 'client' ? 'bg-amber-400/20 text-white/90' : 'bg-white/10 text-white/80'}`}>
                      <div>{msg.content}</div>
                      <div className="text-xs text-white/40 mt-1 text-right">{new Date(msg.created_at).toLocaleString('pt-BR')}</div>
                    </div>
                  </div>
                ))}
              </div>
              <form className="mt-auto flex flex-col gap-2 sm:flex-row" onSubmit={async (e) => {
                e.preventDefault();
                if (!messageInput.trim() || !portalSessionToken) return;
                setSendingMsg(true);
                setMessagesError(null);
                try {
                  const sentMessage = await sendPortalClientMessage(portalSessionToken, messageInput.trim());
                  setMessages((current) => {
                    const next = mergePortalMessages(current, sentMessage);
                    if (tab === 'messages') {
                      markMessagesAsSeen(next);
                    }
                    return next;
                  });
                  setMessageInput('');
                } catch (err) {
                  setMessagesError(getPortalRpcError(err, 'Nao foi possivel enviar sua mensagem.'));
                } finally {
                  setSendingMsg(false);
                }
              }}>
                <input
                  className="min-h-[48px] flex-1 rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white placeholder:text-white/40"
                  placeholder="Digite sua mensagem..."
                  value={messageInput}
                  onChange={e => setMessageInput(e.target.value)}
                  disabled={sendingMsg}
                />
                <button type="submit" className="btn-primary min-h-[48px] sm:min-w-[110px]" disabled={sendingMsg || !messageInput.trim()}>Enviar</button>
              </form>
            </div>
          )}
        </div>
      </div>
      <p className="mt-12 text-[11px] text-white/30 mb-24 md:mb-0">
        Lima, Lopes &amp; Diógenes Advogados &bull; Portal do Cliente
      </p>
      </div>
      </div>
    </>
  );
}
