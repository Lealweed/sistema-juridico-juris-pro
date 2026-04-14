import { useEffect, useState } from 'react';
import type { ClientLite } from '@/lib/types';
import { useNavigate } from 'react-router-dom';
import { getAuthedUser } from '@/lib/supabaseDb';
import { loadClientsLite } from '@/lib/loadClientsLite';

export function DocumentsGeneratorPage() {
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [modelos, setModelos] = useState<string[]>([]);
  const [selectedModelo, setSelectedModelo] = useState('');
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getAuthedUser().catch(() => navigate('/login'));
    loadClientsLite().then(setClients);
    // Buscar modelos disponíveis na pasta (mock, pois Node não lista diretórios no browser)
    setModelos([
      'RECIBO (2).docx',
      'CONTRATO Modelo (2).docx',
      'CONTRATO MODELO RECLAMAÇÃO TRABALHISTA.docx',
      // ...adicione outros modelos conforme necessário
    ]);
  }, [navigate]);

  async function handleClientChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedClient(e.target.value);
  }

  function handleModeloChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedModelo(e.target.value);
  }

  function handleExtraChange(e: React.ChangeEvent<HTMLInputElement>) {
    setExtras({ ...extras, [e.target.name]: e.target.value });
  }

  async function handlePreview() {
    if (!selectedClient || !selectedModelo) return;
    setGenerating(true);
    setError(null);
    try {
      // Buscar officeId do usuário logado (mock: pode ser ajustado conforme contexto real)
      const officeId = window.localStorage.getItem('currentOfficeId') || '';
      const resp = await fetch('/functions/documents-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelName: selectedModelo,
          clientId: selectedClient,
          officeId,
          extraFields: extras,
        }),
      });
      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || 'Erro ao gerar documento');
      }
      const blob = await resp.blob();
      setFileUrl(URL.createObjectURL(blob));
      setPreview('Documento gerado com sucesso.');
    } catch (e: any) {
      setError(e.message || 'Erro ao gerar documento.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Gerar Documentos</h1>
      <div className="space-y-4">
        <label className="block">
          Cliente:
          <select className="input" value={selectedClient} onChange={handleClientChange}>
            <option value="">Selecione...</option>
            {clients.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          Modelo:
          <select className="input" value={selectedModelo} onChange={handleModeloChange}>
            <option value="">Selecione...</option>
            {modelos.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        <div className="space-y-2">
          <label className="block">Valor: <input className="input" name="VALOR" onChange={handleExtraChange} /></label>
          <label className="block">Descrição: <input className="input" name="DESCRICAO" onChange={handleExtraChange} /></label>
          <label className="block">Cláusula: <input className="input" name="CLAUSULA" onChange={handleExtraChange} /></label>
        </div>
        <button className="btn-primary" onClick={handlePreview} disabled={generating}>Gerar documento</button>
        {error && <div className="text-red-600">{error}</div>}
        {preview && fileUrl && (
          <div className="mt-4 space-y-2">
            <div className="text-green-700">{preview}</div>
            <a href={fileUrl} download={`documento_${selectedModelo}`} className="btn-secondary">Baixar documento</a>
          </div>
        )}
      </div>
    </div>
  );
}
