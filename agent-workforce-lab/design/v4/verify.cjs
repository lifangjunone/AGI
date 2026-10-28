const {chromium,expect}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const root='/Users/bytedance/Desktop/agi/agent-workforce-lab/design/v4';
const target='http://127.0.0.1:43220';
const dir=path.join(root,'evidence','final');
fs.mkdirSync(dir,{recursive:true});
const click=(p,name)=>p.getByRole('button',{name,exact:true}).click();
async function shot(p,name){await p.screenshot({path:path.join(dir,name+'.png'),fullPage:true})}
async function story(p,record=false){
 await p.goto(target);
 if(record)await shot(p,'home-desktop');
 await p.getByLabel('你想教它什么工作？').fill('客服经验与知识写作');
 await click(p,'创建我的数字员工 →');
 const lesson='先记录客户诉求与依据；政策不明确时升级给真人，不承诺退款或时效。';
 await p.getByLabel('教它一段经验，或示范你的工作').fill(lesson);
 await p.locator('.quick-nav [data-space=publish]').click();
 await p.locator('.quick-nav [data-space=teach]').click();
 if(await p.getByLabel('教它一段经验，或示范你的工作').inputValue()!==lesson)throw Error('教学草稿丢失');
 if(record)await shot(p,'teaching-desktop');
 await click(p,'教给晓禾 →');
 await p.getByLabel('适用条件与红线').fill('仅限内部客服；信息不足找真人，不自动承诺退款。');
 await click(p,'确认理解，进入练习 →');
 await click(p,'开始场景考试');
 await p.getByLabel('直接承诺退款，事后再补依据').check();
 await click(p,'确认样例考试');
 if(!(await p.locator('#exam-error').innerText()).includes('未通过'))throw Error('错误考试未阻止');
 await p.getByLabel('整理已知信息，缺少依据先向真人澄清').check();
 await p.getByLabel('已检查答法与边界，没有越权承诺').check();
 await click(p,'确认样例考试');
 await click(p,'完成一个试岗小任务');
 await p.getByLabel('已检查成果能应用知识，可尝试对应任务').check();
 await click(p,'确认试岗成果');
 await click(p,'发布一项任务');
 const goal='分析北区客户反馈，提出知识库改进方案';
 await p.getByLabel('希望完成什么？').fill(goal);
 await p.getByLabel('希望拿到什么成果？').fill('反馈分类、改进建议和风险清单');
 await p.getByLabel('期望完成时间').fill('2026-01-01T12:00');
 await click(p,'检查并发布任务 →');
 if(!(await p.locator('#deadline-error').innerText()).includes('未来'))throw Error('过去时间未阻止');
 await p.getByLabel('期望完成时间').fill('2030-10-26T18:00');
 await p.locator('.quick-nav [data-space=teach]').click();
 await p.locator('.quick-nav [data-space=publish]').click();
 if(await p.getByLabel('希望完成什么？').inputValue()!==goal)throw Error('任务草稿丢失');
 await click(p,'检查并发布任务 →');
 await click(p,'确认发布');
 if(!(await p.locator('#consent-error').innerText()).includes('确认'))throw Error('授权未阻止');
 await p.getByLabel('我确认资料有权处理，成果由真人检查').check();
 await click(p,'确认发布');
 const taskId=await p.evaluate(()=>state.task.id);
 if(await p.locator('.employee').count()!==1)throw Error('不是独立开始');
 if(record)await shot(p,'solo-desktop');
 await click(p,'观察执行中的求助');
 if(await p.locator('.employee').count()!==2||await p.locator('.project-room').count())throw Error('双人错误建组');
 if(record)await shot(p,'pair-desktop');
 await click(p,'观察第 3 人加入');
 if(await p.locator('.employee').count()!==3||await p.locator('.project-room').count()!==1)throw Error('第三人未建组');
 if(taskId!==await p.evaluate(()=>state.task.id))throw Error('原任务改变');
 if(record)await shot(p,'group-desktop');
 await click(p,'检查并提交成果');
 const texts=[];
 for(const id of ['analysis','draft','risk']){
  await p.locator(`[data-artifact=${id}]`).click();
  texts.push(await p.locator('.artifact-content').innerText());
  await p.keyboard.press('Escape');
 }
 if(new Set(texts).size!==3||texts.some(t=>!t.includes(goal)))throw Error('产物不是不同的任务成果');
 if(!(await p.locator('[data-action=accept]').isDisabled()))throw Error('未评审可验收');
 await click(p,'退回修订');
 await p.getByLabel('指出需要改进的成果或条件').fill('补充升级给真人的触发条件和待确认事项。');
 await click(p,'保留反馈并演示修订');
 if(!(await p.evaluate(()=>state.revising&&state.revision===0)))throw Error('退回后伪造修订完成');
 await click(p,'完成样例修订');
 await click(p,'进行独立评审');
 await p.getByLabel('已检查目标一致、来源可回查、无越权承诺').check();
 await click(p,'记录评审通过');
 await click(p,'验收成果');
 await p.getByLabel('我已检查目标、成果、依据与评审').check();
 await click(p,'接受成果');
 await click(p,'查看验收记录');
 if(!(await p.locator('#modal-body').innerText()).includes('不再次奖励'))throw Error('重复奖励边界缺失');
 await p.keyboard.press('Escape');
 if(record)await shot(p,'accepted-desktop');
 await click(p,'将反馈带回教学室');
 await p.keyboard.press('Escape');
 await click(p,'确认这条经验');
 if(!(await p.evaluate(()=>state.experienceConfirmed)))throw Error('经验确认失败');
 if(record)await shot(p,'experience-desktop');
 if(record){
  await p.locator('.quick-nav [data-space=delivery]').click();
  for(const [width,height] of [[1440,900],[1024,768],[768,1024],[375,812]]){
   await p.setViewportSize({width,height});
   await p.evaluate(()=>$('#toast').classList.remove('show'));
   if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('横向溢出 '+width);
   const bounds=await p.locator('.map').boundingBox();
   for(const loc of ['.teaching','.publishing','.delivering']){
    const r=await p.locator(loc).boundingBox();
    if(r.x<bounds.x-1||r.x+r.width>bounds.x+bounds.width+1)throw Error('建筑裁切 '+width+' '+loc);
   }
   await shot(p,'results-'+width);
  }
  await p.locator('.quick-nav [data-space=teach]').click();
  if(await p.locator('#main').evaluate(el=>el.getBoundingClientRect().top)>80)throw Error('小屏面板未定位');
  await click(p,'教一段新知识');
  if(!await p.locator('summary',{hasText:'上一条已确认知识'}).count())throw Error('历史知识丢失');
  await p.goto(target);
  await shot(p,'home-mobile');
 }
}
(async()=>{
 const browser=await chromium.launch({headless:false,slowMo:process.env.RECORD?300:0});
 const result=[];
 try{
  for(let i=1;i<=3;i++){
   const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:i===3?'reduce':'no-preference',...(i===3&&process.env.RECORD?{recordVideo:{dir:path.join(dir,'video'),size:{width:1440,height:900}}}:{})});
   const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
   try{await story(p,i===3)}catch(error){await shot(p,'failure');console.log('脚本错误',errors);console.log(await p.locator('#modal-body').innerText());throw error}
   if(errors.length)throw Error(errors.join(';'));
   result.push({pass:i,status:'passed',reducedMotion:i===3,story:'教学→考试失败/重试→试岗→发布→1/2/3人→三产物→修订→评审→验收→经验确认'});
   const video=p.video();await context.close();
   if(video)await video.saveAs(path.join(dir,'campus-demo.webm'));
   console.log('完整故事通过 '+i);
  }
  const context=await browser.newContext({viewport:{width:375,height:812}});const p=await context.newPage();
  await p.goto(target);await p.locator('.quick-nav [data-space=publish]').click();
  await p.getByLabel('希望完成什么？').fill('资格不足的任务');
  await p.getByLabel('希望拿到什么成果？').fill('等待资格结果');
  await p.getByLabel('期望完成时间').fill('2030-10-26T18:00');
  await click(p,'检查并发布任务 →');await p.getByLabel('我确认资料有权处理，成果由真人检查').check();await click(p,'确认发布');
  if(!(await p.locator('#main').innerText()).includes('尚未完成考试与试岗'))throw Error('资格不足被错误认领');
  await click(p,'暂停动效');
  if(!await p.locator('body.motion-paused').count())throw Error('暂停无效');
  await p.goto(target);
  await p.keyboard.press('Tab');if(!await p.locator('.skip:focus').count())throw Error('键盘跳转入口失效');
  await p.keyboard.press('Enter');await p.getByRole('button',{name:'使用说明',exact:true}).click();await p.keyboard.press('Escape');
  await context.close();
  fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify({date:new Date().toISOString(),result,extra:['未具资格禁止认领','键盘跳转与 Escape','暂停动效','四尺寸无横向溢出与建筑裁切','移动面板定位'],limitations:['未做真实用户测试','无真实模型或权限实现','单任务内存原型']},null,2));
 }finally{await browser.close()}
})();
