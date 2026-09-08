const PW='/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const {chromium}=require(PW);
(async()=>{
  const b=await chromium.launch({headless:false,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const p=await b.newPage({viewport:{width:1280,height:760}});
  p.on('pageerror',e=>console.log('PE',String(e.message).slice(0,140)));
  await p.goto('http://127.0.0.1:4177/scc/index.html',{waitUntil:'load'});
  await p.waitForFunction(()=>window.__SCC2&&window.__SCC2.scene.isActive('Title'),null,{timeout:90000});
  await p.keyboard.press('Enter');
  for(let i=0;i<14;i++){
    const act=await p.evaluate(()=>window.__SCC2.scene.scenes.map(s=>s.scene.key+':'+(s.scene.isActive()?'A':'-')).join(' '));
    console.log(i,act);
    await p.mouse.click(640,400);
    await p.keyboard.press('Space');
    await p.waitForTimeout(1000);
  }
  await b.close();
})().catch(e=>{console.log('E',String(e).slice(0,200));process.exit(1)});
