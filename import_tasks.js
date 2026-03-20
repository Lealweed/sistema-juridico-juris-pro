import pg from 'pg';
import xlsx from 'xlsx';

const DB_URI = "postgresql://postgres.gpazbahkzebixcminfrz:Deus2026brasil@aws-1-sa-east-1.pooler.supabase.com:6543/postgres";
const { Client } = pg;

async function run() {
  const client = new Client({ connectionString: DB_URI });
  await client.connect();
  console.log("Connected to Supabase DB for Tasks!");

  // Get admin user
  const adminRes = await client.query("SELECT office_id, user_id FROM office_members LIMIT 1");
  const { office_id, user_id } = adminRes.rows[0];

  // Pre-fetch all clients to map client names to IDs
  const clientsRes = await client.query("SELECT id, name FROM clients WHERE office_id = $1", [office_id]);
  const clientMap = new Map();
  for (const row of clientsRes.rows) {
    clientMap.set(row.name.toLowerCase().trim(), row.id);
  }

  const wbTasks = xlsx.readFile('/root/.openclaw/media/inbound/Tarefas_2026-03-16---52031b18-ac40-432e-8204-30afccd44fc1.xlsx');
  const tasksData = xlsx.utils.sheet_to_json(wbTasks.Sheets[wbTasks.SheetNames[0]]);
  
  let tasksCreated = 0;
  for (const row of tasksData) {
    const title = row['Título']?.trim();
    if (!title) continue;

    const desc = row['Descrição']?.trim() || null;
    
    // Map status
    let status_v2 = 'open';
    const rawStatus = row['Status']?.toLowerCase() || '';
    if (rawStatus.includes('conclu')) status_v2 = 'done';
    if (rawStatus.includes('andamento')) status_v2 = 'in_progress';
    if (rawStatus.includes('pausad')) status_v2 = 'paused';
    if (rawStatus.includes('cancel')) status_v2 = 'cancelled';

    // Map priority
    let priority = 'medium';
    const rawPriority = row['Prioridade']?.toLowerCase() || '';
    if (rawPriority.includes('urgente') || rawPriority.includes('alta')) priority = 'high';
    if (rawPriority.includes('baixa')) priority = 'low';

    // Try linking client
    const clientName = row['Cliente']?.trim().toLowerCase();
    let cid = null;
    if (clientName && clientMap.has(clientName)) {
      cid = clientMap.get(clientName);
    }

    // Due date (simple parse from DD/MM/YYYY)
    let due_at = null;
    const rawDate = row['Data Vencimento']?.trim();
    if (rawDate && rawDate.length >= 8) {
      const parts = rawDate.split('/');
      if (parts.length === 3) {
        let year = parseInt(parts[2], 10);
        if (year < 2000) year = 2026; // hack to fix 226 instead of 2026
        const dateObj = new Date(`${year}-${parts[1]}-${parts[0]}T12:00:00Z`);
        if (!isNaN(dateObj.getTime())) {
          due_at = dateObj.toISOString();
        }
      }
    }

    // Append extra info to description
    let fullDesc = desc || '';
    const assigned = row['Responsáveis']?.trim();
    if (assigned) {
      fullDesc += `\n\nResponsaveis originais: ${assigned}`;
    }
    const cat = row['Categoria']?.trim();
    if (cat) {
      fullDesc += `\nCategoria: ${cat}`;
    }

    await client.query(
      "INSERT INTO tasks (title, description, status_v2, priority, due_at, client_id, user_id, office_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [title, fullDesc.trim() || null, status_v2, priority, due_at, cid, user_id, office_id]
    );
    tasksCreated++;
  }

  console.log(`Tarefas importadas: ${tasksCreated}`);
  await client.end();
}

run().catch(err => { console.error(err); process.exit(1); });