import { useState } from 'react';
import { Card } from '@/ui/widgets/Card';

export function SettingsN8nDocsPage() {
  // Exemplo: buscar dados sensíveis do backend via API segura
  const [webhookSecret] = useState<string>('••••••••••••••••'); // Substituir por fetch seguro
  const [messagesSendUrl] = useState<string>('/functions/v1/messages-send');
  const [webhookHandlerUrl] = useState<string>('/functions/v1/n8n-webhook-handler');

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-4">Integração com n8n</h1>
      <Card className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Endpoints disponíveis</h2>
        <ul className="list-disc ml-6">
          <li><b>Envio WhatsApp:</b> <code>{messagesSendUrl}</code></li>
          <li><b>Webhook Handler:</b> <code>{webhookHandlerUrl}</code></li>
        </ul>
      </Card>
      <Card className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Autenticação</h2>
        <p>Para consumir o webhook handler, use o seguinte secret/token:</p>
        <div className="bg-gray-100 rounded px-3 py-2 font-mono text-lg mt-2 mb-2 select-all">
          {webhookSecret}
        </div>
        <p className="text-xs text-gray-500">(Consulte o administrador para obter o valor real do secret.)</p>
      </Card>
      <Card>
        <h2 className="text-xl font-semibold mb-2">Exemplo de chamada (n8n HTTP Request)</h2>
        <pre className="bg-gray-100 rounded p-3 text-xs overflow-x-auto">
{`POST {webhookHandlerUrl}
Headers:
  Authorization: Bearer [SEU_SECRET]
Body (JSON):
{
  "event_type": "nome_do_evento",
  "office_id": "uuid_do_escritorio",
  "entity_type": "cliente|caso|...",
  "entity_id": "uuid",
  "payload": { ... },
  "idempotency_key": "opcional"
}`}
        </pre>
      </Card>
    </div>
  );
}
