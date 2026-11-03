import{launch,session,archive}from'./browser-kit.mjs';import{mkdir,writeFile,readFile}from'node:fs/promises';import assert from'node:assert/strict';
import{parseArchive}from'../src/data.ts';import{checkEvidence}from'./evidence-check.mjs';
const pass=process.argv.find(a=>a.startsWith('--pass='))?.split('=')[1]??'1',root=`shots/v3/pass-${pass}`;
await mkdir(root,{recursive:true});const browser=await launch('chromium',{gpu:true});const model=parseArchive(archive,'offline');const report={pass,fixtureCapturedAt:archive.fetchedAt,notes:'Genuine API replay at its captured date; only Date is fixed. Native timers and rendering remain real.',shots:[],errors:[],warnings:[],checks:[],observations:{}};

async function shot(s,name,width,full=false){const path=`${root}/${width}-${name}.png`;await s.page.screenshot({path,fullPage:full});report.shots.push(path);}
async function inspect(s){report.errors.push(...s.errors);report.warnings.push(...s.warnings);await s.context.close();}
try{for(const width of[1440,390]){
 const height=width===1440?900:844,s=await session(browser,{width,height});if(await s.page.locator('#tour-toggle').textContent()==='Pause tour')await s.page.locator('#tour-toggle').click();await s.page.waitForFunction(()=>!!window.gridWeatherModel);await s.page.waitForTimeout(1500);
 assert.equal(await s.page.locator('#map path[role="button"]').count(),14);assert.equal(await s.page.locator('#outlook-list .outlook-row').count(),14);
 const bounds=await s.page.locator('#controls').boundingBox();assert.ok(bounds&&bounds.y+bounds.height<=height+.5);assert.equal(await s.page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
 report.checks.push(`${width}: engine and controls fit first screen; 14 regions and outlooks`);
 await shot(s,'overview',width);
 for(let i=0;i<20;i++){
  const facts=await s.page.locator('#evidence [role="listitem"]').evaluateAll(items=>items.map(e=>({field:e.dataset.field,value:Number(e.dataset.value),at:Number(e.dataset.at),region:Number(e.dataset.region)})));checkEvidence(model,facts);
  assert.match(await s.page.locator('#frame-type').textContent(),/Forecast/);
  await s.page.waitForTimeout(300);await shot(s,`tour-${i+1}`,width);if(await s.page.locator('#tour-next').isDisabled())break;await s.page.locator('#tour-next').click();
 }
 report.checks.push(`${width}: every tour caption has exact source receipts and a four-interval mean`);
 await s.page.locator('#tour-toggle').click();await s.page.locator('#sources-open').click();await shot(s,'sources',width);report.observations[`${width}-modalButton`]=await s.page.locator('#tour-toggle').textContent();await s.page.locator('#sources-close').click();
 if(width===390)await s.page.locator('#details-open').click();await s.page.locator('#region-select').selectOption('6');if(width===390)await s.page.locator('#details-close').click();await shot(s,'long-region',width);
 if(width===390){await s.page.locator('#details-open').click();await shot(s,'region-details',width);await s.page.locator('#details-close').click();}else await shot(s,'region-details',width);
 for(const layer of ['sun','carbon','wind']){if(width===390)await s.page.locator('#weather-layer').selectOption(layer);else await s.page.locator('#layer-'+layer).click();await s.page.waitForTimeout(350);await shot(s,layer,width);}
 await s.page.locator('#model-lab').scrollIntoViewIfNeeded();for(const mode of ['forward','replay']){await s.page.locator('#model-'+mode).click();const path=`${root}/${width}-model-${mode}.png`;await s.page.locator('#model-lab').screenshot({path});report.shots.push(path);}
 await s.page.locator('#model-forward').click();await s.page.locator('#wind-hypothesis').focus();await s.page.keyboard.press('Home');await s.page.waitForTimeout(300);const hypo=`${root}/${width}-model-hypothetical.png`;await s.page.locator('#model-lab').screenshot({path:hypo});report.shots.push(hypo);
 await s.page.locator('.correlation-section').scrollIntoViewIfNeeded();const corr=`${root}/${width}-correlations.png`;await s.page.locator('.correlation-section').screenshot({path:corr});report.shots.push(corr);
 await s.page.locator('#outlook').scrollIntoViewIfNeeded();await s.page.locator('#outlook').screenshot({path:`${root}/${width}-outlook.png`});report.shots.push(`${root}/${width}-outlook.png`);
 await s.page.locator('#accessible-regions summary').click();await s.page.locator('#accessible-regions').screenshot({path:`${root}/${width}-table.png`});report.shots.push(`${root}/${width}-table.png`);await inspect(s);
 for(const state of['loading','pending','offline','empty','error','svg','reduced','slow-graphics','weather-error','model-error']){
  const c=await session(browser,{width,height,state:state==='reduced'?'replay':state,reduced:state==='reduced'});
  if(!['loading','error'].includes(state)&&await c.page.locator('#tour-toggle').textContent()==='Pause tour')await c.page.locator('#tour-toggle').click();
  if(state==='empty')await c.page.locator('#sources-open').click();
  if(state==='weather-error')await c.page.waitForFunction(()=>document.querySelector('#weather-source').textContent.includes('interactive data unavailable'));if(state==='model-error')await c.page.waitForFunction(()=>document.querySelector('#model-status').textContent.includes('Training unavailable'));if(state==='model-error'){const path=`${root}/${width}-model-error.png`;await c.page.locator('#model-lab').screenshot({path});report.shots.push(path);}else await shot(c,state,width);if(state==='slow-graphics'){await c.page.waitForTimeout(16000);await shot(c,'graphics-timeout',width);const path=`${root}/${width}-model-timeout.png`;await c.page.locator('#model-lab').screenshot({path});report.shots.push(path);}await inspect(c);
 }
}
}finally{await browser.close();await writeFile(`${root}/report.json`,JSON.stringify(report,null,2));}
assert.deepEqual(report.errors,[]);assert.deepEqual(report.warnings,[]);console.log(`Pass ${pass}: ${report.shots.length} screenshots, ${report.checks.length} checks, no console errors or warnings.`);
