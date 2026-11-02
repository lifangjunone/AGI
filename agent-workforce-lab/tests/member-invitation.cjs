const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.TARGET_URL||'http://127.0.0.1:43222';
const out=path.resolve(__dirname,'../design/review/member-invitation');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:false});
 const errors=[];
 try{
  const ownerContext=await browser.newContext({viewport:{width:1440,height:900}});
  const employeeContext=await browser.newContext({viewport:{width:1440,height:900}});
  const owner=await ownerContext.newPage(),employee=await employeeContext.newPage();
  for(const p of [owner,employee])p.on('pageerror',e=>errors.push(e.message));
  const suffix=Date.now();
  const register=async(p,name,email)=>{
   await p.getByLabel('你的姓名').fill(name);
   await p.getByLabel('工作邮箱').fill(email);
   await p.getByLabel('密码').fill('product123');
   await p.getByRole('button',{name:'继续进入产品'}).click();
  };
  await owner.goto(base);
  await register(owner,'团队负责人',`owner-${suffix}@example.com`);
  await owner.getByLabel('团队或组织名称').fill('共同的压测团队');
  await owner.getByRole('button',{name:'建立空间并开始'}).click();
  await owner.getByRole('button',{name:/数字员工运营台/}).click();
  await owner.getByRole('button',{name:'团队成员',exact:true}).click();
  await owner.getByLabel('受邀邮箱').fill(`member-${suffix}@example.com`);
  await owner.getByRole('button',{name:'生成邀请链接'}).click();
  const link=await owner.getByLabel('邀请链接（仅本次显示，7 天有效）').inputValue();
  if(!link.includes('/join#invite='))throw Error('未生成邀请链接');
  // Do not capture a live bearer token in screenshots.
  await owner.getByRole('button',{name:'关闭弹窗',exact:true}).click();
  await owner.getByRole('button',{name:'团队成员',exact:true}).click();
  await owner.getByText(`member-${suffix}@example.com`,{exact:true}).waitFor();
  await owner.screenshot({path:path.join(out,'pending-desktop.png'),fullPage:true});
  await employee.goto(link);
  await register(employee,'真实员工',`member-${suffix}@example.com`);
  await employee.getByRole('heading',{name:'共同的压测团队',exact:true}).waitFor();
  await employee.screenshot({path:path.join(out,'accept-desktop.png'),fullPage:true});
  await employee.getByRole('button',{name:'接受邀请并进入我的分身'}).click();
  await employee.waitForURL('**/me');
  await employee.getByRole('button',{name:'切换产品'}).click();
  const ops=employee.getByRole('button',{name:/数字员工运营台/});
  if(!await ops.isDisabled())throw Error('普通员工不应能进入运营台');
  await employee.screenshot({path:path.join(out,'employee-restricted-desktop.png'),fullPage:true});
  await owner.getByRole('button',{name:'关闭弹窗',exact:true}).click();
  await owner.getByRole('button',{name:'团队成员',exact:true}).click();
  await owner.getByText('真实员工',{exact:true}).waitFor();
  await owner.getByLabel('真实员工的角色').selectOption('operator');
  await employee.reload();
  await employee.getByRole('button',{name:/数字员工运营台/}).click();
  await employee.getByRole('heading',{name:'运营总览',exact:true}).waitFor();
  if(await employee.getByRole('button',{name:'团队成员',exact:true}).count())throw Error('运营不能授予成员权限');
  for(const [width,height] of [[1024,768],[768,1024],[375,812]]){
   await owner.setViewportSize({width,height});
   if(await owner.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(`溢出 ${width}`);
   await owner.screenshot({path:path.join(out,`members-${width}.png`),fullPage:true});
  }
  if(errors.length)throw Error(errors.join('\n'));
  console.log(JSON.stringify({ok:true,flow:'负责人生成邀请→新账号注册→确认加入→员工限制→授予运营→运营入口',screenshots:out}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
