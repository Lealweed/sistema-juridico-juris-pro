import { useEffect, useState, useRef } from 'react';
import { Card } from '@/ui/widgets/Card';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';
import { getDocumentDownloadUrl, uploadClientDocument, type DocumentRow } from '@/lib/documents';
import { Download, Upload, FileText, CheckCircle, Clock } from 'lucide-react';

type ClientCase = {
  id: string;
  title: string;
  status: string;
  process_number: string | null;
  area: string | null;
  court: string | null;
  datajud_last_movement_text: string | null;
  datajud_last_movement_at: string | null;
  responsible_user_id: string | null;
};

export function ClientPortalPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [clientProfile, setClientProfile] = useState<any>(null);
  const [cases, setCases] = useState<ClientCase[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const sb = requireSupabase();
      const user = await getAuthedUser();

      // Find client record bound to this auth user
      const { data: client, error: cErr } = await sb
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (cErr) throw new Error(cErr.message);
      
      if (!client) {
        setClientProfile(null);
        setLoading(false);
        return;
      }
      
      setClientProfile(client);

      // Fetch cases
      const { data: caseData } = await sb
        .from('cases')
        .select('id, title, status, process_number, area, court, datajud_last_movement_text, datajud_last_movement_at, responsible_user_id')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false });
        
      setCases((caseData || []) as ClientCase[]);

      // Fetch public documents only
      const { data: docData } = await sb
        .from('documents')
        .select('*')
        .eq('client_id', client.id)
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      setDocuments((docData || []) as DocumentRow[]);
      
      setLoading(false);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar portal do cliente.');
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDownload(doc: DocumentRow) {
    try {
      const url = await getDocumentDownloadUrl(doc.file_path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      alert('Falha ao gerar link de download: ' + err.message);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !clientProfile) return;

    setUploading(true);
    try {
      // Documentos enviados pelo cliente ficam públicos por padrão (para ele mesmo ver)
      await uploadClientDocument({
        clientId: clientProfile.id,
        kind: 'personal',
        title: `Enviado pelo cliente: ${file.name}`,
        file,
        isPublic: true, 
      });
      
      alert('Documento enviado com sucesso para seu advogado!');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await load();
    } catch (err: any) {
      alert('Erro ao enviar: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return <div className="p-10 text-center text-white/50 animate-pulse">Carregando sua área exclusiva...</div>;
  }

  if (error) {
    return <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-200">{error}</div>;
  }

  if (!clientProfile) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center space-y-4">
        <FileText className="w-16 h-16 text-amber-500/50" />
        <h2 className="text-2xl font-bold text-white">Bem-vindo ao Portal</h2>
        <p className="text-white/60 max-w-md">
          Seu e-mail ainda não foi vinculado a uma ficha de cliente pelo escritório. 
          Entre em contato com seu advogado para liberar o acesso aos seus processos e documentos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-white">Olá, {clientProfile.name.split(' ')[0]}</h1>
        <p className="text-sm text-white/60">Acompanhe o andamento dos seus processos e gerencie seus documentos de forma segura.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Lado Esquerdo: Processos e Casos */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            Seus Processos Ativos
          </h2>

          {cases.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <p className="text-white/50">Você ainda não possui processos registrados no sistema.</p>
            </Card>
          ) : (
            cases.map(kase => (
              <Card key={kase.id} className="overflow-hidden p-0 border-white/10 hover:border-white/20 transition-colors">
                <div className="p-5 border-b border-white/5 bg-white/[0.02]">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h3 className="font-bold text-lg text-white">{kase.title}</h3>
                      <p className="text-sm text-amber-200 font-mono mt-1">
                        CNJ: {kase.process_number || 'Aguardando distribuição'}
                      </p>
                    </div>
                    <span className="badge border-blue-500/30 bg-blue-500/10 text-blue-300 px-3 py-1">
                      {kase.status}
                    </span>
                  </div>
                </div>
                
                <div className="p-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-1">Vara / Tribunal</div>
                    <div className="text-sm text-white/80">{kase.court || 'Não informado'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-1">Área</div>
                    <div className="text-sm text-white/80">{kase.area || 'Não informada'}</div>
                  </div>
                </div>

                {/* Movimentação DataJud (se houver) */}
                {kase.datajud_last_movement_text && (
                  <div className="bg-black/40 p-5 border-t border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-white/40" />
                      <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Última Movimentação Oficial</span>
                    </div>
                    <p className="text-sm text-white/80 leading-relaxed border-l-2 border-amber-500/50 pl-3">
                      {kase.datajud_last_movement_text}
                    </p>
                    <p className="text-[11px] text-white/40 mt-2">
                      Data do movimento: {kase.datajud_last_movement_at ? new Date(kase.datajud_last_movement_at).toLocaleDateString() : '—'}
                    </p>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>

        {/* Lado Direito: Documentos Seguros */}
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            Seus Documentos
          </h2>

          <Card className="bg-blue-950/10 border-blue-500/20">
            <div className="text-sm font-semibold text-white mb-2">Enviar para o Advogado</div>
            <p className="text-xs text-white/60 mb-4">
              Faça upload de fotos de RG, comprovantes de endereço ou provas (PDF, JPG, PNG).
            </p>
            
            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-blue-500/30 rounded-xl hover:bg-blue-500/5 hover:border-blue-500/50 transition-colors cursor-pointer relative">
              {uploading ? (
                <span className="text-sm text-blue-300 font-semibold animate-pulse">Enviando cofre...</span>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-blue-400 mb-2" />
                  <span className="text-xs font-semibold text-blue-200">Toque para selecionar</span>
                </>
              )}
              <input 
                ref={fileInputRef}
                type="file" 
                className="hidden" 
                onChange={handleUpload}
                disabled={uploading}
                accept="image/*,application/pdf"
              />
            </label>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-white/5 font-semibold text-sm">
              Disponibilizados pelo Escritório
            </div>
            
            {documents.length === 0 ? (
              <div className="p-6 text-center text-xs text-white/50">
                Nenhum documento compartilhado com você no momento.
              </div>
            ) : (
              <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto">
                {documents.map((doc) => (
                  <div key={doc.id} className="p-4 hover:bg-white/[0.02] transition-colors flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate" title={doc.title}>{doc.title}</p>
                      <p className="text-[10px] text-white/40 mt-1">
                        {new Date(doc.created_at).toLocaleDateString()} 
                        {doc.size_bytes ? ` • ${(doc.size_bytes / 1024 / 1024).toFixed(2)}MB` : ''}
                      </p>
                    </div>
                    <button 
                      onClick={() => handleDownload(doc)}
                      className="shrink-0 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-amber-400 hover:text-black transition-colors"
                      title="Baixar arquivo"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
