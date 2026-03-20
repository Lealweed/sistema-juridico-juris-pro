import pg from 'pg';
import xlsx from 'xlsx';

const DB_URI = "postgresql://postgres.gpazbahkzebixcminfrz:Deus2026brasil@aws-1-sa-east-1.pooler.supabase.com:6543/postgres";
const { Client } = pg;

async function run() {
  const client = new Client({ connectionString: DB_URI });
  await client.connect();
  console.log("Connected to Supabase DB!");

  let office_id, user_id;

  const userRes = await client.query("SELECT id FROM auth.users LIMIT 1");
  if (userRes.rowCount === 0) throw new Error("No users found in auth.users");
  user_id = userRes.rows[0].id;

  const officeRes = await client.query("SELECT id FROM offices LIMIT 1");
  if (officeRes.rowCount > 0) {
    office_id = officeRes.rows[0].id;
  } else {
    console.log("No office found, creating 'Lima, Lopes & Diógenes'...");
    const insOff = await client.query("INSERT INTO offices (name) VALUES ($1) RETURNING id", ['Lima, Lopes & Diógenes']);
    office_id = insOff.rows[0].id;
    await client.query("INSERT INTO office_members (office_id, user_id, role) VALUES ($1, $2, $3)", [office_id, user_id, 'admin']);
  }

  // Map for client IDs
  const clientMap = new Map();

  // --- PROCESS CLIENTS ---
  const wbClients = xlsx.readFile('/root/.openclaw/media/inbound/Clientes_2026-03-16---1c33a5e9-0496-4aa0-af91-1d62de2247db.xlsx');
  const clientsData = xlsx.utils.sheet_to_json(wbClients.Sheets[wbClients.SheetNames[0]]);
  
  let clientsCreated = 0;
  for (const row of clientsData) {
    const name = row['Nome Completo']?.trim();
    if (!name) continue;
    
    const cpf = row['CPF']?.trim();
    const rg = row['RG']?.trim();
    const phone = row['WhatsApp']?.trim() || row['Telefone']?.trim();
    const address = row['Endereço']?.trim();
    const cep = row['CEP']?.trim();
    const city = row['Cidade']?.trim();
    const state = row['Estado']?.trim();
    const notes = row['Observações']?.trim();

    // Check if exists
    const exRes = await client.query("SELECT id FROM clients WHERE name = $1 AND office_id = $2", [name, office_id]);
    let cid;
    if (exRes.rowCount > 0) {
      cid = exRes.rows[0].id;
    } else {
      try {
        const insRes = await client.query(
          "INSERT INTO clients (name, cpf, rg, whatsapp, address_street, address_cep, address_city, address_state, notes, user_id, office_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id",
          [name, cpf, rg, phone, address, cep, city, state, notes, user_id, office_id]
        );
        cid = insRes.rows[0].id;
        clientsCreated++;
      } catch (err) {
        // Fallback: try inserting without CPF if check constraint fails
        const fallbackRes = await client.query(
          "INSERT INTO clients (name, rg, whatsapp, address_street, address_cep, address_city, address_state, notes, user_id, office_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id",
          [name, rg, phone, address, cep, city, state, notes, user_id, office_id]
        );
        cid = fallbackRes.rows[0].id;
        clientsCreated++;
      }
    }
    clientMap.set(name.toLowerCase(), cid);
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
    
    // If client wasn't in the clients sheet, create a basic one now
    if (!cid) {
      const exRes = await client.query("SELECT id FROM clients WHERE name = $1 AND office_id = $2", [clientName, office_id]);
      if (exRes.rowCount > 0) {
        cid = exRes.rows[0].id;
      } else {
        const insRes = await client.query(
          "INSERT INTO clients (name, user_id, office_id) VALUES ($1, $2, $3) RETURNING id",
          [clientName, user_id, office_id]
        );
        cid = insRes.rows[0].id;
        clientsCreated++;
      }
      clientMap.set(clientName.toLowerCase(), cid);
    }

    const title = row['Nº Processo'] ? `Processo: ${row['Nº Processo']}` : `Atendimento: ${clientName}`;
    const desc = [
      `Tribunal: ${row['Tribunal'] || ''} - ${row['Vara'] || ''}`,
      `Ação: ${row['Classe'] || ''} - ${row['Assunto'] || ''}`,
      `Adverso: ${row['Parte Contrária'] || ''}`,
      `Obs: ${row['Observações'] || ''}`
    ].filter(Boolean).join('\n');

    const area = row['Área']?.toLowerCase() || 'civel';

    await client.query(
      "INSERT INTO cases (title, description, status, area, client_id, user_id, office_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [title, desc, 'Ativo', area, cid, user_id, office_id]
    );
    casesCreated++;
  }

  console.log(`Processos importados: ${casesCreated}`);
  await client.end();
}

run().catch(err => { console.error(err); process.exit(1); });
