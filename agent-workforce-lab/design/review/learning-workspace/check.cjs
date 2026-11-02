const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const target='http://127.0.0.1:43224';
const output='/Users/bytedance/Desktop/agi/agent-workforce-lab/design/review/learning-workspace';
(async()=>{
 const browser=await chromium.launch({headless:false});
 try{
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const mode of ['inbox','studio','map']){
   for(const [width,height] of [[1440,900],[1024,768],[768,1024],[375,812]]){
    await page.setViewportSize({width,height});await page.goto(`${target}/#${mode}`);
    await page.getByRole('heading',{name:mode==='inbox'?'学习空间':mode==='studio'?'晓禾的工作室':'成长路线',exact:true,level:1}).waitFor();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${mode} overflow ${width}`);
    assert(await page.locator('h1').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)<=28));
    await page.screenshot({path:path.join(output,`${mode}-${width}.png`),fullPage:true});
   }
  }
  await page.setViewportSize({width:1440,height:900});await page.goto(target);
  const answer='异常持续且影响正常请求时停止压测，证据不足时先联系负责人，不自行修改生产配置。';
  await page.getByLabel('补充你的判断').fill(answer);
  await page.getByRole('button',{name:/接口错误如何分类/}).click();
  await page.getByRole('button',{name:/长稳压测的停止条件/}).click();
  assert.equal(await page.getByLabel('补充你的判断').inputValue(),answer);
  await page.getByRole('button',{name:'让晓禾复述理解'}).click();
  assert.equal(await page.locator('#understanding').textContent(),answer);
  await page.getByRole('button',{name:'确认理解，交运营考核'}).click();
  assert.equal(await page.locator('#lesson-status').textContent(),'待运营考核');
  await page.getByRole('button',{name:/回归验证要覆盖什么/}).click();
  await page.getByLabel('补充你的判断').fill('每次验证要对照输入输出，保留结果和判定依据，不执行生产变更。');
  await page.getByRole('button',{name:'让晓禾复述理解'}).click();
  await page.getByRole('button',{name:'确认理解，交运营考核'}).click();
  await page.getByRole('button',{name:/长稳压测的停止条件/}).click();
  assert.equal(await page.locator('#lesson-status').textContent(),'待运营考核');
  assert.equal(await page.getByLabel('补充你的判断').isVisible(),false);
  assert((await page.locator('#response').textContent()).includes(answer));
  await page.screenshot({path:path.join(output,'inbox-confirmed.png'),fullPage:true});
  await page.getByRole('button',{name:'查看完整来源'}).click();
  assert(await page.locator('#source-dialog').evaluate(e=>e.open));
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#source-dialog').evaluate(e=>e.open),false);
  await page.getByRole('button',{name:'查看首次使用状态'}).click();
  await page.getByRole('heading',{name:'创建你的第一个数字分身'}).waitFor();
  await page.getByLabel('分身姓名').fill('知禾');
  await page.getByRole('button',{name:'创建分身',exact:true}).click();
  await page.getByRole('heading',{name:'添加允许学习的资料'}).waitFor();
  await page.keyboard.press('Escape');
  assert((await page.locator('#created').textContent()).includes('知禾'));
  await page.screenshot({path:path.join(output,'first-use.png'),fullPage:true});
  await page.setViewportSize({width:375,height:812});await page.goto(target+'/');
  await page.getByLabel('补充你的判断').fill(answer);
  await page.getByLabel('当前学习记录').selectOption('2');
  assert((await page.locator('#question').textContent()).includes('还需要你补充'));
  await page.getByLabel('当前学习记录').selectOption('0');
  assert.equal(await page.getByLabel('补充你的判断').inputValue(),answer);
  assert.deepEqual(errors,[]);
  console.log('PASS: 3 concepts × 4 viewports; draft persistence; confirmation boundary; dialog Escape; first use; no page errors');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
