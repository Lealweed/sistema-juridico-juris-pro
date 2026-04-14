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
  const [fallbackHtml, setFallbackHtml] = useState<string | null>(null);
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

  function buildFallbackHtml(clientName: string): string {
    const rows = [
      ['Modelo', selectedModelo],
      ['Cliente', clientName],
      ['Valor', extras['VALOR'] || '-'],
      ['Descrição', extras['DESCRICAO'] || '-'],
      ['Cláusula', extras['CLAUSULA'] || '-'],
      ...Object.entries(extras).filter(([k]) => !['VALOR','DESCRICAO','CLAUSULA'].includes(k)),
    ];
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${selectedModelo}</title>
<style>body{font-family:Arial,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#111}
h1{font-size:1.3rem;margin-bottom:24px}table{width:100%;border-collapse:collapse;margin-bottom:24px}
td,th{border:1px solid #ccc;padding:8px 12px;text-align:left}th{background:#f4f4f4}
@media print{button{display:none}}</style></head><body>
<h1>${selectedModelo.replace(/</g,'&lt;')}</h1>
<table><tr><th>Campo</th><th>Valor</th></tr>
${rows.map(([k,v]) => `<tr><td>${String(k).replace(/</g,'&lt;')}</td><td>${String(v).replace(/</g,'&lt;')}</td></tr>`).join('')}
</table>
<p style="color:#666;font-size:.85rem">Documento gerado em modo impressão/PDF — ${new Date().toLocaleString('pt-BR')}</p>
<button onclick="window.print()" style="padding:8px 20px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:1rem">Imprimir / Salvar como PDF</button>
</body></html>`;
  }

  async function handlePreview() {
    if (!selectedClient || !selectedModelo) return;
    setGenerating(true);
    setError(null);
    setFallbackHtml(null);
    setFileUrl(null);
    setPreview('');
    try {
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao gerar documento.';
      console.error('[DocumentsGenerator] Falha na geração DOCX:', e);
      if (selectedModelo.toLowerCase().endsWith('.docx')) {
        const clientName = clients.find((c: ClientLite) => c.id === selectedClient)?.name || 'Cliente';
        const html = buildFallbackHtml(clientName);
        setFallbackHtml(html);
        setError('Modelo DOCX indisponível no navegador. Gerado em modo impressão/PDF.');
      } else {
        setError(msg);
      }
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
        {error && (
          <div className={`text-sm mt-2 ${fallbackHtml ? 'text-amber-400' : 'text-red-500'}`}>{error}</div>
        )}
        {preview && fileUrl && (
          <div className="mt-4 space-y-2">
            <div className="text-green-700">{preview}</div>
            <a href={fileUrl} download={`documento_${selectedModelo}`} className="btn-secondary">Baixar documento</a>
          </div>
        )}
        {fallbackHtml && (
          <div className="mt-4 space-y-2">
            <button
              className="btn-secondary"
              onClick={() => {
                const win = window.open('', '_blank', 'width=800,height=900');
                if (win) {
                  win.document.write(fallbackHtml);
                  win.document.close();
                  win.focus();
                }
              }}
            >
              Imprimir / Salvar PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
