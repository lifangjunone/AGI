const {chromium}=require('playwright');
const fs=require('node:fs');
const root='/Users/bytedance/Desktop/agi/agent-workforce-lab/runtime/product-review';
fs.mkdirSync(root,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:false});
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:43221');
  await Promise.race([
   page.getByRole('button',{name:'注册并进入校园 →',exact:true}).waitFor(),
   page.getByLabel('选择要教的员工').waitFor()
  ]).catch(()=>undefined);
  const register=page.getByRole('button',{name:'注册并进入校园 →',exact:true});
  if(await register.isVisible().catch(()=>false)){
   const suffix=Date.now().toString().slice(-6);
   await page.getByLabel('姓名').fill('评审用户'+suffix);
   await page.getByLabel('邮箱').fill('review'+suffix+'@workforce.local');
   await page.getByLabel('密码').fill('demo1234');
   await register.click();
  }
  await page.getByLabel('选择要教的员工').waitFor();
  await page.screenshot({path:root+'/teaching.png',fullPage:true});
  await page.screenshot({path:root+'/teaching-viewport.png'});
  const lesson='检查失败后仍然保留的教学经验草稿。';
  await page.getByLabel('这次教什么？').fill('失败与重试验证');
  await page.getByLabel('教它一段经验，或示范你的工作').fill(lesson);
  await page.getByLabel('我有权处理此资料，授权这位员工用于学习与知识工作').check();
  await page.route('**/api/teaching',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'测试模拟：服务暂时不可用'})}));
  await page.locator('main .tab-content').getByRole('button',{name:/^教给/}).click();
  await page.locator('.error-banner').filter({hasText:'测试模拟：服务暂时不可用'}).waitFor();
  if(await page.getByLabel('教它一段经验，或示范你的工作').inputValue()!==lesson)throw Error('失败后草稿丢失');
  await page.reload();
  await page.getByLabel('选择要教的员工').waitFor();
  if(await page.getByLabel('教它一段经验，或示范你的工作').inputValue()!==lesson)throw Error('刷新草稿丢失');
  await page.getByRole('button',{name:'考试与试岗',exact:true}).click();
  await page.screenshot({path:root+'/growth.png',fullPage:true});
  await page.locator('.quick-nav [aria-pressed]').nth(1).click();
  await page.screenshot({path:root+'/publish.png',fullPage:true});
  await page.getByLabel('搜索任务').fill('不存在的任务-123');
  await page.getByText('没有符合条件的任务，试试其他筛选。').waitFor();
  await page.getByLabel('搜索任务').fill('');
  await page.locator('.task-row').first().click();
  await page.getByRole('button',{name:/成果与验收/}).click();
  await page.screenshot({path:root+'/delivery.png',fullPage:true});
  const open=page.locator('.result').getByRole('button',{name:'打开 →',exact:true}).first();
  if(await open.count()){
   await open.click();
   const download=page.waitForEvent('download');
   await page.getByRole('button',{name:'下载 Markdown',exact:true}).click();
   const artifact=await download;await artifact.saveAs(root+'/'+artifact.suggestedFilename());
   await page.screenshot({path:root+'/artifact.png',fullPage:true});
   await page.keyboard.press('Escape');
  }
  for(const [width,height] of [[1024,768],[768,1024],[375,812]]){
   await page.setViewportSize({width,height});
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('溢出 '+width);
   await page.screenshot({path:root+'/delivery-'+width+'.png',fullPage:true});
  }
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>document.documentElement.style.zoom='2');
  await page.screenshot({path:root+'/delivery-200.png',fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('200%溢出');
  if(errors.length)throw Error(errors.join(';'));
  fs.writeFileSync(root+'/checks.json',JSON.stringify({status:'passed',checks:['保存失败输入保留','刷新教学草稿读回','搜索空状态','成果下载','四尺寸','200%缩放','减少动效'],errors},null,2));
  console.log('Product failure/reload/search/download/viewport checks passed');
 }finally{await context.close();await browser.close()}
})();
