const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const output='/Users/bytedance/Desktop/agi/agent-workforce-lab/design/review/learning-workspace';
const target='http://127.0.0.1:43224/operations.html';
(async()=>{
 const browser=await chromium.launch({headless:false});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [width,height] of [[1440,900],[1024,768],[768,1024],[375,812]]){
   await page.setViewportSize({width,height});await page.goto(target);
   for(const name of ['任务与现场','成员分工板','工作时间线']){
    await page.getByRole('button',{name,exact:true}).click();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(output,`ops-${name}-${width}.png`),fullPage:true});
   }
  }
  await page.setViewportSize({width:1440,height:900});await page.goto(target);
  await page.getByRole('button',{name:'查看指标分析帮手'}).click();
  await page.getByRole('button',{name:'确认邀请言川'}).click();
  assert.equal(await page.locator('#members .member').count(),2);
  assert.equal(await page.locator('#state').textContent(),'双人协作');
  await page.screenshot({path:path.join(output,'ops-two-members.png'),fullPage:true});
  await page.getByRole('button',{name:'查看回归验证帮手'}).click();
  await page.getByRole('button',{name:'确认邀请若宁'}).click();
  assert.equal(await page.locator('#members .member').count(),3);
  assert.equal(await page.locator('#org-name').textContent(),'压测排查任务组');
  assert.equal(await page.locator('#logs .log').count(),3);
  assert((await page.locator('#task-open small').textContent()).includes('3 位执行成员'));
  await page.screenshot({path:path.join(output,'ops-three-members.png'),fullPage:true});
  await page.getByRole('button',{name:'打开当前内容'}).click();
  assert((await page.locator('#content').textContent()).includes('若宁的贡献'));
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'提交供验收'}).click();
  await page.getByRole('button',{name:'打开当前内容'}).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'查看并验收'}).click();
  await page.getByLabel('验收意见').fill('分工与依据可回查；本次仅验收资料整理，不视为完成真实压测定位。');
  await page.getByRole('button',{name:'验收通过',exact:true}).click();
  assert.equal(await page.locator('#state').textContent(),'已验收');
  assert(await page.getByRole('button',{name:'提交供验收'}).isDisabled());
  await page.screenshot({path:path.join(output,'ops-accepted.png'),fullPage:true});
  await page.getByRole('button',{name:'发布任务',exact:true}).click();
  await page.getByLabel('任务名称').fill('检查新版本接口回归覆盖');
  await page.getByLabel('目标与约束').fill('只整理现有清单，不执行生产操作');
  await page.getByLabel('期望交付').fill('带依据的覆盖检查表');
  await page.getByRole('button',{name:'发布到任务池'}).click();
  assert.equal(await page.locator('#task-title').textContent(),'检查新版本接口回归覆盖');
  assert.equal(await page.locator('#members .member').count(),0);
  await page.getByRole('button',{name:'打开当前内容'}).click();
  assert((await page.locator('#content').textContent()).includes('带依据的覆盖检查表'));
  assert((await page.locator('#content').textContent()).includes('尚无成果'));
  await page.keyboard.press('Escape');
  await page.getByLabel('当前任务').selectOption('sample');
  assert.equal(await page.locator('#state').textContent(),'已验收');
  assert.equal(await page.locator('#members .member').count(),3);
  assert((await page.locator('#logs').textContent()).includes('验收通过'));
  await page.reload();
  for(const [invite,join] of [['查看指标分析帮手','确认邀请言川'],['查看回归验证帮手','确认邀请若宁']]){
   await page.getByRole('button',{name:invite}).click();
   await page.getByRole('button',{name:join}).click();
  }
  await page.getByRole('button',{name:'提交供验收'}).click();
  await page.getByRole('button',{name:'查看并验收'}).click();
  await page.getByLabel('验收意见').fill('请补充回归验证的具体输入输出和通过条件。');
  await page.getByRole('button',{name:'退回修订',exact:true}).click();
  assert((await page.locator('#review-error').textContent()).includes('当前已提交版本'));
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'打开当前内容'}).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'查看并验收'}).click();
  await page.getByLabel('验收意见').fill('请补充回归验证的具体输入输出和通过条件。');
  await page.getByRole('button',{name:'退回修订',exact:true}).click();
  assert.equal(await page.locator('#state').textContent(),'需修订');
  assert((await page.locator('#result-title').textContent()).includes('v1'));
  await page.getByLabel('修订内容').fill('补充原异常路径的输入输出对照，以及相邻功能的明确通过条件。');
  await page.getByRole('button',{name:'保存修订草稿'}).click();
  await page.getByRole('button',{name:'提交供验收'}).click();
  await page.getByRole('button',{name:'打开当前内容'}).click();
  assert((await page.locator('.version-content').textContent()).includes('明确通过条件'));
  await page.getByLabel('成果版本').selectOption('1');
  assert(!(await page.locator('.version-content').textContent()).includes('明确通过条件'));
  await page.getByLabel('成果版本').selectOption('2');
  await page.screenshot({path:path.join(output,'ops-version-history.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS operations: 3 layouts × 4 viewports; 1→2→3 members; continuous history; contribution artifact; acceptance; custom task fidelity');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
