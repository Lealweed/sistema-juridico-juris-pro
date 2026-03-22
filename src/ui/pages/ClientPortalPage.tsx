import { useRef, useState, useEffect } from 'react';
import { Upload, CheckCircle2, AlertTriangle, FileText, Home, Folder, CreditCard, MessageCircle, Eye, EyeOff, Download } from 'lucide-react';
import { hasSupabaseEnv, supabase } from '@/lib/supabaseClient';
import { listClientDocuments, getDocumentDownloadUrl } from '@/lib/documents';
import { loadClientTransactions, centsToBRL } from '@/lib/finance';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const PORTAL_USER_ID = '00000000-0000-0000-0000-000000000000';

// SQL para tabela de mensagens do cliente
//
// CREATE TABLE client_messages (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   client_id uuid REFERENCES clients(id),
//   sender text CHECK (sender IN ('lawyer', 'client')) NOT NULL,
//   content text NOT NULL,
//   created_at timestamptz DEFAULT now()
// );

type PortalState = 'login' | 'authenticated';

type PortalClient = {
  id: string;
  name: string;
};

type TabKey = 'home' | 'drive' | 'finance' | 'messages';

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
  const [showPin, setShowPin] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);


  const [uploading, setUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Tabs
  const [tab, setTab] = useState<TabKey>('home');

  // Home/Mural
  const [clientNotes, setClientNotes] = useState<string | null>(null);
  const [nextMeeting, setNextMeeting] = useState<any>(null);
  // Drive
  const [documents, setDocuments] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  // Financeiro
  const [transactions, setTransactions] = useState<any[]>([]);
  const [financeLoading, setFinanceLoading] = useState(false);
  // Mensagens
  const [messages, setMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

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

  // --- Layout com Abas ---
  return (
    <div className="min-h-screen bg-[#08090b] flex flex-col items-center px-0 py-0">
      {/* Logo */}
      <img
        src="/brand/logo.jpg"
        alt="Lima, Lopes & Diógenes"
        className="h-16 w-auto rounded-xl shadow-lg mt-6"
      />

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
              <label className={`relative flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${uploading ? 'border-amber-400/40 bg-amber-400/5' : 'border-white/15 bg-white/5 hover:border-amber-300/40 hover:bg-white/10'}`}>
                <Upload className={`size-8 ${uploading ? 'animate-bounce text-amber-400' : 'text-white/40'}`} />
                <span className="text-sm font-medium text-white">{uploading ? 'Enviando…' : 'Anexar Documentos'}</span>
                <span className="text-xs text-white/40">Imagens ou PDF • Máx. 25 MB cada</span>
                <input ref={fileRef} type="file" accept="image/*,.pdf" multiple className="absolute inset-0 cursor-pointer opacity-0" onChange={handleFiles} disabled={uploading} />
              </label>
              {successMsg && <div className="flex items-center gap-3 rounded-xl border border-green-400/30 bg-green-400/10 p-4"><CheckCircle2 className="size-5 shrink-0 text-green-300" /><span className="text-sm text-green-200">{successMsg}</span></div>}
              {errorMsg && <div className="flex items-center gap-3 rounded-xl border border-red-400/30 bg-red-400/10 p-4"><AlertTriangle className="size-5 shrink-0 text-red-300" /><span className="text-sm text-red-200">{errorMsg}</span></div>}
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="font-semibold text-white mb-2">Meus Arquivos</div>
                {docsLoading ? <div className="text-white/60 text-sm">Carregando…</div> : (
                  documents.length === 0 ? <div className="text-white/40 text-sm">Nenhum arquivo enviado.</div> :
                  <ul className="space-y-2">
                    {documents.map((doc) => (
                      <li key={doc.id} className="flex items-center justify-between gap-2 bg-black/30 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-white/90 text-sm truncate">{doc.title}</div>
                          <div className="text-xs text-white/40">{doc.mime_type || 'Arquivo'}</div>
                        </div>
                        <a href="#" className="ml-2 text-amber-300 hover:underline flex items-center gap-1" onClick={async (e) => {e.preventDefault(); if (doc.file_path) {const url = await getDocumentDownloadUrl(doc.file_path); window.open(url, '_blank');}}}><Download className="size-4" />Baixar</a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {tab === 'finance' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="font-semibold text-white mb-2">Financeiro</div>
                {financeLoading ? <div className="text-white/60 text-sm">Carregando…</div> : (
                  transactions.length === 0 ? <div className="text-white/40 text-sm">Nenhuma movimentação encontrada.</div> :
                  <ul className="space-y-2">
                    {transactions.map((tx) => (
                      <li key={tx.id} className="flex items-center justify-between gap-2 bg-black/30 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-white/90 text-sm truncate">{tx.description}</div>
                          <div className="text-xs text-white/40">Venc: {tx.due_date ? new Date(tx.due_date).toLocaleDateString('pt-BR') : '-'}</div>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className={`text-sm font-bold ${tx.status === 'paid' ? 'text-green-400' : tx.status === 'planned' ? 'text-amber-300' : 'text-red-400'}`}>{centsToBRL(tx.amount_cents)}</span>
                          <span className="text-xs text-white/50">{tx.status === 'paid' ? 'Pago' : tx.status === 'planned' ? 'Pendente' : 'Atrasado'}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {tab === 'messages' && (
            <div className="flex flex-col h-full min-h-[50vh]">
              <div className="flex-1 overflow-y-auto space-y-2 mb-2">
                {messages.length === 0 ? <div className="text-white/40 text-sm">Nenhuma mensagem.</div> : messages.map((msg) => (
                  <div key={msg.id} className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${msg.sender === 'client' ? 'bg-amber-400/10 text-white self-end ml-auto' : 'bg-white/10 text-white/80 self-start mr-auto'}`}>
                    <div>{msg.content}</div>
                    <div className="text-[10px] text-white/40 text-right mt-1">{new Date(msg.created_at).toLocaleString('pt-BR')}</div>
                  </div>
                ))}
              </div>
              <form className="flex gap-2 mt-auto" onSubmit={async (e) => {
                e.preventDefault();
                if (!messageInput.trim() || !client?.id || !supabase) return;
                setSendingMsg(true);
                await supabase.from('client_messages').insert({ client_id: client.id, sender: 'client', content: messageInput.trim() });
                setMessageInput('');
                setSendingMsg(false);
                // reload
                supabase.from('client_messages')
                  .select('id,sender,content,created_at')
                  .eq('client_id', client.id)
                  .order('created_at', { ascending: true })
                  .then(({ data }) => setMessages(data || []));
              }}>
                <input className="flex-1 rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white placeholder:text-white/40" placeholder="Digite sua mensagem..." value={messageInput} onChange={e => setMessageInput(e.target.value)} disabled={sendingMsg} />
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
