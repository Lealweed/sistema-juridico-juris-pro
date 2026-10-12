import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('..', import.meta.url));
const bundled = await build({ stdin:{ contents:
  "export * from './src/lib/documentData'; export * from './src/lib/documentClientSelection'; export * from './src/lib/documentHistory';",
  resolveDir:project, loader:'ts' }, bundle:true, write:false, platform:'node', format:'esm', logLevel:'silent' });
const model = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const complete = {
  NOME:'CLIENTE FICTÍCIO ALFA', NACIONALIDADE:'brasileira', CPF:'000.000.000-00', RG:'RG FICTÍCIO',
  ENDERECO:'Rua Fictícia, 10, Cidade Exemplo - PA', ENDERECO_COMPLETO:'Rua Fictícia, 10, Cidade Exemplo - PA',
  PROFISSAO:'Analista de teste',
};
const six = model.DOCUMENT_TEMPLATES.filter(template => template.id.startsWith('contrato_'));

test('catalog has exactly the ten official models with distinct IDs and files', () => {
  assert.equal(model.DOCUMENT_TEMPLATES.length, 10);
  assert.equal(six.length, 6);
  assert.equal(new Set(model.DOCUMENT_TEMPLATES.map(template => template.id)).size, 10);
  assert.equal(new Set(model.DOCUMENT_TEMPLATES.map(template => template.file)).size, 10);
  for (const template of six) assert.match(template.file, /^[a-z_]+\.docx$/);
  const bpc = model.DOCUMENT_TEMPLATES.find(template => template.id === 'contrato-bpc');
  assert.equal(bpc.label, 'BPC-LOAS — pessoa com deficiência');
  assert.match(bpc.description, /pessoa com deficiência/);
  assert.equal(bpc.file, 'CONTRATO_MODELO_BPC-LOAS.docx');
});

test('each required field blocks missing or visible-blank values independently', () => {
  for (const template of model.DOCUMENT_TEMPLATES) {
    assert.deepEqual(model.getMissingDocumentFields(complete, template.file), []);
    for (const field of template.fields.filter(field => field.required !== false)) {
      for (const blank of ['', ' ', '________']) {
        assert.deepEqual(model.getMissingDocumentFields({ ...complete, [field.key]:blank }, template.file), [field.label]);
      }
    }
  }
});

test('retirement review never requires an RG absent from its approved model', () => {
  const review = six.find(template => template.id === 'contrato_revisao_aposentadoria');
  assert.ok(review);
  assert.equal(review.fields.some(field => field.key === 'RG'), false);
  assert.deepEqual(model.getMissingDocumentFields({ ...complete, RG:'' }, review.file), []);
  for (const template of six.filter(template => template !== review)) {
    assert.deepEqual(model.getMissingDocumentFields({ ...complete, RG:'' }, template.file), ['RG do cliente']);
  }
});

test('new contracts require nationality but expose no arbitrary fee or clause input', () => {
  for (const template of six) {
    assert.ok(model.getMissingDocumentFields({ ...complete, NACIONALIDADE:'' }, template.file).includes('Nacionalidade do cliente'));
    for (const key of ['VALOR', 'CLAUSULA', 'DATA_ATUAL', 'PROFISSAO', 'ESTADO_CIVIL', 'NOME_MENOR', 'NOME_EX_CONJUGE']) {
      assert.equal(template.fields.some(field => field.key === key), false);
    }
  }
});

test('per-emission drafts preserve client records and do not carry the prior client qualifications', () => {
  const alpha = { id:'10000000-0000-4000-8000-000000000001', name:'CLIENTE FICTÍCIO ALFA', cpf:complete.CPF };
  const beta = { id:'10000000-0000-4000-8000-000000000002', name:'CLIENTE FICTÍCIO BETA', cpf:null };
  const before = structuredClone([alpha, beta]);
  assert.deepEqual(model.initialDocumentFields(alpha, six[0]), { CPF:complete.CPF, NOME:alpha.name });
  assert.deepEqual(model.initialDocumentFields(beta, six[0]), { CPF:'', NOME:beta.name });
  assert.equal(model.findRequestedDocumentClient([beta], alpha.id), null);
  assert.equal(model.findRequestedDocumentClient([alpha], '../' + alpha.id), null);
  assert.deepEqual([alpha, beta], before);
});

test('issue date is derived per emission and unsupported model paths are denied', () => {
  const input = { ...complete };
  const prepared = model.prepareDocumentData(input, new Date(2026, 9, 12, 12));
  assert.equal(prepared.DATA_ATUAL, '12 de outubro de 2026');
  assert.equal('DATA_ATUAL' in input, false);
  assert.throws(() => model.assertDocumentTemplateAvailable('../contrato_alimentos.docx'), /não suportado/);
  assert.throws(() => model.getMissingDocumentFields(complete, 'modelo-desconhecido.docx'), /não suportado/);
});

test('history is isolated by office and user and unread legacy storage is preserved', () => {
  const data = new Map([['docgen_history_v1', 'LEGADO FICTÍCIO SEM ATRIBUIÇÃO']]);
  const storage = { getItem:key=>data.get(key)??null, setItem:(key,value)=>data.set(key,value) };
  const a = { userId:'USER FICTÍCIO A', officeId:'ESCRITÓRIO FICTÍCIO A' };
  const b = { ...a, userId:'USER FICTÍCIO B' };
  const entry = { id:'EMISSÃO FICTÍCIA', date:'2026-10-12T12:00:00Z', clientName:complete.NOME,
    templateLabel:'Procuração', templateFile:'PROCURAÇÃO.docx' };
  assert.equal(model.appendDocumentHistory(storage,a,entry,[]).persisted,true);
  assert.equal(model.readDocumentHistory(storage,a).length,1);
  assert.deepEqual(model.readDocumentHistory(storage,b),[]);
  assert.equal(data.get('docgen_history_v1'),'LEGADO FICTÍCIO SEM ATRIBUIÇÃO');
});
