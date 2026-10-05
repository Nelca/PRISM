/* npm package playwright is supplied through NODE_PATH or the local project. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '../..');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const p = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const errors=[];
    p.on('pageerror',e=>errors.push(e.message));
    if (!process.env.PRISM_SKIP_PDF) {
    await p.goto(pathToFileURL(path.join(ROOT,'tools/promotion/overview.html')).href);
    await p.evaluate(()=>document.fonts.ready);
    await p.pdf({path:path.join(ROOT,'public/promotion/assets/prism-overview.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true});
    }
    const url=process.env.PRISM_PREVIEW_URL || pathToFileURL(path.join(ROOT,'public/promotion/index.html')).href;
    await p.goto(url);
    await p.evaluate(()=>document.fonts.ready);
    const checks=[];
    if(await p.locator('h1').textContent()!=='正解のない環境の評価額を、投資の根拠に変える。') throw new Error('Brand headline mismatch');
    if(await p.locator('.brand-subcopy').textContent()!=='算出方法で、変わる金額。') throw new Error('Brand subcopy mismatch');
    if(!(await p.locator('.hero .eyebrow').textContent()).includes('環境財務評価プラットフォーム')) throw new Error('Product description mismatch');
    for(const width of [1440,1024,768,390,320]) {
      await p.setViewportSize({width,height:1000});
      const size=await p.evaluate(()=>({body:document.documentElement.scrollWidth,view:window.innerWidth}));
      if(size.body>size.view) throw new Error('Horizontal overflow: '+JSON.stringify(size));
      checks.push({width,overflow:false});
      if(width===1440 || width===390) { await p.screenshot({path:path.join(ROOT,`output/promotion/lp-${width}.png`),fullPage:true}); await p.screenshot({path:path.join(ROOT,`output/promotion/lp-${width}-top.png`),fullPage:false}); }
    }
    await p.setViewportSize({width:1440,height:1000});
    for(const [key,low,high] of [['above','+8','+22'],['below','−18','−4'],['cross','−8','+18']]){
      await p.locator(`[data-case="${key}"]`).click();
      const actual=await p.locator('#range-low').textContent();
      const actualHigh=await p.locator('#range-high').textContent();
      if(actual!==low || actualHigh!==high) throw new Error('Scenario mismatch: '+key);
      if(await p.locator('[aria-pressed="true"]').count()!==1) throw new Error('Selection state mismatch');
    }
    await p.locator('details summary').first().click();
    if(!(await p.locator('details').first().getAttribute('open')!==null)) throw new Error('FAQ failed');
    const broken=await p.evaluate(()=>Array.from(document.querySelectorAll('img')).filter(x=>!x.complete||x.naturalWidth===0).map(x=>x.src));
    if(broken.length) throw new Error('Missing image: '+broken.join(','));
    const resources=await p.evaluate(()=>Array.from(document.querySelectorAll('[href],[src]')).map(e=>e.getAttribute('href')||e.getAttribute('src')).filter(u=>u&&!u.startsWith('#')&&!/^(https?:|data:)/.test(u)));
    for(const resource of resources) if(!fs.existsSync(path.join(ROOT,'public/promotion',resource))) throw new Error('Missing resource '+resource);
    await p.evaluate(()=>{window.__prismCta=[];window.addEventListener('prism:cta',e=>window.__prismCta.push(e.detail))});
    for(const placement of ['hero-overview','bottom-overview']) {
      const [overview]=await Promise.all([p.waitForEvent('download'),p.locator(`[data-cta="${placement}"]`).click()]);
      if(overview.suggestedFilename()!=='prism-overview.pdf') throw new Error('Overview download failed');
    }
    const ctaEvents=await p.evaluate(()=>window.__prismCta);
    if(ctaEvents.length!==2||ctaEvents.some(e=>e.action!=='overview_download_click')) throw new Error('CTA event mismatch');
    const [download]=await Promise.all([p.waitForEvent('download'),p.locator('#contact-link').click()]);
    if(download.suggestedFilename()!=='project-brief.txt') throw new Error('Download failed');
    // Only load media metadata, allowing use while the second film is still rendering.
    await p.locator('video').evaluate(v=>{v.preload='metadata';v.load()});
    await p.waitForFunction(()=>document.querySelector('video').readyState>=1);
    const media=await p.locator('video').evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight}));
    if(Math.abs(media.duration-45)>.1||media.width!==1920||media.height!==1080) throw new Error('Video metadata mismatch '+JSON.stringify(media));
    await p.locator('video').evaluate(async v=>{v.muted=true;await v.play()});
    await p.waitForFunction(()=>document.querySelector('video').currentTime>.15);
    await p.locator('video').evaluate(v=>{v.pause();v.currentTime=22});
    await p.waitForFunction(()=>Math.abs(document.querySelector('video').currentTime-22)<.2 && !document.querySelector('video').seeking);
    await p.locator('[data-case="above"]').focus();
    await p.keyboard.press('Enter');
    if(await p.locator('#range-low').textContent()!=='+8') throw new Error('Keyboard interaction failed');
    const vertical=await browser.newPage();
    await vertical.goto(new URL('video/prism-social-15s.mp4',url).href);
    await vertical.waitForFunction(()=>document.querySelector('video')?.readyState>=1);
    const verticalMedia=await vertical.locator('video').evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight}));
    if(Math.abs(verticalMedia.duration-15)>.1||verticalMedia.width!==1080||verticalMedia.height!==1920) throw new Error('Vertical video metadata mismatch');
    await vertical.close();
    if(errors.length) throw new Error('JS errors '+errors.join(';'));
    fs.writeFileSync(path.join(ROOT,'output/promotion/browser-check.json'),JSON.stringify({checked:new Date().toISOString(),checks,scenarios:3,faq:true,downloads:true,overviewDownloads:2,ctaEvents,resources:resources.length,images:true,media,verticalMedia,playback:true,seeking:true,keyboard:true,errors},null,2));
    console.log('Responsive/scenario/download/media checks passed. PDF export: '+!process.env.PRISM_SKIP_PDF);
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
