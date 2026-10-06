// Render the actual compiled styles for all four used legacy gradient directions.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(process.env.JURIS_PREVIEW_DIR||join(root,'tmp/gradient-qa'));
assert.ok(process.env.JURIS_MATRIX_T3_CSS,'JURIS_MATRIX_T3_CSS must point to the preserved CSS');
const previous=readFileSync(process.env.JURIS_MATRIX_T3_CSS,'utf8');
assert.equal(createHash('sha256').update(previous).digest('hex'),'0e62ea98da74fbf8c4cef2b9da05ae98e6812276250119e95426e7a11fadd1aa');
const current=readFileSync(join(root,'dist/assets',readdirSync(join(root,'dist/assets')).find(path=>/^index-.*\.css$/.test(path))),'utf8');
const runtime=createRequire(join(process.env.PLAYWRIGHT_PACKAGE_ROOT,'package.json'));
const {chromium}=runtime('playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.JURIS_BROWSER_PATH||undefined});
mkdirSync(output,{recursive:true});
try{
  for(const [compiler,css] of [['t3',previous],['t4',current]]){
    const context=await browser.newContext({viewport:{width:420,height:1100},locale:'pt-BR',timezoneId:'America/Asuncion'});
    const network=[],errors=[];
    await context.route('**/*',route=>{network.push(route.request().url());return route.abort();});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    const cases=[];
    for(const direction of ['b','br','l','r'])for(const [pattern,stops] of [['opaque','from-amber-400 to-amber-300'],['alpha','from-amber-500/15 via-white/10 to-white/5']]){
      const id=direction+'-'+pattern;
      await page.setContent('<html><style>'+css+'</style><body style="margin:0;background:#020617"><div id="probe" class="bg-gradient-to-'+direction+' '+stops+'" style="width:400px;height:120px;border:1px solid rgba(255,255,255,.1);border-radius:8px"></div></body></html>');
      await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
      const background=await page.locator('#probe').evaluate(element=>getComputedStyle(element).backgroundImage);
      assert.ok(background.startsWith('linear-gradient('),id+' gradient is missing');
      // Chromium omits the default sRGB keyword when serializing the image.
      if(compiler==='t4')assert.ok(await page.locator('#probe').evaluate(element=>getComputedStyle(element).getPropertyValue('--tw-gradient-position').includes('in srgb')),id+' did not retain sRGB');
      const screenshot=join(output,compiler+'-'+id+'.png');
      await page.locator('#probe').screenshot({path:screenshot});cases.push({id,screenshot,background});
    }
    assert.deepEqual(network,[]);assert.deepEqual(errors,[]);
    writeFileSync(join(output,compiler+'-gradients.json'),JSON.stringify({passed:true,synthetic:true,clock:'2026-10-05T09:00:00Z',cases,network,errors},null,2));
    await context.close();
  }
  console.log(JSON.stringify({passed:true,cases:8,output}));
}finally{await browser.close();}
