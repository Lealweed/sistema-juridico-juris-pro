import pg from 'pg';
import xlsx from 'xlsx';

const DB_URI = "postgresql://postgres.gpazbahkzebixcminfrz:Deus2026brasil@aws-1-sa-east-1.pooler.supabase.com:6543/postgres";
const { Client } = pg;

async function run() {
  const client = new Client({ connectionString: DB_URI });
  await client.connect();
  console.log("Connected to Supabase DB!");

  const officeRes = await client.query("SELECT id FROM offices LIMIT 1");
  const office_id = officeRes.rows[0].id;
  const userRes = await client.query("SELECT user_id FROM office_members LIMIT 1");
  const user_id = userRes.rows[0].user_id;

  const clientMap = new Map();

  // --- PROCESS CLIENTS ---
  const wbClients = xlsx.readFile('/root/.openclaw/media/inbound/Clientes_2026-03-16---1c33a5e9-0496-4aa0-af91-1d62de2247db.xlsx');
  const clientsData = xlsx.utils.sheet_to_json(wbClients.Sheets[wbClients.SheetNames[0]]);
  
  let clientsCreated = 0;
  for (const row of clientsData) {
    const name = row['Nome Completo']?.trim();
    if (!name) continue;
    
    let cpf = row['CPF']?.trim() || null;
    let rg = row['RG']?.toString().trim() || null;
    let phone = row['WhatsApp']?.toString().trim() || row['Telefone']?.toString().trim() || null;
    let address = row['Endereço']?.trim() || null;
    let cep = row['CEP']?.toString().trim() || null;
    let city = row['Cidade']?.trim() || null;
    let state = row['Estado']?.trim() || null;
    let notes = row['Observações']?.trim() || null;

    try {
      const insRes = await client.query(
        "INSERT INTO clients (name, cpf, rg, whatsapp, address_street, address_cep, address_city, address_state, notes, user_id, office_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id",
        [name, cpf, rg, phone, address, cep, city, state, notes, user_id, office_id]
      );
      clientMap.set(name.toLowerCase(), insRes.rows[0].id);
      clientsCreated++;
    } catch (err) {
      try {
        const fallbackRes = await client.query(
          "INSERT INTO clients (name, rg, whatsapp, address_street, address_cep, address_city, address_state, notes, user_id, office_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id",
          [name, rg, phone, address, cep, city, state, notes, user_id, office_id]
        );
        clientMap.set(name.toLowerCase(), fallbackRes.rows[0].id);
        clientsCreated++;
      } catch (e2) {
        console.error("Failed to insert client:", name, e2.message);
      }
    }
  }
  console.log(`Clientes importados: ${clientsCreated}`);

  // --- PROCESS CASES ---
  const wbCases = xlsx.readFile('/root/.openclaw/media/inbound/Processos_2026-03-16---2bd17f64-f332-41a1-9b91-82995b565859.xlsx');
  const casesData = xlsx.utils.sheet_to_json(wbCases.Sheets[wbCases.SheetNames[0]]);
  
  let casesCreated = 0;
  for (const row of casesData) {
    const clientName = row['Cliente']?.trim();
    if (!clientName) continue;

    let cid = clientMap.get(clientName.toLowerCase());
    if (!cid) {
      try {
        const insRes = await client.query(
          "INSERT INTO clients (name, user_id, office_id) VALUES ($1, $2, $3) RETURNING id",
          [clientName, user_id, office_id]
        );
        cid = insRes.rows[0].id;
        clientMap.set(clientName.toLowerCase(), cid);
        clientsCreated++;
      } catch (e) {
        continue;
      }
    }

    const title = row['Nº Processo'] ? `Processo: ${row['Nº Processo']}` : `Atendimento: ${clientName}`;
    const desc = [
      `Tribunal: ${row['Tribunal'] || ''} - ${row['Vara'] || ''}`,
      `Ação: ${row['Classe'] || ''} - ${row['Assunto'] || ''}`,
      `Adverso: ${row['Parte Contrária'] || ''}`,
      `Obs: ${row['Observações'] || ''}`
    ].filter(Boolean).join('\n');

    let area = row['Área']?.toLowerCase() || 'civel';
    if (!['civel', 'trabalhista', 'empresarial', 'familia', 'criminal', 'imobiliario', 'tributario', 'previdenciario'].includes(area)) {
      area = 'civel';
    }

    try {
      await client.query(
        "INSERT INTO cases (title, description, status, area, client_id, user_id, office_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [title, desc, 'Ativo', area, cid, user_id, office_id]
      );
      casesCreated++;
    } catch (e) {
      console.error("Failed to insert case:", title, e.message);
    }
  }

  console.log(`Processos importados: ${casesCreated}`);
  await client.end();
}

run().catch(err => { console.error(err); process.exit(1); });