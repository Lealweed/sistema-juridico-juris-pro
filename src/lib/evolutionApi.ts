function sanitizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export async function sendWhatsAppText(phone: string, text: string): Promise<true> {
  const baseUrl = import.meta.env.VITE_EVOLUTION_URL as string | undefined;
  const apiKey = import.meta.env.VITE_EVOLUTION_KEY as string | undefined;
  const instance = import.meta.env.VITE_EVOLUTION_INSTANCE as string | undefined;

  if (!baseUrl || !apiKey || !instance) {
    throw new Error('Variáveis da Evolution API não configuradas (VITE_EVOLUTION_URL, VITE_EVOLUTION_KEY, VITE_EVOLUTION_INSTANCE).');
  }

  const numero = sanitizePhone(phone);

  const resp = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ number: numero, text }),
  });

  if (resp.status !== 200 && resp.status !== 201) {
    const body = await resp.json().catch(() => null);
    const msg = (body as Record<string, unknown> | null)?.message;
    throw new Error(typeof msg === 'string' ? msg : `Falha ao enviar WhatsApp (${resp.status}).`);
  }

  return true;
}

// --------------- Templates de Notificação ---------------

export function notifyClientCaseUpdate(phone: string, clientName: string, caseTitle: string) {
  const text = [
    `Prezado(a) ${clientName},`,
    '',
    `Informamos que houve uma atualização no seu processo "${caseTitle}".`,
    '',
    'Para mais detalhes, entre em contato com o escritório.',
    '',
    'Atenciosamente,',
    'Lima, Lopes & Diógenes Advogados',
  ].join('\n');

  return sendWhatsAppText(phone, text);
}

export function notifyTeamNewTask(phone: string, assigneeName: string, taskTitle: string) {
  const text = [
    `Olá, ${assigneeName}!`,
    '',
    `Uma nova tarefa foi atribuída a você: "${taskTitle}".`,
    '',
    'Acesse o painel para conferir os detalhes e o prazo.',
    '',
    'Equipe Juris Pro',
  ].join('\n');

  return sendWhatsAppText(phone, text);
}

export function notifyClientBilling(phone: string, clientName: string, amount: string, pixKey: string) {
  const text = `Olá *${clientName}*, a sua parcela de *R$ ${amount}* referente aos honorários está disponível. Por favor, realize o pagamento via PIX na chave: *${pixKey}*. Agradecemos a confiança!`;

  return sendWhatsAppText(phone, text);
}
