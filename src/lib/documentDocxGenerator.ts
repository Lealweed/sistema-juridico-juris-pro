import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';
import { assertDocumentTemplateAvailable, getMissingDocumentFields, prepareDocumentData, resolveTemplateAssetName, type ProcuracaoData } from './documentData';
export { resolveTemplateAssetName } from './documentData';

export async function generateDocumentDocx(
  data: ProcuracaoData | Record<string, string>,
  templateName: string,
  beforeDownload?: () => void | Promise<void>,
): Promise<void> {
  assertDocumentTemplateAvailable(templateName);
  const missing = getMissingDocumentFields(data, templateName);
  if (missing.length) throw new Error(`Preencha antes de gerar: ${missing.join(', ')}.`);
  const resp = await fetch(`/templates/${resolveTemplateAssetName(templateName)}`);
  if (!resp.ok) {
    throw new Error(
      `Template não encontrado. Verifique se o arquivo ${templateName} existe na pasta public/templates/.`,
    );
  }

  const buf = await resp.arrayBuffer();
  const zip = new PizZip(buf);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
    nullGetter: () => '________',
  });

  const isProcuracaoData = 'nome' in data;
  doc.render(prepareDocumentData(data));

  const out = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  const safeName = isProcuracaoData
    ? (data as ProcuracaoData).nome.replace(/[^a-zA-Z0-9À-ÿ ]/g, '').replace(/\s+/g, '_')
    : ((data as Record<string, string>)['NOME'] || 'documento').replace(/[^a-zA-Z0-9À-ÿ ]/g, '').replace(/\s+/g, '_');
  const docTitle = templateName.replace('.docx', '');
  // Callers that need a live authorization check can stop a download after the
  // asynchronous template fetch/render. Existing two-argument callers keep
  // their behavior.
  await beforeDownload?.();
  saveAs(out, `${docTitle}_${safeName}.docx`);
}
