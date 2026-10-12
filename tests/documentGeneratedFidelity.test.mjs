import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const project = fileURLToPath(new URL('..', import.meta.url));
const bundled = await build({ stdin:{ contents:"export * from './src/lib/documentData';", resolveDir:project, loader:'ts' }, bundle:true, write:false, platform:'node', format:'esm', logLevel:'silent' });
const model = await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const decode = text => text.replace(/&(amp|lt|gt|quot|apos|#x[0-9a-f]+|#\d+);/gi, (_,entity) => {
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  return named[entity] ?? String.fromCodePoint(entity.startsWith('#x')?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10));
});
const bodyText = xml => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(match=>decode(match[1])).join('');
const contexts = [
  { NOME:'CLIENTE FICTÍCIO ALFA DE OLIVEIRA E SILVA', NACIONALIDADE:'brasileira', CPF:'000.000.000-00', RG:'RG FICTÍCIO ALFA', ENDERECO:'Rua Fictícia de Testes, 10, Bairro Exemplo, Cidade Fictícia - PA', ENDERECO_COMPLETO:'Rua Fictícia de Testes, 10, Bairro Exemplo, Cidade Fictícia - PA', PROFISSAO:'Analista fictício' },
  { NOME:'CLIENTE FICTÍCIO BETA', NACIONALIDADE:'brasileiro', CPF:'111.111.111-11', RG:'RG FICTÍCIO BETA', ENDERECO:'Rua Exemplo, 20, Cidade Fictícia - PA', ENDERECO_COMPLETO:'Rua Exemplo, 20, Cidade Fictícia - PA', PROFISSAO:'Técnico fictício' },
];
for (const template of model.DOCUMENT_TEMPLATES) test(`full approved Word text and every fixed package part survive two fictitious contexts: ${template.id}`, () => {
  const sourceBytes=readFileSync(resolve(project,'public/templates',model.resolveTemplateAssetName(template.file)));
  const source=new PizZip(sourceBytes), original=bodyText(source.file('word/document.xml').asText());
  assert.equal(/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(original),false,'Template must not retain literal client CPF');
  assert.equal(Boolean(source.file('docProps/thumbnail.jpeg')),false,'Personal thumbnail must be absent');
  for (const context of contexts) {
    const fields=model.prepareDocumentData(context,new Date(2026,9,12,12));
    assert.deepEqual(model.getMissingDocumentFields(fields,template.file),[]);
    const doc=new Docxtemplater(new PizZip(sourceBytes),{paragraphLoop:true,linebreaks:true,delimiters:{start:'{',end:'}'},nullGetter:()=> '________'});
    doc.render(fields);
    const generated=new PizZip(doc.getZip().generate({type:'nodebuffer'}));
    const expected=original.replace(/\{([A-Z_]+)\}/g,(_,key)=>fields[key]);
    const result=bodyText(generated.file('word/document.xml').asText());
    assert.ok(result===expected,'Full approved visible text must equal only the declared slot substitutions');
    assert.equal(/\{[A-Z_]+\}|undefined/.test(result),false,'Every variable must resolve');
    assert.ok(result.includes(context.NOME)&&result.includes(context.CPF)&&result.includes(fields.DATA_ATUAL),'Client and current emission date must be present');
    for (const [name,part] of Object.entries(source.files)) {
      if(part.dir||name==='word/document.xml')continue;
      const after=generated.file(name); assert.ok(after,'Fixed package part must remain present');
      if(name==='[Content_Types].xml')assert.ok(part.asText().replace(/\r\n/g,'\n')===after.asText().replace(/\r\n/g,'\n'),'Only the library newline normalization is allowed');
      else assert.ok(part.asNodeBuffer().equals(after.asNodeBuffer()),'Fixed header/footer/styles/media/relationships must remain byte identical');
    }
  }
});

test('canonical legacy aliases all resolve to dated v2 assets, keeping old canonical paths separate', () => {
  for (const name of ['CONTRATO_MODELO_AUX_POR_INCAP_TEMPORARIA.docx','CONTRATO_MODELO_BPC-LOAS.docx','CONTRATO_MODELO_RECLAMAÇÃO_TRABALHISTA.docx','CONTRATO_MODELO_RECLAMACAO_TRABALHISTA.docx','PROCURAÇÃO.docx','PROCURACAO.docx']) assert.match(model.resolveTemplateAssetName(name), /_v2\.docx$/);
});
