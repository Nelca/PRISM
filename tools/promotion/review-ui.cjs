const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({reducedMotion:'reduce'});
  await p.goto('http://127.0.0.1:4173/index.html');
  await p.evaluate(()=>document.fonts.ready);
  const report=[];
  for(const width of [1920,1440,1024,820,800,768,390,320]){
   await p.setViewportSize({width,height:1000});
   const audit=await p.evaluate(()=>{
    const rgb=s=>(s.match(/[\d.]+/g)||[]).map(Number);
    const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
    const problems=[];let count=0,min=99;
    for(const el of document.querySelectorAll('body *')){
     if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;
     const cs=getComputedStyle(el);if(!el.getClientRects().length||cs.visibility==='hidden'||el.closest('video')||el.classList.contains('skip'))continue;
     let bg=el;while(bg&&rgb(getComputedStyle(bg).backgroundColor)[3]===0)bg=bg.parentElement;
     const back=rgb(bg?getComputedStyle(bg).backgroundColor:'rgb(255,255,255)');
     const fore=rgb(cs.color);const a=lum(fore),b=lum(back);const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
     const size=parseFloat(cs.fontSize);const large=size>=24||(size>=18.66&&parseInt(cs.fontWeight)>=700);
     min=Math.min(min,ratio);count++;
     if(size<14||ratio<(large?3:4.5))problems.push({tag:el.tagName,class:el.className,text:el.textContent.trim().slice(0,45),size,contrast:ratio});
    }
    return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,textNodes:count,minContrast:min,problems};
   });report.push(audit);
   if([1440,390,320].includes(width)){
    for(const name of ['hero','experience','approach','statement','start']){
     const el=p.locator('.'+name).first();await el.screenshot({path:path.join(ROOT,`output/promotion/ui-${width}-${name}.png`)});
    }
   }
  }
  // Reflow at 200% zoom equivalent: 1440px viewport -> 720 CSS pixels.
  await p.setViewportSize({width:720,height:500});
  const reflow=await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
  fs.writeFileSync(path.join(ROOT,'output/promotion/ui-review.json'),JSON.stringify({checked:new Date().toISOString(),report,reflow},null,2));
  console.log(JSON.stringify({report,reflow},null,2));
  if(report.some(r=>r.overflow||r.problems.length)||!reflow)process.exitCode=1;
 }finally{await browser.close()}
})();
