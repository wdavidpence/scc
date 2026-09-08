const PW='/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const {chromium}=require(PW); const fs=require('fs');
(async()=>{
  const b=await chromium.launch({headless:false,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
  const p=await b.newPage({viewport:{width:1280,height:760}});
  await p.goto('http://127.0.0.1:4177/scc/index.html',{waitUntil:'load',timeout:60000});
  await p.waitForFunction(()=>window.__SCC2&&window.__SCC2.scene.isActive('Title'),null,{timeout:90000});
  await p.waitForTimeout(1200);
  const shot=async(name)=>{const du=await p.evaluate(()=>new Promise(r=>window.__SCC2.renderer.snapshot(img=>r(img.src))));fs.writeFileSync('/Users/davidpence/scc-work/verify/'+name,Buffer.from(du.split(',')[1],'base64'));console.log('shot',name);};
  await shot('vibe-title.png');
  for(let i=0;i<40;i++){
    const st=await p.evaluate(()=>window.__SCC2.scene.isActive('Battle'));
    if(st)break;
    await p.keyboard.press('Enter');
    await p.mouse.click(640,400); await p.keyboard.press('Space');
    await p.waitForTimeout(700);
  }
  await p.waitForFunction(()=>window.__SCC2.scene.isActive('Battle'),null,{timeout:20000});
  await p.waitForTimeout(4000);
  await shot('vibe-base.png');
  await p.evaluate(()=>{const g=window.__SCC2.scene.getScene('Battle');g.cameras.main.centerOn(96*16/2,96*16/2);});
  await p.waitForTimeout(1200);
  await shot('vibe-mid.png');
  await p.evaluate(()=>{
    const g=window.__SCC2.scene.getScene('Battle');
    const mine=g.units.filter(x=>!x.dead&&x.team===0&&!x.def.worker);
    if(g.clearSelection)g.clearSelection();
    for(const u of mine)g.addToSelection(u);
    const foe=g.units.find(x=>!x.dead&&x.team===1);
    if(foe){g.cameras.main.centerOn(foe.x,foe.y);g.issueGroupMove(mine,foe.x,foe.y,true);}
  });
  await p.waitForTimeout(6000);
  await shot('vibe-combat.png');
  await b.close();
  console.log('DONE');
})().catch(e=>{console.log('E',String(e).slice(0,200));process.exit(1)});
