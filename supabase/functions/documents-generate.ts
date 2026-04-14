import { serve } from 'std/server';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';
import { generateDocumentFromTemplate } from '@/lib/documents';

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  try {
    const sb = requireSupabase();
    const user = await getAuthedUser();
    const { modelName, clientId, officeId, extraFields } = await req.json();
    // Validar se usuário pertence ao office
    const { data: member, error: memberErr } = await sb
      .from('office_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('office_id', officeId)
      .maybeSingle();
    if (memberErr || !member) {
      return new Response('Unauthorized', { status: 403 });
    }
    // Buscar dados do cliente do mesmo office
    const { data: client, error: clientErr } = await sb
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('office_id', officeId)
      .maybeSingle();
    if (clientErr || !client) {
      return new Response('Cliente não encontrado', { status: 404 });
    }
    // Montar dados para placeholders
    const data = {
      CLIENTE_NOME: client.name || '',
      CLIENTE_CPF: client.cpf || '',
      CLIENTE_EMAIL: client.email || '',
      CLIENTE_TELEFONE: client.phone || '',
      DATA_ATUAL: new Date().toLocaleDateString(),
      ...extraFields,
    };
    // Gerar documento
    const uint8 = await generateDocumentFromTemplate(modelName, data);
    const ext = modelName.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx';
    return new Response(uint8, {
      status: 200,
      headers: {
        'Content-Type': ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename=documento_gerado.${ext}`,
      },
    });
  } catch (e: any) {
    return new Response(e.message || 'Erro ao gerar documento', { status: 500 });
  }
});
