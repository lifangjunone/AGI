const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');

const base=process.env.TARGET_URL||'http://127.0.0.1:43222';
const out=path.resolve(__dirname,'../design/review/selected-c');
fs.mkdirSync(out,{recursive:true});

(async()=>{
 const browser=await chromium.launch({headless:false});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  await page.getByLabel('你的姓名').fill('成长路线验收');
  await page.getByLabel('工作邮箱').fill(`growth-${Date.now()}@example.com`);
  await page.getByLabel('密码').fill('product123');
  await page.getByRole('button',{name:'继续进入产品'}).click();
  await page.getByLabel('团队或组织名称').fill('稳定性团队');
  await page.getByRole('button',{name:'建立空间并开始'}).click();
  await page.getByRole('button',{name:/我的数字分身/}).click();
  await page.getByRole('button',{name:/成长档案/}).click();
  await page.getByRole('button',{name:'建立我的专家身份'}).click();
  await page.getByLabel('姓名',{exact:true}).fill('李明');
  await page.getByLabel('岗位与专长').fill('稳定性工程师');
  await page.getByLabel('允许数字员工学习的范围').fill('脱敏压测复盘与性能异常诊断');
  await page.getByRole('button',{name:'确认并继续'}).click();
  await page.getByRole('button',{name:'创建我的数字分身',exact:true}).click();
  await page.getByLabel('数字员工姓名').fill('晓禾');
  await page.getByLabel('岗位目标').fill('产品压测异常诊断');
  await page.getByRole('button',{name:'确认并继续'}).click();
  await page.getByRole('button',{name:/学习空间/}).click();
  await page.getByRole('button',{name:'记录工作经验'}).click();
  await page.getByLabel('这段经验是什么').fill('长稳压测异常排查');
  await page.getByLabel('已有工作来源').fill('脱敏 Oncall 复盘');
  await page.getByLabel('已经发生的工作过程').fill('错误率抬升时先比对请求量、服务指标和变更时间线，再判断继续观察还是停止压测。');
  await page.getByRole('button',{name:'确认并继续'}).click();
  await page.getByRole('heading',{name:'补充一个判断边界'}).waitFor();
  await page.screenshot({path:path.join(out,'learning-action-1440.png'),fullPage:true});
  await page.getByRole('button',{name:/分身首页/}).click();
  await page.getByRole('heading',{name:'晓禾 的成长路线'}).waitFor();
  if(!await page.getByText('第 2 / 5 步',{exact:true}).isVisible())throw Error('首页没有反映当前成长步骤');
  if(!await page.getByRole('heading',{name:'回答一个判断边界'}).isVisible())throw Error('首页没有明确下一步动作');
  await page.getByRole('button',{name:'进入当前步骤'}).click();
  await page.getByRole('heading',{name:'补充一个判断边界'}).waitFor();
  if(!page.url().includes('/me/learning'))throw Error('首页下一步没有进入学习动作');
  await page.getByLabel('只回答它真正不懂的地方').fill('异常持续并影响正常请求时停止；证据不足或涉及生产变更时必须找真人。');
  await page.getByRole('button',{name:'回答并继续'}).click();
  await page.getByRole('heading',{name:'确认分身复述的方法'}).waitFor();
  await page.getByRole('button',{name:/分身首页/}).click();
  await page.getByRole('heading',{name:'确认它复述的方法'}).waitFor();
  for(const [width,height] of [[1440,900],[1024,768],[768,1024],[375,812]]){
   await page.setViewportSize({width,height});
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(`首页横向溢出 ${width}`);
   const h1Size=await page.locator('h1').evaluate(element=>parseFloat(getComputedStyle(element).fontSize));
   if(h1Size>28)throw Error(`首页标题过大 ${width}: ${h1Size}px`);
   await page.screenshot({path:path.join(out,`growth-home-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:375,height:812});
  await page.getByRole('button',{name:/学习空间/}).click();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('学习页移动端横向溢出');
  await page.screenshot({path:path.join(out,'learning-action-375.png'),fullPage:true});
  if(errors.length)throw Error(errors.join('\n'));
  console.log(JSON.stringify({ok:true,screenshots:out,flow:'创建分身→加入经验→首页识别当前关口→进入动作→状态前进→响应式'}));
 }finally{
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exit(1)});
