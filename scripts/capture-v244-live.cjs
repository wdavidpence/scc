const PW='/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const {chromium}=require(PW); const fs=require('fs');
const OUT='/Users/davidpence/scc-work/verify';
(async()=>{
  const b=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
  const p=await b.newPage({viewport:{width:1280,height:760}});
  const errs=[];
  p.on('pageerror',e=>errs.push(String(e).slice(0,160)));
  await p.goto('https://wdavidpence.github.io/scc/',{waitUntil:'load',timeout:60000});
  await p.waitForFunction(()=>window.__SCC2&&window.__SCC2.scene.isActive('Title'),null,{timeout:90000});
  await p.waitForTimeout(1500);
  const shot=async(name)=>{const du=await p.evaluate(()=>new Promise(r=>window.__SCC2.renderer.snapshot(img=>r(img.src))));fs.writeFileSync(OUT+'/'+name,Buffer.from(du.split(',')[1],'base64'));console.log('shot',name);};
  await shot('v244-title-live.png');
  // enter battle
  for(let i=0;i<40;i++){
    const st=await p.evaluate(()=>window.__SCC2.scene.isActive('Battle'));
    if(st)break;
    await p.keyboard.press('Enter');
    await p.mouse.click(640,400); await p.keyboard.press('Space');
    await p.waitForTimeout(700);
  }
  await p.waitForFunction(()=>window.__SCC2.scene.isActive('Battle'),null,{timeout:20000});
  await p.waitForTimeout(5000);
  await shot('v244-base-live.png');
  // mid-map view: reveal more, select workers
  const info=await p.evaluate(()=>{
    const g=window.__SCC2.scene.getScene('Battle');
    g.cameras.main.setZoom(1.6);
    g.cameras.main.centerOn(96*16/2,96*16/2);
    return {units:g.units.length,bld:g.buildings.length,zoom:g.cameras.main.zoom};
  });
  console.log('mid',JSON.stringify(info));
  await p.waitForTimeout(1500);
  await shot('v244-mid-live.png');
  // zoomed units at own base with selection
  await p.evaluate(()=>{
    const g=window.__SCC2.scene.getScene('Battle');
    const mine=g.units.filter(x=>!x.dead&&x.team===0);
    if(g.clearSelection)g.clearSelection();
    for(const u of mine.slice(0,8))g.addToSelection(u);
    if(mine[0]){g.cameras.main.setZoom(2.2);g.cameras.main.centerOn(mine[0].x,mine[0].y);}
  });
  await p.waitForTimeout(1500);
  await shot('v244-units-selected.png');
  // hover tooltip over a unit to capture overlap behavior
  await p.evaluate(()=>{
    const g=window.__SCC2.scene.getScene('Battle');
    const u=g.units.find(x=>!x.dead&&x.team===0);
    if(!u)return;
    const cam=g.cameras.main;
    const sx=(u.x-cam.worldView.x)*cam.zoom, sy=(u.y-cam.worldView.y)*cam.zoom;
    g._hoverTip.setText(['Hover Probe  Lv0','HP 45/45','Kills 2']).setPosition(sx,sy-6).setAlpha(1);
  });
  await p.waitForTimeout(600);
  await shot('v244-hover-tip.png');
  console.log('pageerrors',JSON.stringify(errs.slice(0,5)));
  await b.close();
  console.log('DONE');
})().catch(e=>{console.log('E',String(e).slice(0,300));process.exit(1)});
