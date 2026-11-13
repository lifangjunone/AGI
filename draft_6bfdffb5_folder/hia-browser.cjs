const {chromium}=require('/Users/bytedance/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const fs=require('fs');
const root=__dirname;
async function run(action){
  const b=await chromium.connectOverCDP('http://127.0.0.1:51196');
  try{
    const p=b.contexts()[0].pages().find(x=>x.url().includes('hia.volcenginepaas.com'));
    const f=p.frames().find(x=>x!==p.mainFrame());
    const shot=async(name)=>{
      const s=await p.context().newCDPSession(p);
      const r=await s.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
      fs.writeFileSync(`${root}/${name}.png`,Buffer.from(r.data,'base64'));
      await s.detach();
      console.log(`Screenshot: ${name}.png`);
    };
    await action({b,p,f,shot});
  } finally {await b.close();}
}
module.exports=run;
