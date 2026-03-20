import { createClient } from '@supabase/supabase-js';
import * as xlsx from 'xlsx';
import 'dotenv/config';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
// Tenta usar a SERVICE_ROLE, se não tiver, usa ANON_KEY
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log('Iniciando importação de processos.xlsx...');

  // 1. Pegar admin user
  const { data: members, error: errMem } = await supabase.from('office_members').select('*').limit(1);
  if (errMem || !members.length) throw new Error('Administrador não encontrado no office_members');

  const userId = members[0].user_id;
  const officeId = members[0].office_id;

  // 2. Ler Excel
  const workbook = xlsx.readFile('./processos.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet);

  console.log(`Lidas ${rows.length} linhas do Excel.`);

  let clientsCreated = 0;
  let casesCreated = 0;

  // 3. Processar cada linha
  for (const row of rows) {
    const nomeCliente = row['Cliente']?.trim();
    if (!nomeCliente) continue;

    // Buscar ou criar cliente
    let clientId = null;
    const { data: existingClient } = await supabase.from('clients').select('id').eq('name', nomeCliente).eq('office_id', officeId).maybeSingle();

    if (existingClient) {
      clientId = existingClient.id;
    } else {
      const { data: newClient, error: cErr } = await supabase.from('clients').insert({
        name: nomeCliente,
        user_id: userId,
        office_id: officeId,
      }).select('id').single();

      if (cErr) console.error('Erro cliente:', cErr.message);
      if (newClient) {
        clientId = newClient.id;
        clientsCreated++;
      }
    }

    if (!clientId) continue;

    // Inserir Processo
    const numProcesso = row['Nº Processo'] || 'Sem Número';
    const areaStr = row['Área']?.toLowerCase() || 'civel';
    const titulo = numProcesso !== 'Sem Número' ? `Processo: ${numProcesso}` : `Atendimento: ${nomeCliente}`;

    // Montar descrição com os metadados do Excel
    const desc = [
      `Tribunal: ${row['Tribunal'] || ''} - ${row['Vara'] || ''}`,
      `Ação: ${row['Classe'] || ''} - ${row['Assunto'] || ''}`,
      `Adverso: ${row['Parte Contrária'] || ''}`,
      `Obs: ${row['Observações'] || ''}`,
    ].filter(Boolean).join('\n');

    const { error: caseErr } = await supabase.from('cases').insert({
      title: titulo,
      description: desc,
      status: row['Status'] || 'ativo',
      area: areaStr,
      client_id: clientId,
      user_id: userId,
      office_id: officeId,
    });

    if (caseErr) {
      console.error('Erro processo:', caseErr.message);
    } else {
      casesCreated++;
    }
  }
  console.log(`\n✅ SUCESSO! Importados: ${clientsCreated} clientes novos e ${casesCreated} processos.`);
}

run().catch(console.error);