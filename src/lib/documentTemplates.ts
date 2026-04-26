import fs from 'fs';
import path from 'path';

/**
 * Gera documento a partir de modelo local substituindo placeholders pelos dados do cliente e extras.
 * @param templateFile Nome do arquivo de modelo (ex: RECIBO.docx)
 * @param data Dados para preencher os placeholders (ex: { CLIENTE_NOME: 'João' })
 * @returns Uint8Array do arquivo final
 */
export async function generateDocumentFromTemplate(templateFile: string, data: Record<string, string | number>): Promise<Uint8Array> {
  const modelosDir = path.resolve(process.cwd(), 'modelos-de_documentos');
  const templatePath = path.join(modelosDir, templateFile);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Modelo não encontrado: ${templateFile}`);
  }
  const content = fs.readFileSync(templatePath);
  // Apenas para .docx: substituição básica de placeholders
  if (templateFile.toLowerCase().endsWith('.docx')) {
    // Usar docxtemplater/pizzip se disponível, senão substituição simples
    try {
      const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([
        import('pizzip'),
        import('docxtemplater'),
      ]);
      const zip = new PizZip(content);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
      doc.setData(data);
      doc.render();
      // Retornar como Uint8Array
      return new Uint8Array(doc.getZip().generate({ type: 'uint8array' }));
    } catch (e) {
      throw new Error('Falha ao gerar documento docx: ' + (e as Error).message);
    }
  } else if (templateFile.toLowerCase().endsWith('.txt')) {
    let text = content.toString('utf-8');
    for (const [key, value] of Object.entries(data)) {
      text = text.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }
    return new TextEncoder().encode(text);
  } else {
    throw new Error('Formato de modelo não suportado. Use .docx ou .txt');
  }
}
