// Exercise the existing document generators with fictitious input and no providers.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.env.JURIS_DOCUMENT_QA_DIR || join(root, 'tmp/brand-document-qa'));
mkdirSync(output, { recursive: true });
const runtime = createRequire(process.env.PLAYWRIGHT_PACKAGE_ROOT ? join(process.env.PLAYWRIGHT_PACKAGE_ROOT, 'package.json') : import.meta.url);
const { chromium } = runtime('playwright');
const templates = ['PROCURAÇÃO.docx'];
const entry = `import {buildReceiptHtml,buildReceiptPdfBlob} from './src/lib/receiptPdf';
import {generateClientDossier} from './src/lib/pdfGenerator';
import {generateDocumentDocx} from './src/lib/docGenerator';
import {BRAND} from './src/lib/brand';
window.documentQA={buildReceiptHtml,buildReceiptPdfBlob,generateClientDossier,generateDocumentDocx,BRAND};`;
const bundle = await build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', logLevel: 'silent' });
const assets = new Map([
  ['/brand/lima-diogenes-logo-light.png', { path: 'public/brand/lima-diogenes-logo-light.png', type: 'image/png' }],
  ...templates.map(name => ['/templates/' + name, { path: 'public/templates/' + name, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }]),
]);
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  if (req.method !== 'GET') { res.statusCode = 405; return res.end('No writes'); }
  if (assets.has(pathname)) { const asset = assets.get(pathname); res.setHeader('Content-Type', asset.type); return res.end(readFileSync(join(root, asset.path))); }
  if (pathname !== '/') { res.statusCode = 404; return res.end('No provider or backend'); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<!doctype html><meta charset="utf-8"><script>' + bundle.outputFiles[0].text.replaceAll('</script', '<\\/script') + '</script>');
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = 'http://127.0.0.1:' + server.address().port;
const report = { synthetic: true, externalRequests: [], errors: [], outputs: [], checks: [], limitations: ['Local generation only; no office data, receipt persistence, Storage, Auth, messaging or cloud deployment.', 'The approved full letterhead and six new contracts are separate deliveries; this check preserves the existing generator layouts and conditions.', 'The existing power-of-attorney template is used only to validate the updated XML parser.'] };
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.JURIS_BROWSER_PATH ? { executablePath: process.env.JURIS_BROWSER_PATH } : {}) });
  const context = await browser.newContext({ acceptDownloads: true });
  await context.route('**/*', route => { if (route.request().url().startsWith(url + '/')) return route.continue(); report.externalRequests.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.documentQA));
  const fixture = { receipt: { id: '00000000-0000-4000-8000-000000000001', office_id: '00000000-0000-4000-8000-000000000002', client_id: '00000000-0000-4000-8000-000000000003', created_by: '00000000-0000-4000-8000-000000000004', amount: 123.45, description: 'AMOSTRA FICTÍCIA DE TESTE', status: 'issued', issued_at: '2026-10-05T12:00:00Z', pdf_url: null, created_at: '2026-10-05T12:00:00Z', payment_method: 'Pix', city: 'Cidade fictícia', lawyer_name: 'ADVOGADA FICTÍCIA TESTE', lawyer_oab: 'TESTE-123', amount_written: 'cento e vinte e três reais e quarenta e cinco centavos' }, client: { name: 'CLIENTE FICTÍCIO TESTE', cpf: null }, officeName: 'Lima e Diógenes Advocacia Especializada' };
  const html = await page.evaluate(data => window.documentQA.buildReceiptHtml(data), fixture);
  assert.ok(html.includes('Lima e Diógenes'));
  assert.ok(html.includes('/brand/lima-diogenes-logo-light.png'));
  assert.ok(!html.includes('JOSÉ LOPES'));
  assert.ok(html.includes(fixture.receipt.lawyer_name) && html.includes(fixture.receipt.lawyer_oab));
  const historical = structuredClone(fixture); historical.receipt.lawyer_name = 'JOSÉ LOPES DA SILVA FILHO'; historical.receipt.lawyer_oab = '36.029';
  const historicalHtml = await page.evaluate(data => window.documentQA.buildReceiptHtml(data), historical);
  assert.equal(historicalHtml.split('JOSÉ LOPES DA SILVA FILHO').length - 1, 3, 'Historic lawyer retained in narrative, own signature and personal footer; institutional footer uses current brand');
  assert.ok(historicalHtml.includes('36.029'));
  const hostile = structuredClone(fixture); hostile.client.name = '<script>window.unexpected=true</script>';
  const safeHtml = await page.evaluate(data => window.documentQA.buildReceiptHtml(data), hostile);
  assert.ok(!safeHtml.toLowerCase().includes('<script>'));
  report.checks.push('Current institution and PNG logo, lawyer from persisted fields, historical authorship and HTML escaping');
  const bytes = await page.evaluate(async data => Array.from(new Uint8Array(await (await window.documentQA.buildReceiptPdfBlob(data)).arrayBuffer())), fixture);
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), '%PDF-');
  writeFileSync(join(output, 'recibo-ficticio.pdf'), Buffer.from(bytes));
  writeFileSync(join(output, 'recibo-ficticio.html'), html);
  report.outputs.push('recibo-ficticio.pdf', 'recibo-ficticio.html');
  const dossierDownload = page.waitForEvent('download');
  await page.evaluate(() => window.documentQA.generateClientDossier({name:'CLIENTE FICTÍCIO TESTE',notes:'Amostra local sem dados reais.'},[{title:'CASO FICTÍCIO TESTE',status:'open'}],{totalReceitas:123.45,totalDespesas:0,saldo:123.45}));
  await (await dossierDownload).saveAs(join(output, 'dossie-ficticio.pdf'));
  report.outputs.push('dossie-ficticio.pdf');
  const docxDownload = page.waitForEvent('download');
  await page.evaluate(() => window.documentQA.generateDocumentDocx({nome:'CLIENTE FICTÍCIO TESTE',nacionalidade:'FICTÍCIA',estadoCivil:'FICTÍCIO',profissao:'TESTE',cpf:'________',rg:'________',enderecoCompleto:'ENDEREÇO FICTÍCIO DE TESTE'}, 'PROCURAÇÃO.docx'));
  await (await docxDownload).saveAs(join(output, 'procuracao-ficticia.docx'));
  report.outputs.push('procuracao-ficticia.docx');
  assert.deepEqual(report.externalRequests, []); assert.deepEqual(report.errors, []);
  report.sourceHashes = Object.fromEntries(['src/lib/receiptPdf.ts','src/lib/pdfGenerator.ts','src/lib/docGenerator.ts','package-lock.json'].map(path => [path, createHash('sha256').update(readFileSync(join(root,path))).digest('hex')]));
  report.passed = true; report.generatedAt = new Date().toISOString();
  writeFileSync(join(output,'brand-document-report.json'), JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,report:join(output,'brand-document-report.json'),outputs:report.outputs},null,2));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
