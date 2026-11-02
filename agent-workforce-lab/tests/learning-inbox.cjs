const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.TARGET_URL||'http://127.0.0.1:43222';
const out=path.resolve(__dirname,'../design/review/workspace-inbox');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:false});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);
  await page.getByLabel('你的姓名').fill('收件箱验收');
  await page.getByLabel('工作邮箱').fill(`inbox-${Date.now()}@example.com`);
  await page.getByLabel('密码').fill('product123');
  await page.getByRole('button',{name:'继续进入产品'}).click();
  await page.getByLabel('团队或组织名称').fill('压测团队');
  await page.getByRole('button',{name:'建立空间并开始'}).click();
  await page.getByRole('button',{name:/我的数字分身/}).click();
  await page.getByRole('button',{name:'03成长档案'}).click();
  await page.getByRole('button',{name:'建立我的专家身份'}).click();
  await page.getByLabel('姓名',{exact:true}).fill('周明');
  await page.getByLabel('岗位与专长').fill('稳定性工程师');
  await page.getByLabel('允许数字员工学习的范围').fill('脱敏压测复盘与性能异常诊断');
  await page.getByRole('button',{name:'确认并继续'}).click();
  await page.getByRole('button',{name:'创建我的数字分身',exact:true}).click();
  await page.getByLabel('数字员工姓名').fill('晓禾');
  await page.getByLabel('岗位目标').fill('压测异常诊断');
  await page.getByRole('button',{name:'确认并继续'}).click();
  await page.getByRole('button',{name:'02学习空间'}).click();
  for(const title of ['长稳压测诊断','连接池分析']){
   await page.getByRole('button',{name:'记录工作经验'}).click();
   await page.getByLabel('这段经验是什么').fill(title);
   await page.getByLabel('已有工作来源').fill('脱敏复盘文档');
   await page.getByLabel('已经发生的工作过程').fill(`${title}：先确认指标基线，再检查异常时间线及变更证据。`);
   await page.getByRole('button',{name:'确认并继续'}).click();
   await page.getByRole('button',{name:new RegExp(`${title}.*等待专家回答`)}).waitFor();
  }
  await page.getByRole('button',{name:/连接池分析.*等待专家回答/}).click();
  await page.locator('.lesson-source h2').filter({hasText:'连接池分析'}).waitFor();
  const secondRecordUrl=page.url();
  if(!secondRecordUrl.includes('/me/learning/LEARN-'))throw Error('学习记录没有对象级地址');
  await page.reload();
  await page.locator('.lesson-source h2').filter({hasText:'连接池分析'}).waitFor();
  await page.getByRole('button',{name:/长稳压测诊断.*等待专家回答/}).click();
  await page.locator('.lesson-source h2').filter({hasText:'长稳压测诊断'}).waitFor();
  await page.goBack();
  await page.locator('.lesson-source h2').filter({hasText:'连接池分析'}).waitFor();
  if(page.url()!==secondRecordUrl)throw Error('返回未恢复对象地址');
  await page.getByLabel('只回答它真正不懂的地方').fill('涉及生产变更或证据冲突时暂停并请真人确认。');
  await page.getByRole('button',{name:'回答并继续'}).click();
  await page.getByLabel('数字员工复述的方法').fill('确认指标基线，检查异常时间线，再核对变更证据。');
  await page.getByLabel('适用边界与必须找人的情况').fill('生产变更或证据冲突时必须暂停并请真人确认。');
  await page.getByRole('button',{name:'确认方法，交给运营考核'}).click();
  await page.getByRole('button',{name:'03成长档案'}).click();
  await page.getByRole('button',{name:'连接池分析 · 查看证据'}).click();
  await page.getByText('查看来源原文',{exact:true}).click();
  await page.getByRole('heading',{name:'真人确认的方法'}).waitFor();
  await page.getByText('脱敏复盘文档',{exact:false}).last().waitFor();
  await page.screenshot({path:path.join(out,'capability-evidence-desktop.png'),fullPage:true});
  await page.setViewportSize({width:375,height:812});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('证据页移动端溢出');
  await page.screenshot({path:path.join(out,'capability-evidence-mobile.png'),fullPage:true});
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'02学习空间'}).click();
  await page.getByRole('button',{name:'已确认',exact:true}).click();
  await page.locator('.lesson-source h2').filter({hasText:'连接池分析'}).waitFor();
  await page.getByRole('button',{name:'需要我处理',exact:true}).click();
  await page.locator('.lesson-source h2').filter({hasText:'长稳压测诊断'}).waitFor();
  await page.screenshot({path:path.join(out,'learning-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'切换产品'}).click();
  await page.getByRole('button',{name:/数字员工运营台/}).click();
  await page.getByRole('heading',{name:'运营总览',exact:true}).waitFor();
  if(await page.getByRole('button',{name:'开始培养员工'}).count())throw Error('运营端仍存在教学入口');
  await page.getByText('连接池分析',{exact:true}).waitFor();
  await page.screenshot({path:path.join(out,'operations-desktop.png'),fullPage:true});
  for(const [width,height] of [[1024,768],[768,1024],[375,812]]){
   await page.setViewportSize({width,height});
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(`溢出 ${width}`);
   await page.screenshot({path:path.join(out,`operations-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'切换产品'}).click();
  await page.getByRole('button',{name:/我的数字分身/}).click();
  await page.getByRole('button',{name:'02学习空间'}).click();
  await page.getByRole('button',{name:'导入已有资料'}).click();
  await page.getByLabel('已有资料文件').setInputFiles({
   name:'已有压测复盘.md',mimeType:'text/markdown',
   buffer:Buffer.from('先检查压测基线和监控证据，确认异常后暂停并找真人。\nApiKey=not-a-real-secret'),
  });
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'导入并生成学习草稿'}).click();
  await page.getByRole('button',{name:/已有压测复盘.*等待专家回答/}).click();
  await page.locator('.lesson-source h2').filter({hasText:'已有压测复盘'}).waitFor();
  if((await page.locator('.lesson-source').innerText()).includes('not-a-real-secret'))throw Error('未脱敏');
  await page.screenshot({path:path.join(out,'material-import-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'撤回授权',exact:true}).click();
  await page.getByRole('button',{name:'确认撤回授权'}).click();
  await page.getByText('授权已撤回 · 正文不再展示').waitFor();
  if((await page.locator('.lesson-source').innerText()).includes('先检查压测基线'))throw Error('撤回正文仍可见');
  await page.getByRole('button',{name:'切换产品'}).click();
  await page.getByRole('button',{name:/数字员工运营台/}).click();
  for(const title of ['压测任务甲','压测任务乙']){
   const response=await page.request.post(`${base}/api/v2/tasks`,{data:{
    title,goal:'验证多任务精准导航，不执行真实压测',expected_output:'诊断报告',
    required_capabilities:['待验证的压测能力'],
   }});
   if(!response.ok())throw Error('测试任务创建失败');
  }
  await page.getByRole('button',{name:'03任务运营'}).click();
  await page.reload();
  await page.getByRole('button',{name:/压测任务乙.*员工评估中/}).click();
  await page.locator('.workroom>header h2').filter({hasText:'压测任务乙'}).waitFor();
  const secondTaskUrl=page.url();
  await page.reload();
  await page.locator('.workroom>header h2').filter({hasText:'压测任务乙'}).waitFor();
  if(!secondTaskUrl.includes('/ops/tasks/TASK-'))throw Error('任务没有对象级地址');
  await page.getByRole('button',{name:/压测任务甲.*员工评估中/}).click();
  await page.goBack();
  await page.locator('.workroom>header h2').filter({hasText:'压测任务乙'}).waitFor();
  const workspace=await (await page.request.get(`${base}/api/v2/workspace?portal=operations`)).json();
  const cap=workspace.capabilities.find(c=>c.name==='连接池分析');
  const trial=await (await page.request.post(`${base}/api/v2/capabilities/${cap.id}/trial`,{data:{}})).json();
  const graded=await page.request.post(`${base}/api/v2/trials/${trial.id}/submit`,{data:{
   response:'确认指标基线，检查异常时间线，再核对变更证据。涉及生产变更或证据冲突时必须暂停并请真人确认。',
  }});
  if(!graded.ok())throw Error('测试资格准备失败');
  const task=await (await page.request.post(`${base}/api/v2/tasks`,{data:{
   title:'贡献回流任务',goal:'用连接池分析形成有依据的结论',expected_output:'分析报告',
   required_capabilities:['连接池分析'],
  }})).json();
  await page.request.post(`${base}/api/v2/tasks/${task.id}/claim`,{data:{twin_id:cap.twin_id}});
  await page.goto(`${base}/ops/tasks/${task.id}`);
  await page.getByRole('button',{name:'提交成果',exact:true}).click();
  await page.getByLabel('成果名称').fill('连接池诊断报告');
  await page.getByLabel('成果内容',{exact:true}).fill('已比较连接池基线与异常时段，结论有监控记录支撑。');
  await page.getByLabel('成果证据（每行一项，顺序编号从 1 开始）').fill('连接池指标时间线\n基线对比报告');
  await page.getByLabel('关联哪项能力').selectOption(cap.id);
  await page.getByLabel('这项能力实际贡献了什么').fill('完成连接池指标基线比较并定位异常时段');
  await page.getByLabel('引用上方证据编号').fill('1,2');
  await page.getByRole('button',{name:'确认并继续',exact:true}).click();
  await page.getByRole('button',{name:'验收通过',exact:true}).click();
  await page.getByLabel('验收说明').fill('贡献和指标依据完整，确认验收');
  await page.getByRole('button',{name:'确认验收，经验回流'}).click();
  await page.getByRole('button',{name:'02考核准入'}).click();
  await page.getByRole('button',{name:'连接池分析 · 查看证据'}).click();
  await page.getByText('实际贡献：完成连接池指标基线比较并定位异常时段').waitFor();
  await page.screenshot({path:path.join(out,'contribution-credit-desktop.png'),fullPage:true});
  if(errors.length)throw Error(errors.join('\n'));
  console.log(JSON.stringify({ok:true,flow:'UI 创建专家→分身→两条学习→选择→回答→确认→筛选→运营交接',screenshots:out}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
