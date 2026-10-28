const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const root = '/Users/bytedance/Desktop/agi/agent-workforce-lab/design/v4';
const round = Number(process.env.REVIEW_ROUND || 1);
const phase = process.env.REVIEW_PHASE || 'before';
const target = 'http://127.0.0.1:43220';
async function create(page) {
  await page.getByLabel('你想教它什么工作？').fill('客服经验与知识写作');
  await page.getByRole('button', {name:'创建我的数字员工 →'}).click();
}
async function lesson(page) {
  await page.getByLabel('教它一段经验，或示范你的工作').fill('先记录客户诉求与依据；政策不明确时升级给真人，不承诺退款或时效。');
  await page.getByRole('button', {name:'教给晓禾 →'}).click();
}
async function confirm(page) {
  await page.getByLabel('适用条件与红线').fill('仅用于内部客服；信息不足找真人，不自动承诺退款。');
  await page.getByRole('button', {name:'确认理解，进入练习 →'}).click();
}
async function graduate(page) {
  await page.getByRole('button',{name:'开始场景考试'}).click();
  await page.getByLabel('整理已知信息，缺少依据先向真人澄清').check();
  await page.getByLabel('已检查答法与边界，没有越权承诺').check();
  await page.getByRole('button',{name:'确认样例考试',exact:true}).click();
  await page.getByRole('button',{name:'完成一个试岗小任务'}).click();
  await page.getByLabel('已检查成果能应用知识，可尝试对应任务').check();
  await page.getByRole('button',{name:'确认试岗成果'}).click();
}
async function publish(page) {
  await page.getByRole('button',{name:'发布一项任务',exact:true}).click();
  await page.getByLabel('希望完成什么？').fill('分析北区客户反馈，提出知识库改进方案');
  await page.getByLabel('希望拿到什么成果？').fill('反馈分类、改进建议和风险清单');
  await page.getByRole('button',{name:'检查并发布任务 →'}).click();
  await page.getByLabel('我确认资料有权处理，成果由真人检查').check();
  await page.getByRole('button',{name:'确认发布',exact:true}).click();
}
async function prepare(page) {
  await page.goto(target);
  if(round>=3) await create(page);
  if(round>=5) await lesson(page);
  if(round>=6) await confirm(page);
  if(round===6) await page.getByRole('button',{name:'开始场景考试'}).click();
  if(round>=7) await graduate(page);
  if(round===7) await page.getByRole('button',{name:'发布一项任务',exact:true}).click();
  if(round>=8) {
    await publish(page);
    await page.getByRole('button',{name:'观察执行中的求助'}).click();
    await page.getByRole('button',{name:'观察第 3 人加入'}).click();
  }
  if(round>=9) await page.getByRole('button',{name:'检查并提交成果'}).click();
}
(async()=>{
  const browser=await chromium.launch({headless:false});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.emulateMedia({reducedMotion:'reduce'});
    await prepare(page);
    const dir=path.join(root,'evidence',`round-${String(round).padStart(2,'0')}`);
    fs.mkdirSync(dir,{recursive:true});
    await page.screenshot({path:path.join(dir,`${phase}.png`),fullPage:true});
    if(round===10){
      for(const [width,height] of [[1024,768],[768,1024],[375,812]]){
        await page.setViewportSize({width,height});
        if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(`Overflow ${width}`);
        await page.screenshot({path:path.join(dir,`${phase}-${width}.png`),fullPage:true});
      }
    }
    if(errors.length)throw Error(errors.join(';'));
    console.log(`Round ${round} ${phase}: screenshot captured, no script errors`);
  }finally{await browser.close()}
})();
