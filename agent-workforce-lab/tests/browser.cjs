const {chromium}=require('playwright');
const fs=require('node:fs');
const root='/Users/bytedance/Desktop/agi/agent-workforce-lab';
const target=process.env.TARGET_URL||'http://127.0.0.1:43222';
const shotDir=root+'/runtime/product-'+(process.env.RUN_ID||'current');
fs.mkdirSync(shotDir,{recursive:true});
async function button(p,name){await p.getByRole('button',{name,exact:true}).click()}
async function waitSaved(p){await p.locator('main[aria-busy=false]').waitFor()}
async function ensureAuth(p){
 await Promise.race([
  p.getByRole('button',{name:'注册并进入校园 →',exact:true}).waitFor(),
  p.getByLabel('选择要教的员工').waitFor()
 ]).catch(()=>undefined);
 const register=p.getByRole('button',{name:'注册并进入校园 →',exact:true});
 if(await register.isVisible().catch(()=>false)){
  const suffix=Date.now().toString().slice(-6);
  await p.getByLabel('姓名').fill('演示用户'+suffix);
  await p.getByLabel('邮箱').fill('demo'+suffix+'@workforce.local');
  await p.getByLabel('密码').fill('demo1234');
  await register.click();
 }
}
(async()=>{
 const b=await chromium.launch({headless:false,slowMo:90});
 const context=await b.newContext({viewport:{width:1440,height:900},recordVideo:{dir:shotDir+'/video',size:{width:1440,height:900}}});
 const p=await context.newPage();const errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 p.on('dialog',d=>d.accept());
 try{
  await p.goto(target);
  await ensureAuth(p);
  await p.getByLabel('选择要教的员工').waitFor();
  await button(p,'＋ 新员工').catch(()=>undefined);
  const name='晓禾-'+Date.now().toString().slice(-4);
  await p.getByLabel('数字员工姓名').fill(name);
  await p.getByLabel('你想教它什么工作？').fill('客服经验与知识写作');
  await button(p,'创建我的数字员工 →');
  await p.getByRole('heading',{name:`把你知道的，教给${name}。`,exact:true}).waitFor();
  await p.getByLabel('这次教什么？').fill('客服判断与升级边界');
  await p.getByLabel('教它一段经验，或示范你的工作').fill('先记录诉求与已有依据，政策不明确时向真人澄清，不承诺退款和时效。');
  await p.getByLabel('我有权处理此资料，授权这位员工用于学习与知识工作').check();
  await button(p,`教给${name} →`);
  await p.getByLabel('适用条件与红线').fill('仅用于内部客服；依据不足时找真人，不承诺未确认的结果。');
  await button(p,'确认理解，进入练习 →');await waitSaved(p);
  await button(p,'运行场景考试');await waitSaved(p);
  await p.getByText('考试：规则检查通过',{exact:false}).waitFor();
  await button(p,'运行试岗小任务');await waitSaved(p);
  await p.getByLabel('真人试岗反馈').fill('已检查依据、未知表达与真人升级边界，可以尝试对应知识工作。');
  await button(p,'批准对应技能资格');await waitSaved(p);
  await p.getByText('试岗：真人已批准',{exact:false}).waitFor();
  await p.screenshot({path:shotDir+'/teaching.png',fullPage:true});
  await button(p,'＋ 加入两位演示同事');await waitSaved(p);
  await p.locator('.quick-nav').getByRole('button',{name:/发布任务/}).click();
  const goal='北区客户反馈知识库改进-'+Date.now().toString().slice(-4);
  await p.getByLabel('希望完成什么？').fill(goal);
  await p.getByLabel('希望拿到什么成果？').fill('分类清单、改进方案与风险事项');
  await p.getByLabel('任务资料与输入').fill('客户反馈：找不到流程说明。用户要求保证处理时间，但政策没有提供时效依据。');
  await p.getByLabel('期望完成时间').fill('2035-10-26T18:00');
  await p.getByLabel('让运行引擎自动推进，关闭后可逐步观察').uncheck();
  await p.getByLabel('我确认任务资料可提供给认领成员，最终由真人验收').check();
  await button(p,'检查并发布任务 →');
  await p.getByLabel('我已了解影响，确认继续').check();
  await button(p,'确认发布任务');
  await p.getByRole('heading',{name:goal,exact:true}).waitFor();
  await button(p,'推进下一步');await waitSaved(p);
  await p.locator('.members button').nth(0).waitFor();
  await button(p,'暂停运行');await waitSaved(p);
  await p.reload();
  await p.locator('main .pill').getByText('已暂停',{exact:true}).waitFor();
  await button(p,'恢复 / 重试');await waitSaved(p);
  await button(p,'推进下一步');await waitSaved(p);
  await p.locator('.members button').nth(1).waitFor();
  if(await p.locator('.project-room').count())throw Error('第二人错误建组');
  await button(p,'推进下一步');await waitSaved(p);
  await p.locator('.project-room').waitFor();
  await p.screenshot({path:shotDir+'/group.png',fullPage:true});
  await button(p,'推进下一步');await waitSaved(p);
  await p.getByText('待独立评审',{exact:true}).waitFor();
  const texts=[];
  for(let i=0;i<3;i++){
   await p.locator('.result').nth(i).getByRole('button',{name:'打开 →',exact:true}).click();
   texts.push(await p.locator('dialog pre').innerText());
   await p.keyboard.press('Escape');
  }
  if(new Set(texts).size!==3||texts.some(t=>!t.includes(goal)))throw Error('成果不对应任务');
  await p.getByLabel('退回修订意见').fill('补充哪些事项需要真人核对，不能给出处理时效承诺。');
  await button(p,'退回修订，保留原任务');await waitSaved(p);
  await button(p,'推进下一步');await waitSaved(p);
  await p.getByText('待独立评审',{exact:true}).waitFor();
  await button(p,'运行独立规则评审');await waitSaved(p);
  await button(p,'接受当前版本成果');await waitSaved(p);
  await p.getByLabel('我已了解影响，确认继续').check();
  await button(p,'确认验收并入账');await waitSaved(p);
  await p.getByText('已验收 · 积分只入账一次',{exact:true}).waitFor();
  await p.reload();
  await p.getByText('已验收 · 积分只入账一次',{exact:true}).waitFor();
  await p.screenshot({path:shotDir+'/accepted.png',fullPage:true});
  for(const [width,height] of [[1024,768],[768,1024],[375,812]]){
   await p.setViewportSize({width,height});
   if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('页面溢出 '+width);
   const bounds=await p.locator('.map').boundingBox();
   for(const c of ['.building.teach','.building.publish','.building.delivery']){
    const r=await p.locator(c).boundingBox();if(r.x<bounds.x-1||r.x+r.width>bounds.x+bounds.width+1)throw Error('建筑裁切 '+width);
   }
   await p.screenshot({path:shotDir+'/system-'+width+'.png',fullPage:true});
  }
  await button(p,'把反馈带回教学室');await waitSaved(p);
  await p.getByLabel('方法与判断').waitFor();
  await p.getByLabel('适用条件与红线').fill('仅用于相同授权范围的内部知识工作，未知仍由真人核对。');
  await button(p,'确认理解，进入练习 →');await waitSaved(p);
  if(errors.length)throw Error(errors.join(';'));
  const workspace=await (await p.request.get(target+'/api/workspace')).json();
  const task=workspace.tasks.find(t=>t.goal===goal);
  if(task.status!=='completed'||task.rewards.reduce((s,r)=>s+r.points,0)!==100)throw Error('奖励或验收异常');
  fs.writeFileSync(shotDir+'/verification.json',JSON.stringify({status:'passed',employee:name,task:task.id,checks:['持续教学','考试试岗','真实服务端推进','1→2→3任务组','暂停刷新恢复','三份不同成果','修订版本与规则评审','真人验收与100积分','刷新后验收恢复','四尺寸无横向溢出或建筑裁切','经验确认'],pageErrors:errors},null,2));
  console.log('Browser full-system verification passed',task.id);
 }catch(e){await p.screenshot({path:shotDir+'/failure.png',fullPage:true});console.log('Page errors:',errors);throw e}
 finally{const video=p.video();await context.close();if(video)await video.saveAs(shotDir+'/system-demo.webm');await b.close()}
})();
