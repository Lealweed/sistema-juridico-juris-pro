// Frozen synthetic browser matrix, reusable across compiler versions.
import assert from 'node:assert/strict';
import { join } from 'node:path';

export async function runVisualMatrix({browser,url,output}) {
  const result={passed:false,synthetic:true,clock:'2026-10-05T09:00:00.000Z',timezone:'America/Asuncion',locale:'pt-BR',cases:[],network:[],errors:[]};
  const screens=[
    {id:'dashboard',path:'/app',heading:visual=>visual==='reference'?'Visão geral do escritório':'Dashboard executivo'},
    {id:'clients',path:'/app/clientes',heading:()=> 'Clientes'},
    {id:'client-form',path:'/app/clientes',heading:()=> 'Clientes',async prepare(page){await page.getByRole('button',{name:'Novo cliente',exact:true}).click();await page.getByLabel('Nome / Razão Social',{exact:true}).fill('RASCUNHO FICTÍCIO');await page.getByLabel('Data de Nascimento',{exact:true}).fill('1990-01-01');}},
    {id:'agenda-deadline',path:'/app/agenda',heading:()=> 'Agenda',async prepare(page){await page.getByRole('button',{name:'Novo',exact:true}).click();await page.locator('select').filter({has:page.locator('option[value="deadline"]')}).selectOption('deadline');await page.getByLabel('Título',{exact:true}).fill('PRAZO FICTÍCIO');await page.getByLabel('Data do prazo',{exact:true}).fill('2026-10-06');}},
    {id:'task-form',path:'/app/tarefas',heading:()=> 'Tarefas',async prepare(page){await page.getByRole('button',{name:'Nova tarefa',exact:true}).click();await page.getByLabel('Título',{exact:true}).fill('TAREFA FICTÍCIA');await page.getByLabel('Prazo (data e hora)',{exact:true}).fill('2026-10-06T09:00');await page.getByLabel(/^Cliente \(opcional\)/).selectOption('client-alpha');}},
    {id:'documents-fields',path:'/app/documentos/gerar',heading:()=> 'Gerador de Documentos',async prepare(page){const search=page.getByPlaceholder('Buscar por nome, CPF, telefone ou e-mail…');await search.fill('ALFA');await page.getByRole('button').filter({hasText:'CLIENTE FICTÍCIO ALFA'}).first().click();await page.getByRole('button').filter({hasText:'Aux. por Incapacidade Temporária'}).first().click();await page.getByPlaceholder('0,00',{exact:true}).fill('12500');await page.getByPlaceholder('Patrocínio de ação previdenciária…').fill('SERVIÇO FICTÍCIO');}},
  ];
  for(const visual of ['reference','classic'])for(const viewport of [{width:1440,height:1000},{width:390,height:844}])for(const screen of screens){
    const id=[visual,viewport.width,screen.id].join('-');
    if(process.env.JURIS_MATRIX_CASES&&!process.env.JURIS_MATRIX_CASES.split(',').includes(id))continue;
    const context=await browser.newContext({viewport,locale:result.locale,timezoneId:result.timezone});
    await context.route('**/*',route=>{if(route.request().url().startsWith(url))return route.continue();result.network.push(route.request().url());return route.abort();});
    await context.addInitScript(({clock})=>{
      const NativeDate=Date;const fixed=NativeDate.parse(clock);
      class FixedDate extends NativeDate{constructor(...args){if(args.length)super(...args);else super(fixed);}static now(){return fixed;}}
      window.Date=FixedDate;localStorage.setItem('castrocrm.theme','dark');
    },{clock:result.clock});
    const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>result.errors.push({id,error:error.message}));
    try{
      await page.goto(url+screen.path+'?visual='+visual);
      await page.getByRole('heading',{name:screen.heading(visual),exact:true}).waitFor();
      await page.waitForFunction(()=>window.fixture.calls.some(call=>call.table==='user_profiles'&&call.operation==='read'));
      if(screen.id==='dashboard')await page.waitForFunction(()=>window.fixture.calls.filter(call=>call.table==='tasks'&&call.operation==='read').length>=6);
      if(screen.id.startsWith('client'))await page.locator('main').getByText('CLIENTE FICTÍCIO ALFA').first().waitFor({state:'attached'});
      if(screen.id==='task-form')await page.getByText('Conferir documentos fictícios',{exact:true}).waitFor();
      if(screen.id==='agenda-deadline')await page.waitForFunction(()=>window.fixture.calls.some(call=>call.table==='agenda_items'&&call.operation==='read'));
      await screen.prepare?.(page);
      await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});
      await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));window.scrollTo(0,0);});
      await page.mouse.move(0,0);
      // Two settled frames after style injection and font loading.
      await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
      if(screen.id==='dashboard')await page.evaluate(()=>new Promise((done,reject)=>{
        // Recharts animates SVG attributes through JS, independent of CSS.
        const start=performance.now();let previous='',stable=0;
        function settle(){
          const signature=[...document.querySelectorAll('.recharts-wrapper svg')].map(svg=>svg.outerHTML).join('');
          stable=signature===previous?stable+1:0;previous=signature;
          if(performance.now()-start>=1800&&stable>=12)return done();
          if(performance.now()-start>10000)return reject(new Error('Recharts geometry did not settle'));
          requestAnimationFrame(settle);
        }requestAnimationFrame(settle);
      }));
      const dom=await page.evaluate(()=>{
        const properties=['display','position','boxSizing','width','height','minWidth','minHeight','maxWidth','maxHeight','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','rowGap','columnGap','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textAlign','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderTopLeftRadius','borderTopRightRadius','borderBottomRightRadius','borderBottomLeftRadius','boxShadow','filter','backdropFilter','outlineWidth','outlineStyle','outlineOffset','overflowX','overflowY','color','backgroundColor','borderTopColor'];
        return [...document.querySelectorAll('body *')].filter(element=>!['SCRIPT','STYLE'].includes(element.tagName)&&element.getClientRects().length&&getComputedStyle(element).visibility!=='hidden'&&getComputedStyle(element).display!=='none').map(element=>{
          const rect=element.getBoundingClientRect();const style=getComputedStyle(element);
          return {tag:element.tagName,role:element.getAttribute('role'),type:element.getAttribute('type'),text:[...element.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join('').trim(),value:element instanceof HTMLInputElement||element instanceof HTMLSelectElement?element.value:null,rect:[rect.x,rect.y,rect.width,rect.height].map(value=>Math.round(value*1000)/1000),style:Object.fromEntries(properties.map(property=>[property,style[property]]))};
        });
      });
      const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width,id+' overflows horizontally: '+JSON.stringify(size));
      assert.equal(await page.evaluate(()=>window.fixture.rpcs.length),0,id+' called unexpected RPC');assert.equal(await page.evaluate(()=>window.fixture.writes.some(write=>write.table!=='user_profiles')),false,id+' made a business write');
      const screenshot=join(output,id+'.png');await page.screenshot({path:screenshot,fullPage:true});result.cases.push({id,visual,viewport,path:screen.path,screenshot,dom});
    }catch(error){throw new Error(id+': '+error.message,{cause:error});}finally{await context.close();}
  }
  assert.deepEqual(result.errors,[]);assert.deepEqual(result.network,[]);result.passed=true;result.generatedAt=new Date().toISOString();return result;
}
