const PW='/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const {chromium}=require(PW); const fs=require('fs');
const OUT='/tmp/scc_shots/v230'; fs.mkdirSync(OUT,{recursive:true});
(async()=>{
  const b=await chromium.launch({headless:false,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
  const p=await b.newPage({viewport:{width:1600,height:900}});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('http://localhost:4183/scc/',{waitUntil:'load',timeout:60000});
  await p.evaluate(()=>{try{localStorage.clear()}catch(e){}});
  await p.reload({waitUntil:'load',timeout:60000});
  await p.waitForFunction(()=>window.__SCC2&&window.__SCC2.scene.isActive('Cut'),null,{timeout:60000}).catch(()=>console.log('NO_AUTO_INTRO'));
  const shot=async(name)=>{try{const du=await Promise.race([p.evaluate(()=>new Promise(r=>window.__SCC2.renderer.snapshot(img=>r(img.src)))),p.waitForTimeout(8000).then(()=>null)]);if(du)fs.writeFileSync(OUT+'/'+name+'.png',Buffer.from(du.split(',')[1],'base64'));console.log('shot',name);}catch(e){console.log('shotfail',name,String(e).slice(0,80));}};
  const ts=[0,3,6,10,15,20,26,32,38,44,50,56,62,68,74];
  let prev=0;
  for(const s of ts){ await p.waitForTimeout((s-prev)*1000); prev=s;
    const beat=await p.evaluate(()=>{const c=window.__SCC2.scene.getScene('Cut');return c&&c.scene.isActive()?c.i:-1;}).catch(()=>-1);
    await shot('cut'+String(s).padStart(2)+'_beat'+String(beat).padStart(2)); }
  const st=await p.evaluate(()=>({cut:window.__SCC2.scene.isActive('Cut'),title:window.__SCC2.scene.isActive('Title')}));
  console.log('after intro:',JSON.stringify(st));
  // audio state
  const aud=await p.evaluate(()=>window.__CIN?{ready:window.__CIN.readyCount(),total:window.__CIN.total(),playing:window.__CIN.playing()}:null);
  console.log('AUDIO:',JSON.stringify(aud));
  // title states
  await shot('title_terran');
  // precise: set race via scene API (avoid stray clicks launching missions)
  await p.evaluate(()=>{const t=window.__SCC2.scene.getScene('Title');if(t)t.setRace('zerg');});
  await p.waitForTimeout(600); await shot('title_zerg');
  await p.evaluate(()=>{const t=window.__SCC2.scene.getScene('Title');if(t)t.setRace('protoss');});
  await p.waitForTimeout(600); await shot('title_protoss');
  // wait out the attract loop (8s idle)
  await p.waitForTimeout(9000);
  const attract=await p.evaluate(()=>{const t=window.__SCC2.scene.getScene('Title');return t?{on:t._attractOn,race:t.pick.race}:null;});
  console.log('ATTRACT:',JSON.stringify(attract));
  await shot('title_attract');
  console.log('ERRORS:',JSON.stringify(errs));
  await b.close();
})().catch(e=>{console.log('FATAL',String(e)); process.exit(1);});
