// Whole-route presentation comparison. Real router/pages/helpers; fake transport only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const candidate=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const option=name=>{const index=process.argv.indexOf(name);return index<0?null:process.argv[index+1];};
const root=resolve(option('--source-root')||candidate);
const output=resolve(option('--output')||join(candidate,'tmp/general-visual-qa'));
const comparePath=option('--compare');
const frozen=resolve(candidate,'../general-visual-before-40066ac-20261005');
const digest=value=>createHash('sha256').update(value).digest('hex');
mkdirSync(output,{recursive:true});
if(existsSync(join(output,'general-visual-report.json')))throw new Error('Refusing to overwrite evidence');
const frozenManifest=JSON.parse(readFileSync(join(frozen,'frozen-source-manifest.json'),'utf8'));
if(root===frozen)for(const file of frozenManifest)assert.equal(digest(readFileSync(join(root,file.path))),file.sha256,'Frozen source changed: '+file.path);
const originalHarness=readFileSync(join(frozen,'scripts/check-visual-production.mjs'),'utf8');
let baseFixture=originalHarness.match(/const fixture = `([\s\S]*?)`;\r?\nconst stubs =/)?.[1];
assert.ok(baseFixture,'Original approved fixture must be present');
assert.equal(baseFixture.split('range(){return q}').length,2);
baseFixture=baseFixture.replace('range(){return q}','range(){return q},lte(key,value){clauses.push(["lte",key,value]);return q},contains(key,value){clauses.push(["contains",key,value]);return q},like(key,value){clauses.push(["like",key,value]);return q},filter(...values){clauses.push(["filter",...values]);return q},match(values){for(const [key,value] of Object.entries(values))clauses.push(["eq",key,value]);return q},setHeader(){return q}');
const allSourceFiles=[];
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())walk(path);else if(/\.(?:tsx?|css)$/.test(entry.name))allSourceFiles.push(path);}}
walk(join(frozen,'src'));
const knownTables=[...new Set(allSourceFiles.flatMap(path=>[...readFileSync(path,'utf8').matchAll(/\.from\('([a-z_]+)'\)/g)].map(match=>match[1])))].sort();
const fixture=baseFixture+`\n
for(const table of ${JSON.stringify(knownTables)})if(!(table in window.fixture))window.fixture[table]=[];
const f=window.fixture;
for(const table of ['clients','cases','tasks','agenda_items','finance_parties','finance_transactions','notifications'])for(const row of f[table])row.office_id=office;
Object.assign(f.clients[0],{notes:'NOTA FICTÍCIA',rg:'RG FICTÍCIO',profession:'Profissão fictícia',civil_status:'solteiro',address_city:'CIDADE FICTÍCIA',address_state:'PA',portal_pin:null});
Object.assign(f.cases[0],{process_number:'0000000-00.2026.0.00.0000',area:'previdenciario',description:'DESCRIÇÃO FICTÍCIA',responsible_user_id:actor,user_id:actor,client:[f.clients[0]],clients:[f.clients[0]],client_links:[],is_favorite:false});
for(const row of f.tasks)Object.assign(row,{group_id:'00000000-0000-4000-8000-000000000003',participants:[],comments:[],started_at:null,updated_at:row.created_at});
for(const [index,row] of f.finance_transactions.entries())Object.assign(row,{id:'finance-'+(index===0?'alpha':'beta'),user_id:actor,occurred_on:'2026-10-05',due_date:'2026-10-06',paid_at:null,description:'LANÇAMENTO FICTÍCIO '+index,payment_method:'pix',notes:null,client_id:'client-alpha',case_id:'case-alpha',category_id:'category-alpha',category:[{name:'HONORÁRIOS FICTÍCIOS'}]});
Object.assign(f.user_profiles[0],{phone:'',whatsapp:'',oab_number:'00000',oab_uf:'PA'});
f.offices=[{id:office,name:'ESCRITÓRIO FICTÍCIO',created_at:iso(-48)}];
f.office_settings=[{office_id:office,agenda_deadline_default_time:'09:00',agenda_commitment_default_minutes_before:30,office_whatsapp:null,timezone:'America/Sao_Paulo',updated_at:iso(-24)}];
f.finance_categories=[{id:'category-alpha',user_id:actor,name:'HONORÁRIOS FICTÍCIOS',kind:'income',created_at:iso(-24)}];
f.finance_splits=[{id:'split-alpha',user_id:actor,office_id:office,transaction_id:'finance-alpha',party_id:'partner-alpha',kind:'percent',value:10,amount_cents_override:null,paid_at:null,party:[f.finance_parties[0]],created_at:iso(-24)}];
f.productivity_reports=[{id:'report-alpha',office_id:office,user_id:actor,report_date:'2026-10-05',activities:[{title:'ATIVIDADE FICTÍCIA',status:'concluida',category:'atendimento',client_name:'CLIENTE FICTÍCIO ALFA',observation:'OBSERVAÇÃO FICTÍCIA',time_spent:'00:30'}],total_tasks:1,completed_tasks:1,pending_tasks:0,notes:'NOTA DO RELATÓRIO FICTÍCIO',status:'enviado',is_summary_only:false,manager_comment:null,reviewed_by:null,reviewed_at:null,updated_at:iso(-1),created_at:iso(-2)}];
f.publications=[{id:'publication-alpha',office_id:office,case_id:'case-alpha',numero_processo:'0000000-00.2026.0.00.0000',sigla_tribunal:'TJPA',tipo_comunicacao:'Intimação',nome_orgao:'ÓRGÃO FICTÍCIO',texto:'PUBLICAÇÃO FICTÍCIA DE TESTE',data_disponibilizacao:'2026-10-05',meio:'Diário fictício',link:null,destinatarios:[],destinatario_advogados:[],is_read:false,created_at:iso(-2),case:[f.cases[0]]}];
f.audit_logs=[{id:'audit-alpha',office_id:office,user_id:actor,action:'update',table_name:'clients',record_id:'client-alpha',client_id:'client-alpha',case_id:null,task_id:null,before_data:{name:'CLIENTE FICTÍCIO'},after_data:{name:'CLIENTE FICTÍCIO ALFA'},created_at:iso(-2)}];
f.receipts=[{id:'receipt-alpha',user_id:actor,office_id:office,client_id:'client-alpha',case_id:'case-alpha',amount:1500,issued_on:'2026-10-05',payment_method:'pix',receipt_number:'RECIBO FICTÍCIO',description:'RECIBO FICTÍCIO',payer_name:'CLIENTE FICTÍCIO ALFA',payer_doc:'',lawyer_name:'ADVOGADO FICTÍCIO',lawyer_oab:'OAB FICTÍCIA',metadata:{},created_at:iso(-2)}];
f.documents=[{id:'document-alpha',office_id:office,user_id:actor,client_id:'client-alpha',case_id:'case-alpha',task_id:'task-late',kind:'process',title:'DOCUMENTO FICTÍCIO.pdf',name:'DOCUMENTO FICTÍCIO.pdf',type:'pdf',size:1024,size_bytes:1024,path:office+'/documento-ficticio.pdf',file_path:office+'/documento-ficticio.pdf',mime_type:'application/pdf',is_public:false,created_at:iso(-2)}];
f.task_participants=[{id:'participant-alpha',task_id:'task-late',office_id:office,user_id:actor,role:'responsavel',status:'pending',conclusion_notes:null,concluded_at:null}];
f.rpc=async(name,args)=>{f.rpcs.push({name,args});if(name==='ensure_office_settings')return {data:null,error:null};throw new Error('Unapproved provider RPC in visual fixture: '+name)};
f.supabase={from:f.from,rpc:f.rpc,auth:{getSession:async()=>({data:{session:{user:{id:actor,email:'teste@exemplo.invalid'},access_token:'fixture-local-token'}}}),getUser:async()=>({data:{user:{id:actor,email:'teste@exemplo.invalid'}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})},channel(){return {on(){return this},subscribe(){return this},unsubscribe(){}}},removeChannel(){},storage:{from(){throw new Error('Storage is outside the visual fixture')}},functions:{invoke(){throw new Error('Edge is outside the visual fixture')}}};
`;
const stubs={
  '@/auth/authStore':`export function useAuth(){return {isAuthenticated:true,isReady:true,signOut:async()=>{window.fixture.signouts++}}}export function AuthProvider({children}){return children}`,
  '@/lib/supabaseDb':`export async function getAuthedUser(){return {id:window.fixture.actor,email:'teste@exemplo.invalid',user_metadata:{full_name:'PESSOA FICTÍCIA DE TESTE'}}}export function requireSupabase(){return window.fixture.supabase}`,
  '@/lib/supabaseClient':`export const hasSupabaseEnv=true;export const supabase=window.fixture.supabase;`,
  '@/lib/datajud':`export async function fetchEscavadorProcesso(){throw new Error('Consulta externa bloqueada nesta prévia')}`,
};
const packageRequire=createRequire(join(candidate,'package.json'));
const {build}=packageRequire('esbuild');
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {AppRouter} from './src/router/AppRouter';import {initializeWorkspaceVisual} from './src/lib/workspaceVisual';import {initTheme} from './src/lib/theme';initTheme();initializeWorkspaceVisual();createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><AppRouter/></QueryClientProvider>);`;
const bundle=await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},tsconfig:join(root,'tsconfig.app.json'),nodePaths:[join(candidate,'node_modules')],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'import.meta.env':'{}'},banner:{js:fixture},logLevel:'silent',plugins:[{name:'synthetic-transport',setup(builder){builder.onResolve({filter:/^@\//},args=>Object.hasOwn(stubs,args.path)?{path:args.path,namespace:'synthetic'}:undefined);builder.onLoad({filter:/.*/,namespace:'synthetic'},args=>({contents:stubs[args.path],loader:'js'}));}}]});
const cssNames=readdirSync(join(root,'dist/assets')).filter(name=>/^index-.*\.css$/.test(name));assert.equal(cssNames.length,1,'Exactly one reviewed built stylesheet is required');
const css=readFileSync(join(root,'dist/assets',cssNames[0]),'utf8');
const images=new Set(['/brand/lima-diogenes-logo-dark.png','/brand/lima-diogenes-logo-light.png','/brand/lima-diogenes-icon.png']);
const server=createServer((request,response)=>{const path=new URL(request.url,'http://127.0.0.1').pathname;if(images.has(path)){response.setHeader('Content-Type','image/png');response.end(readFileSync(join(root,'public',path)));return;}if(path.startsWith('/api/')||path.startsWith('/storage/')){response.writeHead(503);response.end();return;}response.setHeader('Content-Type','text/html; charset=utf-8');response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'none'; worker-src 'none'");response.end('<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script>'+bundle.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script></html>');});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url='http://127.0.0.1:'+server.address().port;
const runtime=createRequire('C:/Users/Coop Agronorte/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=runtime('playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const router=readFileSync(join(root,'src/router/AppRouter.tsx'),'utf8');
const routePatterns=[...router.matchAll(/path="([^"]+)"/g)].map(match=>match[1]).filter(path=>path.startsWith('/app'));
const replaceParam={clientId:'client-alpha',caseId:'case-alpha',taskId:'task-late',groupId:'00000000-0000-4000-8000-000000000003',txId:'finance-alpha'};
const screens=routePatterns.map(path=>({id:path.slice(1).replaceAll('/','-').replaceAll(':',''),path:path.replace(/:([^/]+)/g,(_,key)=>replaceParam[key]),routePattern:path}));
screens.push({id:'portal-member',path:'/portal/membro',routePattern:'/portal/membro'});
const forms=[
  {id:'client-draft',path:'/app/clientes',async prepare(page){await page.getByRole('button',{name:'Novo cliente',exact:true}).click();await page.getByLabel('Nome / Razão Social',{exact:true}).fill('RASCUNHO FICTÍCIO');await page.getByLabel('Data de Nascimento',{exact:true}).fill('1990-01-01');}},
  {id:'agenda-draft',path:'/app/agenda',async prepare(page){await page.getByRole('button',{name:'Novo',exact:true}).click();await page.locator('select').filter({has:page.locator('option[value="deadline"]')}).selectOption('deadline');await page.getByLabel('Título',{exact:true}).fill('PRAZO FICTÍCIO');await page.getByLabel('Data do prazo',{exact:true}).fill('2026-10-06');}},
  {id:'task-draft',path:'/app/tarefas',async prepare(page){await page.getByRole('button',{name:'Nova tarefa',exact:true}).click();await page.getByLabel('Título',{exact:true}).fill('TAREFA FICTÍCIA');await page.getByLabel('Prazo (data e hora)',{exact:true}).fill('2026-10-06T09:00');}},
  {id:'partner-draft',path:'/app/financeiro/parceiros',async prepare(page){await page.getByRole('button',{name:'Novo parceiro',exact:true}).click();await page.getByLabel('Nome',{exact:true}).fill('PARCEIRO FICTÍCIO NOVO');}},
  {id:'settings-draft',path:'/app/agenda/configuracoes',async prepare(page){await page.getByLabel('Prazo: horário padrão do lembrete').fill('10:30');await page.getByLabel('Compromisso: minutos antes').fill('45');}},
  {id:'team-draft',path:'/app/configuracoes/membros',async prepare(page){await page.getByLabel('Nome completo',{exact:true}).fill('PERFIL FICTÍCIO EM EDIÇÃO');}},
  {id:'documents-draft',path:'/app/documentos/gerar',async prepare(page){await page.getByPlaceholder('Buscar por nome, CPF, telefone ou e-mail…').fill('ALFA');await page.getByRole('button').filter({hasText:'CLIENTE FICTÍCIO ALFA'}).first().click();await page.getByRole('button').filter({hasText:'Aux. por Incapacidade Temporária'}).first().click();await page.getByPlaceholder('0,00',{exact:true}).fill('12500');await page.getByPlaceholder('Patrocínio de ação previdenciária…').fill('SERVIÇO FICTÍCIO');}},
  {id:'receipt-preview',path:'/app/recibos',async prepare(page){await page.getByPlaceholder('Buscar por nome, CPF ou telefone…').fill('ALFA');await page.getByRole('button').filter({hasText:'CLIENTE FICTÍCIO ALFA'}).first().click();await page.getByPlaceholder('1.500,00',{exact:true}).fill('150000');await page.getByPlaceholder('Honorários advocatícios — ação previdenciária…').fill('SERVIÇO FICTÍCIO');await page.getByRole('button',{name:'Expandir',exact:true}).click();}},
];
screens.push(...forms);
const report={passed:false,sourceRoot:root,sourceBaseline:'40066ac',sourceManifestSha256:digest(readFileSync(join(frozen,'frozen-source-manifest.json'))),cssSha256:digest(css),bundleSha256:digest(bundle.outputFiles[0].contents),clock:'2026-10-05T09:00:00.000Z',timezone:'America/Asuncion',locale:'pt-BR',routePatterns,synthetic:true,reviewedTextExceptions:['CastroCRM, Castro CRM and the exact Finance header Castro de Oliveira Adv may become Lima e Diógenes; no field, action, link or query is exempted.'],cases:[],errors:[],network:[],failures:[],comparisons:[],limits:['Actual router/pages/business libraries use synthetic transport only. This does not prove real Auth/RLS/SQL or provider behavior.','No business action is submitted; draft inputs are filled only. The legacy ensure_office_settings RPC is simulated and recorded, not executed.','Known query tables without populated synthetic rows show their actual empty states. Client portal is its unauthenticated form, member portal uses a fake session.','Contrast uses composited computed colors; gradient/image backgrounds are identified and remain estimates requiring screenshot review.']};
const canonical=value=>JSON.stringify(value).replaceAll('CastroCRM','Lima e Diógenes').replaceAll('Castro CRM','Lima e Diógenes').replaceAll('Castro de Oliveira Adv','Lima e Diógenes');
const before=comparePath?JSON.parse(readFileSync(resolve(comparePath),'utf8')):null;
try{
matrix:for(const visual of ['reference','classic'])for(const width of [1280,390])for(const screen of screens){
  if(process.argv.includes('--smoke')&&(visual!=='reference'||width!==1280))continue;
  const id=[visual,width,screen.id].join('-');if(option('--cases')&&!option('--cases').split(',').includes(id))continue;
  const context=await browser.newContext({viewport:{width,height:900},locale:report.locale,timezoneId:report.timezone,reducedMotion:'reduce',serviceWorkers:'block'});
  await context.addInitScript(({clock})=>{const NativeDate=Date,fixed=NativeDate.parse(clock);class FixedDate extends NativeDate{constructor(...args){if(args.length)super(...args);else super(fixed)}static now(){return fixed}}window.Date=FixedDate;localStorage.setItem('castrocrm.theme','dark');},{clock:report.clock});
  await context.route('**/*',route=>{if(route.request().url().startsWith(url)&&['GET','HEAD'].includes(route.request().method()))return route.continue();report.network.push({id,resourceType:route.request().resourceType()});return route.abort();});
  const page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',error=>report.errors.push({id,error:error.message}));
  try{
    await page.goto(url+screen.path+'?visual='+visual,{waitUntil:'load'});
    await page.waitForFunction(()=>document.querySelector('#root')?.textContent.trim()&&document.querySelector('#root').textContent.trim()!=='Carregando…');
    await page.evaluate(()=>new Promise(done=>{let last=-1,stable=0;function settle(){const calls=window.fixture.calls.length;if(calls===last)stable++;else stable=0;last=calls;if(stable>=5)return done();setTimeout(settle,50)}settle()}));
    await screen.prepare?.(page);
    let draftCancelVerified=false;
    if(screen.prepare&&width===1280){
      const switcher=page.getByRole('combobox',{name:'Visual do sistema'});
      if(await switcher.count()){
        const fieldValues=()=>page.locator('input,select,textarea').evaluateAll(elements=>elements.map(element=>({value:element.value,type:element.type})));
        const valuesBefore=await fieldValues();page.once('dialog',dialog=>dialog.dismiss());
        await switcher.selectOption(visual==='reference'?'classic':'reference');
        assert.deepEqual(await fieldValues(),valuesBefore,'Cancelled visual switch must preserve every draft value');draftCancelVerified=true;
      }
    }
    const focusTarget=page.locator('main input:not([type=hidden]):visible,main textarea:visible').first();
    if(await focusTarget.count()){
      // Autocomplete has a real delayed blur callback (150/180ms). Finish that
      // callback before intentionally focusing the search field for both builds.
      if(['documents-draft','receipt-preview'].includes(screen.id)){
        await page.evaluate(()=>document.activeElement instanceof HTMLElement&&document.activeElement.blur());
        await page.waitForTimeout(250);
      }
      await focusTarget.focus();
      if(['documents-draft','receipt-preview'].includes(screen.id))await page.waitForTimeout(250);
    }
    await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));window.scrollTo(0,0)});
    if(screen.path==='/app')await page.waitForTimeout(1900);
    const data=await page.evaluate(()=>{
      const text=value=>String(value??'').replace(/\s+/g,' ').trim();
      const visible=element=>element.getClientRects().length>0&&getComputedStyle(element).visibility!=='hidden'&&getComputedStyle(element).display!=='none';
      const controls=[...document.querySelectorAll('input,select,textarea,button,a')].map(element=>({tag:element.tagName,type:element.getAttribute('type'),name:element.getAttribute('name'),id:element.id,role:element.getAttribute('role'),label:element.labels?[...element.labels].map(label=>text(label.textContent)).join('|'):null,text:text(element.textContent),value:element instanceof HTMLInputElement||element instanceof HTMLSelectElement||element instanceof HTMLTextAreaElement?element.value:null,href:element.getAttribute('href'),disabled:!!element.disabled,checked:!!element.checked,options:element instanceof HTMLSelectElement?[...element.options].map(option=>({value:option.value,text:text(option.textContent)})):null}));
      const dom=[...document.querySelectorAll('main *,[role=dialog] *')].filter(visible).map(element=>{const rect=element.getBoundingClientRect(),style=getComputedStyle(element);return {tag:element.tagName,text:text([...element.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join('')),rect:[rect.x,rect.y,rect.width,rect.height].map(value=>Math.round(value*100)/100),color:style.color,background:style.backgroundColor,fontSize:style.fontSize,fontWeight:style.fontWeight}});
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');const color=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);const p=ctx.getImageData(0,0,1,1).data;return [p[0],p[1],p[2],p[3]/255]};const over=(a,b)=>[...a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3])),1];const luminance=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      const contrastScope=document.querySelector('main')?'main *,aside a,header button,[role=dialog] *':'#root *';
      const contrast=[...document.querySelectorAll(contrastScope)].filter(element=>visible(element)&&!element.disabled&&([...element.childNodes].some(node=>node.nodeType===Node.TEXT_NODE&&text(node.textContent))||['INPUT','SELECT','TEXTAREA'].includes(element.tagName)&&element.value)).map(element=>{const chain=[];let estimated=false;for(let p=element;p;p=p.parentElement){const style=getComputedStyle(p);chain.push(color(style.backgroundColor));if(style.backgroundImage!=='none')estimated=true;}const background=chain.reverse().reduce((under,top)=>over(top,under),[255,255,255,1]);const style=getComputedStyle(element),foreground=over(color(style.color),background);const a=luminance(foreground),b=luminance(background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);const large=parseFloat(style.fontSize)>=24||parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700;return {tag:element.tagName,text:text(['INPUT','SELECT','TEXTAREA'].includes(element.tagName)?element.value:element.textContent).slice(0,90),ratio:Math.round(ratio*100)/100,minimum:large?3:4.5,estimated,control:['INPUT','SELECT','TEXTAREA','BUTTON','A'].includes(element.tagName)}});
      const body=document.body.cloneNode(true);body.querySelectorAll('script,style').forEach(element=>element.remove());
      const focused=document.activeElement;const focusStyle=getComputedStyle(focused);
      return {finalPath:location.pathname,headings:[...document.querySelectorAll('h1,h2')].map(element=>text(element.textContent)),bodyText:text(body.textContent),controls,dom,contrast,focus:{tag:focused.tagName,outlineColor:focusStyle.outlineColor,outlineWidth:focusStyle.outlineWidth,borderColor:focusStyle.borderColor,background:focusStyle.backgroundColor,color:focusStyle.color},overflowPixels:Math.max(0,document.documentElement.scrollWidth-innerWidth),tableQueries:window.fixture.calls.filter(call=>call.operation==='read'),rpcs:window.fixture.rpcs,writes:window.fixture.writes,bodyCharacters:document.body.innerText.length};
    });
    assert.ok(data.bodyCharacters>20,'Empty route');assert.equal(data.bodyText.includes('Algo deu errado'),false,'Caught application ErrorBoundary must not count as a rendered operational screen');assert.equal(data.writes.some(write=>write.table!=='user_profiles'),false,'Business write during visual capture');
    const screenshot=id+'.png';await page.screenshot({path:join(output,screenshot),fullPage:true,animations:'disabled',caret:'hide'});
    const functional={finalPath:data.finalPath,headings:data.headings,bodyText:data.bodyText,controls:data.controls};
    const queries=[...new Set(data.tableQueries.map(query=>JSON.stringify(query)))].sort();
    const row={id,visual,width,path:screen.path,routePattern:screen.routePattern??null,screenshot,...data,draftCancelVerified,functionalSha256:digest(canonical(functional)),queriesSha256:digest(JSON.stringify(queries)),rpcsSha256:digest(JSON.stringify(data.rpcs)),contrastBelowMinimum:data.contrast.filter(item=>item.ratio<item.minimum).length};
    report.cases.push(row);
    if(screen.path==='/app/drive'&&visual==='reference'){
      const analysis=row.contrast.find(item=>item.tag==='BUTTON'&&item.text==='Analisar (IA)');
      assert.ok(analysis,'Synthetic Drive document must expose the analysis action');
      assert.ok(analysis.ratio>=4.5,'Drive analysis text contrast below minimum');
      const remove=page.getByTitle('Excluir',{exact:true}).first();
      await remove.hover();
      row.driveDeleteHover=await remove.evaluate(element=>{
        const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
        const color=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);const p=ctx.getImageData(0,0,1,1).data;return [p[0],p[1],p[2],p[3]/255]};
        const over=(a,b)=>[...a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3])),1];
        const luminance=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
        const chain=[];for(let p=element;p;p=p.parentElement)chain.push(color(getComputedStyle(p).backgroundColor));
        const background=chain.reverse().reduce((under,top)=>over(top,under),[255,255,255,1]);
        const icon=element.querySelector('svg'),style=getComputedStyle(icon||element),foreground=over(color(style.color),background);
        const a=luminance(foreground),b=luminance(background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        return {hovered:element.matches(':hover'),icon:!!icon,color:style.color,background,ratio:Math.round(ratio*100)/100,minimum:3,writes:window.fixture.writes.filter(write=>write.table!=='user_profiles').length};
      });
      assert.equal(row.driveDeleteHover.hovered,true,'Delete hover must be exercised');
      assert.equal(row.driveDeleteHover.writes,0,'Hover must not mutate data');
      assert.ok(row.driveDeleteHover.ratio>=3,'Drive delete icon hover contrast below minimum');
      row.hoverScreenshot=id+'-delete-hover.png';await page.screenshot({path:join(output,row.hoverScreenshot),fullPage:true,animations:'disabled',caret:'hide'});
    }
    const baselineCase=before?.cases.find(item=>item.id===id);
    if(row.overflowPixels>0&&(visual==='reference'||!baselineCase||row.overflowPixels!==baselineCase.overflowPixels)){
      report.failures.push({id,reason:'horizontal overflow',pixels:row.overflowPixels});
      console.log(JSON.stringify({finding:'horizontal-overflow',id,pixels:row.overflowPixels}));
    }
    if(before){const baseline=before.cases.find(row=>row.id===id);assert.ok(baseline,'Missing baseline case');const baselineFunctional={finalPath:baseline.finalPath,headings:baseline.headings,bodyText:baseline.bodyText,controls:baseline.controls};const identical=digest(canonical(baselineFunctional))===row.functionalSha256;const queriesIdentical=baseline.queriesSha256===row.queriesSha256&&baseline.rpcsSha256===row.rpcsSha256;report.comparisons.push({id,functionalIdentity:identical,queryIdentity:queriesIdentical,beforeOverflow:baseline.overflowPixels,afterOverflow:row.overflowPixels,beforeLowContrast:baseline.contrastBelowMinimum,afterLowContrast:row.contrastBelowMinimum});if(!identical){report.failures.push({id,reason:'functional DOM identity changed'});console.log(JSON.stringify({finding:'functional DOM identity changed',id}));}if(!queriesIdentical){report.failures.push({id,reason:'read query or RPC contract changed'});console.log(JSON.stringify({finding:'read query or RPC contract changed',id}));}}
  }catch(error){report.failures.push({id,error:error.message});if(process.argv.includes('--fail-fast'))break matrix;}
  finally{await context.close();}
  if(report.cases.length%12===0){writeFileSync(join(output,'general-visual-progress.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({progress:report.cases.length,failures:report.failures.length,mode:root===frozen?'before':'after'}));}
}
report.passed=report.failures.length===0&&report.errors.length===0&&report.network.length===0;
report.generatedAtUtc=new Date().toISOString();
writeFileSync(join(output,'general-visual-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,failures:report.failures,errors:report.errors,network:report.network.length,overflowCases:report.cases.filter(row=>row.overflowPixels>0).map(row=>({id:row.id,pixels:row.overflowPixels})),contrastSamples:report.cases.reduce((sum,row)=>sum+row.contrast.length,0),report:join(output,'general-visual-report.json'),reportSha256:digest(readFileSync(join(output,'general-visual-report.json')))},null,2));
if(!report.passed)process.exitCode=1;
}finally{await browser.close();await new Promise(done=>server.close(done));}
