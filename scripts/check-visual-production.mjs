// Production-compatible presentation: actual router/pages/helpers, synthetic transport.
// No remote credentials, queries or writes. Run after npm run build.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { runVisualMatrix } from './visual-production-matrix.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.env.JURIS_PREVIEW_DIR || join(root, 'tmp/visual-production-qa'));
mkdirSync(output, { recursive: true });
const runtime = createRequire(process.env.PLAYWRIGHT_PACKAGE_ROOT ? join(process.env.PLAYWRIGHT_PACKAGE_ROOT, 'package.json') : import.meta.url);
const { chromium } = runtime('playwright');
const git = (...args) => execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), ...args], { cwd: root, encoding: 'utf8' });
const base = 'e6862a5';
const digest = content => createHash('sha256').update(content).digest('hex');
const allowed = new Set(['src/index.css', 'src/main.tsx', 'src/ui/layouts/AppLayout.tsx', 'src/ui/navigation/Sidebar.tsx', 'src/ui/navigation/Topbar.tsx', 'src/ui/pages/DashboardPage.tsx']);
// Root-reviewed brand-only edits and compatible dependency refresh, 2026-10-05.
// Exact physical hashes are required; these are not blanket exclusions.
const reviewed = {
  'package.json': 'db396b2b578714a9813842aab776b999d296fb07d922752058b5e5685d7e3d62',
  'package-lock.json': '82a33b9389b1a00dbf5392501372d73e864a0af9aee635604dbeb878a03da8c6',
  'src/lib/pdfGenerator.ts': '9d97f5b0c529e5def4002cf7877fc242ff6331dd164cd2c2f532e37a5c96cc3e',
  'src/lib/receiptPdf.ts': '5c953a2c6c56abcdff603626aa3aa5f82ca42e1b0287cbeb4d44e2289e48b59c',
  'src/ui/pages/AiReportsPage.tsx': 'bce9eefdbd0ced1aba663b5e9ef44c13c06e89bc09b31eb336d30580cf8e0702',
  'src/ui/pages/CaseDetailsPage.tsx': 'ad953020b25a02a713369481389fc753b5a538934a272fb5612ba6f1e7242a40',
  'src/ui/pages/ReceiptsPage.tsx': '626b6efc36c4b4e7f6d0fdd71e9b6bf101e057ffe8dbf024e168389fdcb55177',
  'scripts/verify-preview-source.mjs': '5446406a02fd93f56f7242f9398aa9be46ac28c578fab8a89508c94111f2034e',
  'docs/release/2026-10-05-preview-source-manifest.json': 'bf632c029a59f4c3c7156dae58fd7295169d0a37aa454bd8b1597d0b96bda145',
};
// Exact T21 class transforms and compiler configurations; Auth/router/business
// remain protected, even when an operational TSX has a spacing token renamed.
const t21 = JSON.parse(readFileSync(join(root,'scripts/visual-production-t21-contracts.json'),'utf8'));
for(const [path,change] of Object.entries(t21.mechanical))assert.equal(digest(readFileSync(join(root,path))),change.after,'T21 mechanical source drift: '+path);
for(const [path,hash] of Object.entries(t21.configuration)){
  if(hash===null)assert.equal(existsSync(join(root,path)),false,'Retired compiler source reappeared: '+path);
  else assert.equal(digest(readFileSync(join(root,path))),hash,'T21 configuration drift: '+path);
}
for(const [path,hash] of Object.entries(reviewed))if(!Object.hasOwn(t21.configuration,path)&&!Object.hasOwn(t21.mechanical,path))assert.equal(digest(readFileSync(join(root,path))),hash,'Reviewed change drift: '+path);
const changed = git('diff', '--name-only', base).trim().split(/\r?\n/).filter(Boolean);
assert.deepEqual(changed.filter(path => !allowed.has(path)&&!Object.hasOwn(reviewed,path)&&!Object.hasOwn(t21.configuration,path)&&!Object.hasOwn(t21.mechanical,path)), [], 'Changes must stay in presentation or exact reviewed sources');
// Every tracked Auth, router, API, library, page, widget and asset outside the six
// approved presentation files must retain its Git blob (including normal CRLF filters).
const protectedFiles = git('ls-tree', '-r', '--name-only', base).trim().split(/\r?\n/).filter(path => /^(?:src\/|api\/|public\/)|^(?:package(?:-lock)?\.json|\.vercelignore|vite\.config\.ts|tailwind\.config\.js|postcss\.config\.js)$/.test(path) && !allowed.has(path));
for (const path of protectedFiles)if(!Object.hasOwn(reviewed,path)&&!Object.hasOwn(t21.configuration,path)&&!Object.hasOwn(t21.mechanical,path))assert.equal(git('hash-object', '--path=' + path, path).trim(), git('rev-parse', base + ':' + path).trim(), 'Protected source changed: ' + path);
const receiptDigest = digest(readFileSync(join(root, 'src/lib/receipts.ts')));
assert.equal(receiptDigest, 'bda16cdbdad9684a011dc76f88d201b50c614c52d02bc8ace961462fc658be3a');
const routerSource = readFileSync(join(root, 'src/router/AppRouter.tsx'), 'utf8');
const availableRoutes = [...routerSource.matchAll(/path="([^"]+)"/g)].map(match => match[1]);
const routeMatches = path => availableRoutes.some(route => route !== '*' && new RegExp('^' + route.replace(/:[^/]+/g, '[^/]+') + '$').test(path));

const fixture = `
const iso=h=>new Date(Date.now()+h*3600000).toISOString();
const office='00000000-0000-4000-8000-000000000001';
const actor='00000000-0000-4000-8000-000000000002';
const role=new URLSearchParams(location.search).get('role')||'admin';
window.fixture={calls:[],writes:[],rpcs:[],radar:[],signouts:0,role,office,actor,
clients:[{id:'client-alpha',name:'CLIENTE FICTÍCIO ALFA',person_type:'pf',contact_type:'client',user_id:actor,created_at:iso(-50),avatar_path:null,phone:null,whatsapp:null,email:null,cpf:null,cnpj:null,birth_date:null}],
cases:[{id:'case-alpha',title:'CASO FICTÍCIO ALFA',status:'active',client_id:'client-alpha',created_at:iso(-50)}],
tasks:[{id:'task-late',title:'Conferir documentos fictícios',description:null,status_v2:'open',priority:'high',due_at:iso(-24),created_at:iso(-50),done_at:null,assigned_to_user_id:actor,created_by_user_id:actor,client_id:'client-alpha',case_id:null,client:[{id:'client-alpha',name:'CLIENTE FICTÍCIO ALFA'}],case:[],subtasks:[]},{id:'task-today',title:'Preparar reunião fictícia',status_v2:'in_progress',priority:'medium',due_at:iso(4),created_at:iso(-30),done_at:null,assigned_to_user_id:actor,client_id:null,case_id:'case-alpha',client:[],case:[{id:'case-alpha',title:'CASO FICTÍCIO ALFA'}],subtasks:[]},{id:'task-none',title:'Organizar cadastro fictício',status_v2:'paused',priority:'medium',due_at:null,created_at:iso(-20),done_at:null,assigned_to_user_id:actor,client_id:null,case_id:null,client:[],case:[],subtasks:[]}],
agenda_items:[{id:'agenda-one',kind:'deadline',title:'Prazo fictício de teste',starts_at:null,due_date:new Date().toLocaleDateString('en-CA'),responsible_user_id:actor,status:'confirmed',created_at:iso(-24),all_day:true,agenda_id:'agenda-main',client_id:null,case_id:null}],
agendas:[{id:'agenda-main',office_id:office,name:'AGENDA FICTÍCIA',color:'#927443'}],
finance_parties:[{id:'partner-alpha',user_id:actor,name:'PARCEIRO FICTÍCIO ALFA',phone:null,email:'alfa@exemplo.invalid',kind:'external',created_at:iso(-24)}],
finance_transactions:[{amount_cents:150000,type:'income',status:'planned'},{amount_cents:85000,type:'income',status:'planned'}],
user_profiles:[{user_id:actor,display_name:'PESSOA FICTÍCIA DE TESTE',email:'teste@exemplo.invalid',office_id:office,created_at:iso(-48)}],
office_members:[{id:'membership-test',office_id:office,user_id:actor,role,created_at:iso(-48)}],
notifications:[{id:'notice-test',office_id:office,user_id:actor,title:'NOTIFICAÇÃO FICTÍCIA',message:'Somente dados sintéticos.',type:'info',is_read:false,created_at:iso(-1)}]};
window.fixture.from=table=>{
 let fields='',options={},single=false,operation='read',payload;const clauses=[];
 const q={select(value,opts){fields=value;options=opts||{};return q},eq(key,value){clauses.push(['eq',key,value]);return q},neq(key,value){clauses.push(['neq',key,value]);return q},in(key,value){clauses.push(['in',key,value]);return q},gte(key,value){clauses.push(['gte',key,value]);return q},not(...values){clauses.push(['not',...values]);return q},is(...values){clauses.push(['is',...values]);return q},or(value){clauses.push(['or',value]);return q},ilike(key,value){clauses.push(['ilike',key,value]);return q},order(...values){clauses.push(['order',...values]);return q},limit(value){clauses.push(['limit',value]);return q},range(){return q},maybeSingle(){single=true;return q},single(){single=true;return q},insert(value){operation='insert';payload=value;return q},upsert(value){operation='upsert';payload=value;return q},update(value){operation='update';payload=value;return q},delete(){operation='delete';return q},then(accept,reject){
  return Promise.resolve().then(()=>{
   const f=window.fixture; f.calls.push({table,fields,options,clauses,operation});
   if(operation!=='read'){
    if(!['finance_parties','notifications','user_profiles'].includes(table))throw new Error('Unexpected visual-fixture write: '+table+'/'+operation);
    f.writes.push({table,operation,payload:structuredClone(payload),clauses:structuredClone(clauses)});
    if(table==='user_profiles')return {data:single?f.user_profiles[0]:f.user_profiles,error:null};
    if(operation==='insert')f[table].push({...payload,id:'created-synthetic',created_at:iso(0)});
    if(operation==='update')for(const row of f[table])if(clauses.every(([op,key,value])=>op!=='eq'||row[key]===value))Object.assign(row,payload);
    if(operation==='delete')f[table]=f[table].filter(row=>!clauses.every(([op,key,value])=>op!=='eq'||row[key]===value));
    return {data:null,error:null};
   }
   const failure=new URLSearchParams(location.search).get('failure');
   if(failure==='core'&&table==='tasks'&&fields.includes('title'))return {data:null,count:null,error:{message:'Falha sintética nas tarefas'}};
   if(failure==='optional'&&(table==='finance_transactions'||table==='tasks'&&options.head||table==='cases'&&clauses.some(c=>c[1]==='status')))return {data:null,count:null,error:{message:'Indicador sintético indisponível'}};
   if(failure==='trend'&&table==='tasks'&&['created_at','done_at'].includes(fields))return {data:null,count:null,error:{message:'Série sintética indisponível'}};
   let rows=f[table]||[];if(failure==='empty'&&!['office_members','user_profiles'].includes(table))rows=[];
   rows=rows.filter(row=>clauses.every(([op,key,value])=>op==='eq'?row[key]===value:op==='neq'?row[key]!==value:op==='in'?value.includes(row[key]):op==='ilike'?String(row[key]).toLowerCase()===value.toLowerCase():op==='not'&&value==='is'?row[key]!=null:true));
   return {data:options.head?null:single?structuredClone(rows[0]||null):structuredClone(rows),count:rows.length,error:null};
  }).then(accept,reject);
 }};return q;
};
`;
const stubs = {
  '@/auth/authStore': `export function useAuth(){return {isAuthenticated:new URLSearchParams(location.search).get('auth')!=='no',isReady:true,signOut:async()=>{window.fixture.signouts++}}};export function AuthProvider({children}){return children}`,
  '@/lib/supabaseDb': `export async function getAuthedUser(){if(new URLSearchParams(location.search).get('auth')==='no')throw new Error('Sessão fictícia ausente');return {id:window.fixture.actor,email:'teste@exemplo.invalid',user_metadata:{full_name:'PESSOA FICTÍCIA DE TESTE'}}};export function requireSupabase(){return {from:window.fixture.from,rpc:async(name,args)=>{window.fixture.rpcs.push({name,args});throw new Error('Unexpected RPC in presentation fixture: '+name)},storage:{from(){throw new Error('Storage access not allowed in this presentation fixture')}}}}`,
  '@/lib/datajud': `export async function fetchEscavadorProcesso(cnj){window.fixture.radar.push(cnj);throw new Error('Consulta externa bloqueada nesta prévia')}`,
};
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {AppRouter} from './src/router/AppRouter';import {initializeWorkspaceVisual} from './src/lib/workspaceVisual';import {initTheme} from './src/lib/theme';initTheme();initializeWorkspaceVisual();createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><AppRouter/></QueryClientProvider>);`;
const bundle = await build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'import.meta.env': '{}' }, banner: { js: fixture }, logLevel: 'silent', plugins: [{ name: 'synthetic-transport', setup(builder) {
  builder.onResolve({ filter: /^@\// }, args => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: 'synthetic' } : undefined);
  builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, args => ({ contents: stubs[args.path], loader: 'js' }));
} }] });
const cssPath = join(root, 'dist/assets', readdirSync(join(root, 'dist/assets')).find(name => /^index-.*\.css$/.test(name)));
let css = readFileSync(cssPath, 'utf8');
if(process.env.JURIS_MATRIX_T3_CSS){
  css=readFileSync(process.env.JURIS_MATRIX_T3_CSS,'utf8');
  assert.equal(digest(css),'0e62ea98da74fbf8c4cef2b9da05ae98e6812276250119e95426e7a11fadd1aa','Recompiled T3 CSS must equal frozen T3 compiler output');
  // Only selector aliases reconcile the proven mechanical class-name transform;
  // custom properties such as --tw-space-y-reverse retain their original names.
  css=css.replace(/(?<![\w-])(-?)space-([xy])-/g,(_,negative,axis)=>negative+'legacy-space-'+axis+'-');
}
const images = new Set(['/brand/lima-diogenes-logo-dark.png', '/brand/lima-diogenes-logo-light.png', '/brand/lima-diogenes-icon.png']);
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (images.has(pathname)) { res.setHeader('Content-Type', 'image/png'); return res.end(readFileSync(join(root, 'public', pathname))); }
  if (pathname.startsWith('/api/') || pathname.startsWith('/storage/')) { res.statusCode = 503; return res.end('Fixture refuses provider traffic'); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self'; worker-src 'self' blob:");
  res.end('<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style><div id="root"></div><script>' + bundle.outputFiles[0].text.replaceAll('</script', '<\\/script') + '</script></html>');
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = 'http://127.0.0.1:' + server.address().port;
const report = { synthetic: true, base, protectedFiles: protectedFiles.length-Object.keys(reviewed).length, reviewed, receiptDigest, cssDigest: digest(css), cases: [], screenshots: [], network: [], errors: [], contrast: [], dashboardContracts: {}, navigationContracts: {}, limitations: ['Fresh browsers use actual router, authorization boundaries, pages and business libraries with a synthetic transport; this does not validate real Auth/RLS or deployment.', 'No real office data, credentials, providers or mutations are accessed.', 'Operational editors keep their legacy palette and logic. The classic dashboard keeps the published content.', 'Storage/PDF/WhatsApp/email/document rendering are unchanged and are outside this visual check.'] };
let browser;
try {
  if(process.env.JURIS_PREVIEW_ONLY==='1'){console.log(JSON.stringify({synthetic:true,url:url+'/app?visual=reference',externalNetwork:'blocked by CSP and synthetic transport'}));await new Promise(()=>{});}
  browser = await chromium.launch({ headless: true, ...(process.env.JURIS_BROWSER_PATH ? { executablePath: process.env.JURIS_BROWSER_PATH } : {}) });
  if(process.env.JURIS_VISUAL_MATRIX==='1'){
    const matrix=await runVisualMatrix({browser,url,output});
    writeFileSync(join(output,'visual-matrix-report.json'),JSON.stringify({...matrix,base,reviewed,receiptDigest,cssDigest:digest(css),t21:{spacing:t21.spacing,invalid:t21.invalid,mechanicalFiles:Object.keys(t21.mechanical).length},cssMode:process.env.JURIS_MATRIX_T3_CSS?'frozen-T3-with-spacing-selector-aliases':'current',baselineCssDigest:process.env.JURIS_MATRIX_T3_CSS?digest(readFileSync(process.env.JURIS_MATRIX_T3_CSS)):null},null,2)+'\n');
    console.log(JSON.stringify({passed:matrix.passed,cases:matrix.cases.length,visibleElements:matrix.cases.reduce((sum,item)=>sum+item.dom.length,0),report:join(output,'visual-matrix-report.json')},null,2));
  }else{
  async function scenario(name, run) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Asuncion' });
    await context.route('**/*', route => { if (route.request().url().startsWith(url)) return route.continue(); report.network.push(route.request().url()); return route.abort(); });
    const page = await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror', error => report.errors.push({name,error:error.message}));
    try { await run(page); report.cases.push({ name, passed: true }); } finally { await context.close(); }
  }
  async function geometry(page) { const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width,'Horizontal overflow: '+JSON.stringify(size)); }
  async function capture(page, name) { await page.mouse.move(0,0);await geometry(page);const path=join(output,name+'.png');await page.screenshot({path,fullPage:true});report.screenshots.push(path); }
  async function contrast(locator,label) {
    const ratio=await locator.evaluate(el=>{
      const rgb=value=>{const values=value.match(/[\d.]+/g).map(Number);return [...values.slice(0,3),values[3]??1]};
      const over=(a,b)=>[...a.slice(0,3).map((value,i)=>value*a[3]+b[i]*(1-a[3])),1];
      const ancestors=[];for(let node=el;node;node=node.parentElement)ancestors.push(rgb(getComputedStyle(node).backgroundColor));
      const bg=ancestors.reverse().reduce((under,top)=>over(top,under),[255,255,255,1]);const fg=over(rgb(getComputedStyle(el).color),bg);
      const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      return (Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05);
    });report.contrast.push({label,ratio,minimum:4.5});assert.ok(ratio>=4.5,label+' contrast '+ratio);
  }
  const dashboardReady = async (page, visual='reference') => { await page.getByRole('heading',{name:visual==='reference'?'Visão geral do escritório':'Dashboard executivo',exact:true}).waitFor();await page.waitForFunction(()=>window.fixture.calls.filter(c=>c.table==='tasks'&&c.operation==='read').length>=5); };
  for(const role of ['admin','user'])for(const visual of ['classic','reference'])await scenario('Dashboard contract '+role+'/'+visual,async page=>{
    await page.goto(url+'/app?visual='+visual+'&role='+role);await dashboardReady(page,visual);
    report.dashboardContracts[role+'/'+visual]=await page.evaluate(()=>window.fixture.calls.filter(c=>['clients','cases','tasks','agenda_items','finance_transactions'].includes(c.table)&&c.operation==='read').map(c=>({...c,clauses:c.clauses.map(clause=>clause[0]==='gte'?[clause[0],clause[1],'TIME']:clause[0]==='or'?[clause[0],clause[1].replace(/\d{4}-\d{2}-\d{2}(?:T[^,)]+)?/g,'TIME')]:clause)})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
    const nav=page.locator('aside nav');assert.equal(await nav.getByRole('link',{name:'Financeiro',exact:true}).count(),role==='admin'?1:0);
    report.navigationContracts[role+'/'+visual]=await nav.locator('a').evaluateAll(elements=>elements.map(element=>element.getAttribute('href')).sort());
    for(const link of await nav.locator('a').all())assert.ok(routeMatches(await link.getAttribute('href')),'Sidebar points to missing route');
    assert.equal(await page.evaluate(()=>window.fixture.rpcs.length),0,'No new permission or business RPC');
    if(visual==='reference'&&role==='admin'){
      await page.getByRole('link',{name:/Receitas planejadas/}).filter({hasText:'2.350'}).waitFor();
      assert.ok(await page.locator('.recharts-pie-sector path').count()>0);
      await page.evaluate(()=>document.documentElement.setAttribute('data-app-theme','light'));
      assert.equal(await nav.evaluate(el=>getComputedStyle(el.parentElement).backgroundColor),'rgb(13, 20, 24)');
      assert.equal(await page.locator('main').evaluate(el=>getComputedStyle(el).color),'rgb(23, 32, 38)');
      await contrast(nav.locator('[aria-current="page"]'),'Active sidebar item');await contrast(page.locator('.dashboard-reference .text-\\[\\#8a8e91\\]').first(),'Dashboard secondary text');await contrast(page.locator('.recharts-legend-item-text').first(),'Chart legend');
      await capture(page,'dashboard-novo-desktop');
      await page.getByRole('tab',{name:'Tarefas',exact:true}).click();await page.getByRole('button',{name:'Atrasadas',exact:true}).click();assert.equal(await page.getByRole('link',{name:/Conferir documentos fictícios/}).count(),1);assert.equal(await page.getByRole('link',{name:/Preparar reunião fictícia/}).count(),0);
      await page.getByRole('tab',{name:'Visão geral',exact:true}).click();await page.setViewportSize({width:390,height:844});await capture(page,'dashboard-novo-mobile');
      await page.getByRole('button',{name:'Abrir menu',exact:true}).click();const mobile=page.getByRole('navigation',{name:'Navegação móvel'});await mobile.getByRole('link',{name:'Gerar documentos',exact:true}).waitFor();for(const link of await mobile.locator('a').all())assert.ok(routeMatches(await link.getAttribute('href')));await capture(page,'menu-novo-mobile');await page.keyboard.press('Escape');assert.equal(await mobile.count(),0);
    }
    if(visual==='classic'&&role==='admin'){await capture(page,'dashboard-classico-desktop');await page.getByRole('button',{name:'Alternar tema claro/escuro'}).click();assert.equal(await page.locator('.workspace-classic').evaluate(el=>getComputedStyle(el).colorScheme),'light');}
  });
  for(const role of ['admin','user']){
    assert.deepEqual(report.dashboardContracts[role+'/reference'],report.dashboardContracts[role+'/classic'],'Dashboard queries changed for '+role);
    assert.deepEqual(report.navigationContracts[role+'/reference'].filter(path=>path!=='/app/financeiro/parceiros'),report.navigationContracts[role+'/classic'],'Existing sidebar routes or role filters changed for '+role);
  }
  for(const visual of ['reference','classic'])await scenario('Retained Radar '+visual,async page=>{
    await page.goto(url+'/app?visual='+visual);await dashboardReady(page,visual);
    if(visual==='reference')await page.getByText('Consultar processo no Escavador',{exact:true}).click();
    await page.getByPlaceholder('0000000-00.0000.0.00.0000').fill('0000000-00.2026.0.00.0000');await page.getByRole('button',{name:'Buscar processo',exact:true}).click();
    await page.getByText('Consulta externa bloqueada nesta prévia',{exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>window.fixture.radar),['0000000-00.2026.0.00.0000']);
  });
  for(const failure of ['empty','core','optional','trend'])await scenario('Dashboard state '+failure,async page=>{
    await page.goto(url+'/app?visual=reference&failure='+failure);await dashboardReady(page);
    if(failure==='empty'){await page.getByText('Nenhuma tarefa pendente.',{exact:true}).first().waitFor();assert.match(await page.getByRole('link',{name:/Clientes cadastrados/}).innerText(),/\b0\b/);}
    if(failure==='core'){await page.getByRole('alert').filter({hasText:'Falha sintética nas tarefas'}).waitFor();assert.match(await page.getByRole('link',{name:/Clientes cadastrados/}).innerText(),/—.*Dados indisponíveis/s);}
    if(failure==='optional'){await page.getByRole('link',{name:/Receitas planejadas/}).filter({hasText:'Dados indisponíveis'}).waitFor();assert.equal(await page.getByRole('alert').count(),0);await page.getByRole('link',{name:/Conferir documentos fictícios/}).first().waitFor();}
    if(failure==='trend'){await page.getByText('Dados indisponíveis',{exact:true}).first().waitFor();assert.equal(await page.getByRole('alert').count(),0);assert.equal(await page.getByText('Dados indisponíveis',{exact:true}).count(),2);}
    await geometry(page);
  });
  for(const visual of ['reference','classic'])await scenario('Legacy partner CRUD and draft '+visual,async page=>{
    await page.goto(url+'/app/financeiro/parceiros?visual='+visual);await page.getByText('PARCEIRO FICTÍCIO ALFA',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Novo parceiro',exact:true}).click();await page.getByLabel('Nome',{exact:true}).fill('PARCEIRO FICTÍCIO NOVO');
    if(visual==='reference'){await contrast(page.getByLabel('Nome',{exact:true}),'Partner input');await contrast(page.getByRole('button',{name:'Salvar',exact:true}),'Partner save button');}
    page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('combobox',{name:'Visual do sistema'}).selectOption(visual==='reference'?'classic':'reference');assert.equal(await page.getByLabel('Nome',{exact:true}).inputValue(),'PARCEIRO FICTÍCIO NOVO');assert.equal(new URL(page.url()).searchParams.get('visual'),visual);
    await page.getByRole('button',{name:'Salvar',exact:true}).click();await page.getByText('PARCEIRO FICTÍCIO NOVO',{exact:true}).waitFor();
    const insert=await page.evaluate(()=>window.fixture.writes.find(w=>w.table==='finance_parties'&&w.operation==='insert'));assert.deepEqual(insert.payload,{user_id:'00000000-0000-4000-8000-000000000002',kind:'external',name:'PARCEIRO FICTÍCIO NOVO',phone:null,email:null});
    await page.getByRole('button',{name:'Editar',exact:true}).last().click();await page.getByLabel('Nome',{exact:true}).fill('PARCEIRO FICTÍCIO REVISADO');await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();await page.getByText('PARCEIRO FICTÍCIO REVISADO',{exact:true}).waitFor();
    page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Excluir',exact:true}).last().click();await page.getByText('PARCEIRO FICTÍCIO REVISADO',{exact:true}).waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>window.fixture.rpcs.length),0);if(visual==='reference'){await capture(page,'parcerias-novo-desktop');await page.setViewportSize({width:390,height:844});await capture(page,'parcerias-novo-mobile');}
  });
  await scenario('Visual switch retains route and safe legacy palette',async page=>{
    await page.goto(url+'/app/clientes?visual=reference');await page.getByRole('heading',{name:'Clientes',exact:true}).waitFor();await page.locator('tbody').getByText('CLIENTE FICTÍCIO ALFA').first().waitFor();
    await page.evaluate(()=>document.documentElement.setAttribute('data-app-theme','light'));assert.equal(await page.locator('main').evaluate(el=>getComputedStyle(el).colorScheme),'dark');
    await page.getByRole('button',{name:'Novo cliente',exact:true}).click();await page.getByLabel('Nome / Razão Social',{exact:true}).fill('RASCUNHO FICTÍCIO PRESERVADO');page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('combobox',{name:'Visual do sistema'}).selectOption('classic');assert.equal(await page.getByLabel('Nome / Razão Social',{exact:true}).inputValue(),'RASCUNHO FICTÍCIO PRESERVADO');await capture(page,'clientes-formulario-paleta-preservada');await page.getByRole('button',{name:'Cancelar',exact:true}).click();
    await capture(page,'clientes-paleta-preservada');page.once('dialog',dialog=>dialog.accept());await page.getByRole('combobox',{name:'Visual do sistema'}).selectOption('classic');await page.locator('.workspace-classic').waitFor();assert.equal(new URL(page.url()).pathname,'/app/clientes');await page.locator('tbody').getByText('CLIENTE FICTÍCIO ALFA').first().waitFor();
    await page.goto(url+'/app/tarefas');await page.locator('.workspace-classic').waitFor();await page.getByRole('heading',{name:'Tarefas',exact:true}).waitFor();
    page.once('dialog',dialog=>dialog.accept());await page.getByRole('combobox',{name:'Visual do sistema'}).selectOption('reference');await page.locator('.workspace-reference').waitFor();assert.equal(new URL(page.url()).pathname,'/app/tarefas');await page.getByText('Conferir documentos fictícios',{exact:true}).waitFor();
  });
  await scenario('Existing Auth/admin boundaries',async page=>{
    await page.goto(url+'/app/financeiro/parceiros?visual=reference&role=user');await dashboardReady(page);assert.equal(new URL(page.url()).pathname,'/app');assert.equal(await page.getByRole('heading',{name:'Parceiros',exact:true}).count(),0);assert.equal(await page.evaluate(()=>window.fixture.calls.some(c=>c.table==='finance_parties')),false);
    await page.goto(url+'/app/clientes?visual=reference&auth=no');await page.waitForURL('**/app/login');assert.equal(await page.getByRole('heading',{name:'Clientes',exact:true}).count(),0);assert.equal(await page.evaluate(()=>window.fixture.calls.some(c=>c.table==='clients')),false);
  });
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);
  report.passed=true;report.generatedAt=new Date().toISOString();writeFileSync(join(output,'visual-production-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,cases:report.cases.length,protectedFiles:report.protectedFiles,receiptDigest,screenshots:report.screenshots,report:join(output,'visual-production-report.json')},null,2));
  }
} catch(error) { report.passed=false;report.failure=error.message;writeFileSync(join(output,'visual-production-report.json'),JSON.stringify(report,null,2)+'\n');throw error; }
finally { await browser?.close();await new Promise(done=>server.close(done)); }
