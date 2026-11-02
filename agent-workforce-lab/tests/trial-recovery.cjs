const path = require('node:path');
const fs = require('node:fs');
const {chromium} = require('playwright');

const base = process.env.TARGET_URL || 'http://127.0.0.1:43222';
const out = process.env.PW_ARTIFACT_DIR ||
  path.join(process.cwd(), 'design', 'review', 'product-v2', 'trial-recovery');
fs.mkdirSync(out, {recursive: true});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const browser = await chromium.launch({headless: true});
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
  const page = await context.newPage();
  const errors = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', error => errors.push(`page: ${error.message}`));

  const post = async (route, data = {}) => {
    const response = await context.request.post(`${base}/api${route}`, {data});
    if (!response.ok()) throw new Error(`${route}: ${response.status()} ${await response.text()}`);
    return response.json();
  };

  try {
    const stamp = Date.now();
    await page.goto(base);
    await page.getByLabel('你的姓名').fill('考试闭环验收');
    await page.getByLabel('工作邮箱').fill(`trial-${stamp}@example.com`);
    await page.getByLabel('密码').fill('product123');
    await page.getByRole('button', {name: '继续进入产品'}).click();
    await page.getByLabel('团队或组织名称').fill('组织级运营验收团队');
    await page.getByRole('button', {name: '建立空间并开始'}).click();
    await page.getByRole('heading', {name: '选择工作空间'}).waitFor();

    const expert = await post('/v2/experts', {
      name: '压测专家',
      role: '稳定性工程师',
      knowledge_scope: '长稳压测异常判断',
    });
    const twin = await post('/v2/twins', {
      name: '晓禾',
      role_goal: '处理长稳压测问题',
      expert_id: expert.id,
    });
    const learning = await post('/v2/learning', {
      expert_id: expert.id,
      twin_id: twin.id,
      title: '长稳压测判断',
      work_record: '先核对目标和证据，再判断异常；超出授权范围时找真人。',
      source_label: '脱敏压测复盘',
    });
    await post(`/v2/learning/${learning.id}/clarify`, {
      answer: '证据冲突、生产风险不明或需要执行变更时找真人。',
    });
    const confirmation = await post(`/v2/learning/${learning.id}/confirm`, {
      method: '核对目标、基线与监控证据后再判断。',
      boundary: '证据冲突或需要生产变更时停止并升级真人。',
    });
    const firstTrial = await post(`/v2/capabilities/${confirmation.capability.id}/trial`);
    await post(`/v2/trials/${firstTrial.id}/submit`, {response: '我会立刻直接处理这个问题，不需要查看其他信息。'});

    await page.goto(`${base}/ops/workers`);
    await page.getByRole('heading', {name: /考核与准入 · 1 位数字员工/}).waitFor();
    await page.getByText('组织员工池', {exact: true}).waitFor();
    await page.getByText('第 1 次考试反馈').waitFor();
    await page.getByRole('button', {name: '退回补学'}).waitFor();
    await page.screenshot({path: path.join(out, '01-organization-pool-failed-trial.png'), fullPage: true});
    assert(await page.getByText(/当前组织权限范围内的全部数字员工/).count() === 1, '运营端未表达组织级管理范围');

    await page.getByRole('button', {name: '退回补学'}).click();
    await page.getByText('已退回员工端补学').waitFor();
    await page.goto(`${base}/me/learning/${learning.id}`);
    await page.getByRole('heading', {name: '确认分身复述的方法'}).waitFor();
    await page.getByRole('button', {name: '确认修订，重新进入运营考核'}).click();
    await page.getByText('修订已确认，运营可以安排新一轮考试').waitFor();

    await page.goto(`${base}/ops/workers/${twin.id}`);
    await page.getByRole('button', {name: '安排下一轮考试'}).click();
    await page.getByText('新一轮考试已生成').waitFor();
    await page.getByRole('button', {name: '执行考试'}).waitFor();
    await page.getByText('第 2 次').waitFor();
    await page.screenshot({path: path.join(out, '02-second-trial-ready.png'), fullPage: true});

    const workspace = await context.request.get(`${base}/api/v2/workspace?portal=operations`);
    const data = await workspace.json();
    const attempts = data.trials.filter(trial => trial.capability_id === confirmation.capability.id);
    assert(attempts.length === 2, '补学后没有生成独立的第二次考试记录');
    assert(attempts[0].status === 'failed' && attempts[1].status === 'open', '考试历史或新考试状态错误');
    assert(errors.length === 0, `浏览器错误:\n${errors.join('\n')}`);
    console.log(JSON.stringify({ok: true, attempts: attempts.map(x => x.status), screenshots: out}));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
