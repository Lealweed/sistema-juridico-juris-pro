const fs = require('fs');

async function run() {
  const url = "https://n8n-n8n.vzq8cx.easypanel.host/api/v1/workflows/ON3Cvnx8XYH7Gt6t";
  const headers = { 
    "X-N8N-API-KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMjM5NmYwZS05MDdjLTRlZDMtYjE3Zi1lM2I3Y2U1YTBmMDAiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiODY4YTYxMDAtNTQ2YS00NmJkLTg3MGUtMjdkMWY2M2I0MWQ2IiwiaWF0IjoxNzczNzMwMjQyfQ.fwR2qq-N5hDOdX-aXFIe_OqcyKEMKQu4BSUrp5_dhPM",
    "Content-Type": "application/json"
  };

  const resp = await fetch(url, { headers });
  const d = await resp.json();

  const officeId = '9fdc3fac-7740-4c1b-a1b0-04d1e84cdbd7';
  const userId = '5621c8ef-f4b8-4656-bf4a-df455b9a534e';

  // 1. Rewrite prompt
  const systemPrompt = `Você é o Assistente Virtual Oficial do escritório de advocacia **Lima, Lopes & Diógenes**.
Sua postura é acolhedora, respeitosa, extremamente paciente e profissional. O público do escritório é composto em grande parte por idosos (causas previdenciárias), então use uma linguagem clara, sem muito "juridiquês", e evite respostas longas demais.
Use emojis sóbrios e amigáveis: ⚖️, 🤝, 📄, ✅.

# REGRAS DE ATENDIMENTO
1. **Nunca dê conselhos jurídicos finais ou prometa resultados.** Diga sempre que a advogada especialista vai analisar o caso.
2. **Identificação:** Se você não sabe o nome do cliente, pergunte gentilmente.
3. **Triagem (Novos Clientes):** Descubra o que o cliente precisa (Previdenciário, Cível, Trabalhista, etc).
4. **Clientes Antigos:** Se a pessoa já for cliente, ofereça o link do Portal do Cliente para acompanhamento e envio de documentos: "O senhor(a) pode acompanhar tudo e mandar fotos de documentos direto no nosso Portal Seguro. O link foi enviado pela nossa equipe, ou posso pedir para a secretária reenviar."
5. **Encerramento:** Ao pegar os dados principais, diga que o Dr. Nilton, a Dra. Karolline ou o Dr. José entrarão em contato em breve.

# LIMITES DE SEGURANÇA
- Não discuta valores de honorários.
- Não discuta outros processos.
- Mantenha o foco em registrar a necessidade do cliente e acalmá-lo.`;

  d.nodes.forEach(n => {
    if (n.name === "Agente IA") {
      if (!n.parameters.options) n.parameters.options = {};
      n.parameters.options.systemMessage = systemPrompt;
    }
    if (n.name === "Encontrar Cliente") {
      n.parameters.tableId = "clients";
      if (n.parameters.filters && n.parameters.filters.conditions) {
        n.parameters.filters.conditions[0].keyName = "whatsapp";
        // Convert to 5594... format if not already
        n.parameters.filters.conditions[0].keyValue = "={{ $('Dados Lead').item.json.Telefone }}"; 
      }
    }
    if (n.name === "Criar Cliente") {
      n.parameters.tableId = "clients";
      n.parameters.fieldsUi = {
        fieldValues: [
          { keyName: "name", keyValue: "={{ $('Dados Lead').item.json.Nome }}" },
          { keyName: "whatsapp", keyValue: "={{ $('Dados Lead').item.json.Telefone }}" },
          { keyName: "office_id", keyValue: officeId },
          { keyName: "user_id", keyValue: userId },
          { keyName: "notes", keyValue: "Lead via WhatsApp (n8n)" }
        ]
      };
    }
  });

  const putResp = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ nodes: d.nodes })
  });

  if (putResp.ok) {
    console.log("SUCCESS! Workflow updated in n8n.");
  } else {
    console.log("FAILED to update workflow:", await putResp.text());
  }
}

run().catch(console.error);
