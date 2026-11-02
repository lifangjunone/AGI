const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');

const base=process.env.TARGET_URL||'http://127.0.0.1:43222';
const out=path.resolve(__dirname,'../design/review/master-twin-showcase');
fs.mkdirSync(out,{recursive:true});

(async()=>{
 const browser=await chromium.launch({headless:false});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  await page.getByLabel('你的姓名').fill('终局样板验收');
  await page.getByLabel('工作邮箱').fill(`showcase-${Date.now()}@example.com`);
  await page.getByLabel('密码').fill('product123');
  await page.getByRole('button',{name:'继续进入产品'}).click();
  await page.getByLabel('团队或组织名称').fill('稳定性产品团队');
  await page.getByRole('button',{name:'建立空间并开始'}).click();
  await page.getByRole('button',{name:/我的数字分身/}).click();
  await page.getByRole('heading',{name:'让你的经验，长成一个真正能独立工作的数字分身。'}).waitFor();
  await page.getByLabel('专家阶数字分身图鉴').waitFor();
  if(await page.getByText(/虚构|不是你的真实数据/).count())throw Error('客户界面仍出现研发免责声明');
  await page.getByRole('heading',{name:'不是换一个称号，而是获得更大的工作能力。'}).waitFor();
  await page.getByRole('heading',{name:'它获得的不是“聪明分”，而是可验证的工作权限。'}).waitFor();
  await page.getByLabel('专家阶解锁条件').waitFor();
  await page.getByText('≥6',{exact:true}).waitFor();
  await page.waitForTimeout(2400);
  for(const [width,height] of [[1440,900],[1024,768],[768,1024],[375,812]]){
   await page.setViewportSize({width,height});
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(`样板间横向溢出 ${width}`);
   const cta=page.getByRole('button',{name:'开始培养我的数字分身'});
   if(!await cta.isVisible())throw Error(`主动作不可见 ${width}`);
   const pageHeight=await page.evaluate(()=>document.documentElement.scrollHeight);
   if(width>=1024&&pageHeight<1100)throw Error(`桌面内容仍然过空 ${width}: ${pageHeight}`);
   await page.screenshot({path:path.join(out,`master-showcase-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:375,height:812});
  await page.getByRole('button',{name:'开始培养我的数字分身'}).click();
  await page.getByRole('heading',{name:'我教过什么，它真正会什么'}).waitFor();
  if(errors.length)throw Error(errors.join('\n'));
  console.log(JSON.stringify({ok:true,screenshots:out,flow:'首次进入→看见专家分身终局→创建自己的分身'}));
 }finally{
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exit(1)});
