import { useState } from 'react';
import { Card } from '@/ui/widgets/Card';

export function SettingsN8nDocsPage() {
  const [webhookSecret] = useState<string>('••••••••••••••••'); // Substituir por fetch seguro
  const [messagesSendUrl] = useState<string>('/functions/v1/messages-send');
  const [webhookHandlerUrl] = useState<string>('/functions/v1/n8n-webhook-handler');

  return (
    <div className="max-w-3xl mx-auto py-8 text-white">
      <h1 className="text-3xl font-bold mb-2">Documentação n8n</h1>
      <p className="text-sm text-white/60 mb-6">Guia de integração entre o CRM e seus fluxos do n8n.</p>
      
      <Card className="mb-6">
        <h2 className="text-xl font-semibold mb-3 text-amber-400">Endpoints Disponíveis</h2>
        <div className="space-y-3">
          <div className="bg-white/5 border border-white/10 p-3 rounded-lg">
            <div className="text-xs text-white/50 mb-1">Envio de mensagens (WhatsApp)</div>
            <code className="text-sm text-blue-300 font-mono select-all">{messagesSendUrl}</code>
          </div>
          <div className="bg-white/5 border border-white/10 p-3 rounded-lg">
            <div className="text-xs text-white/50 mb-1">Webhook Handler Principal</div>
            <code className="text-sm text-emerald-300 font-mono select-all">{webhookHandlerUrl}</code>
          </div>
        </div>
      </Card>
      
      <Card className="mb-6">
        <h2 className="text-xl font-semibold mb-3 text-amber-400">Autenticação</h2>
        <p className="text-sm text-white/80 mb-3">Para consumir o webhook handler, utilize o seguinte secret no cabeçalho (Header):</p>
        <div className="bg-black/40 border border-white/10 rounded-lg px-4 py-3 font-mono text-lg text-white select-all text-center tracking-widest">
          {webhookSecret}
        </div>
        <p className="text-xs text-white/40 mt-2 text-center">Consulte o painel do Supabase para obter o valor real (SUPABASE_SERVICE_ROLE_KEY ou JWT secreto).</p>
      </Card>
      
      <Card>
        <h2 className="text-xl font-semibold mb-3 text-amber-400">Exemplo de Chamada (HTTP Request Node)</h2>
        <pre className="bg-[#0f1115] border border-white/10 rounded-lg p-4 text-xs overflow-x-auto text-emerald-200/90 leading-relaxed">
{`POST ${webhookHandlerUrl}
Headers:
  Authorization: Bearer [SEU_SECRET]
  Content-Type: application/json

Body (JSON):
{
  "event_type": "novo_lead",
  "office_id": "uuid_do_escritorio",
  "entity_type": "cliente",
  "entity_id": "uuid_do_cliente",
  "payload": {
    "mensagem": "Olá, queria informações sobre divórcio",
    "whatsapp": "5511999999999"
  }
}`}
        </pre>
      </Card>
    </div>
  );
}
