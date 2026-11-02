const path = require('node:path');
const fs = require('node:fs');
const {chromium} = require('playwright');

const base = process.env.TARGET_URL || 'http://127.0.0.1:43222';
const out = process.env.PW_ARTIFACT_DIR ||
  path.join(process.cwd(), 'design', 'review', 'product-v2', 'round-1');
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

  const api = async (route, data) => {
    const response = await context.request.post(`${base}/api${route}`, {data});
    if (!response.ok()) throw new Error(`${route}: ${response.status()} ${await response.text()}`);
    return response.json();
  };

  try {
    await page.goto(base);
    await page.getByLabel('你的姓名').fill('产品验收用户');
    await page.getByLabel('工作邮箱').fill(`review-${Date.now()}@example.com`);
    await page.getByLabel('密码').fill('product123');
    await page.getByRole('button', {name: '继续进入产品'}).click();
    await page.getByRole('heading', {name: /从一位真实专家/}).waitFor();
    await page.getByLabel('团队或组织名称').fill('稳定性工程团队');
    await page.getByRole('button', {name: '建立空间并开始'}).click();
    await page.getByRole('heading', {name: '选择工作空间'}).waitFor();
    await page.getByRole('button', {name: /我的数字分身/}).click();
    await page.getByRole('heading', {name: /让你的经验，长成一个真正能独立工作的数字分身/}).waitFor();
    await page.screenshot({path: path.join(out, '00-product-gate-desktop.png'), fullPage: true});
    assert(await page.getByRole('button', {name: '发布一个任务'}).count() === 0, '员工端不应显示任务发布');
    await page.screenshot({path: path.join(out, '01-employee-home-desktop.png'), fullPage: true});
    await page.getByRole('button', {name: '切换产品'}).click();
    await page.getByRole('button', {name: /数字员工运营台/}).click();
    await page.getByRole('heading', {name: '运营总览'}).waitFor();
    assert(await page.getByRole('button', {name: /记录工作经验/}).count() === 0, '运营首页不应显示教学录入');

    const expert = await api('/v2/experts', {
      name: '真实专家周明',
      role: '稳定性工程师',
      knowledge_scope: '产品压测、异常判断与升级边界',
    });
    const twin = await api('/v2/twins', {
      name: '晓禾',
      role_goal: '独立处理产品压测并在越界时主动求助',
      expert_id: expert.id,
    });
    const learning = await api('/v2/learning', {
      expert_id: expert.id,
      twin_id: twin.id,
      title: '长稳压测诊断',
      work_record: '先确认压测目标和基线，再检查监控证据，发现异常时定位变化点。',
      source_label: '已脱敏 Oncall 压测复盘',
    });
    await page.reload();
    await page.getByRole('button', {name: '切换产品'}).click();
    await page.getByRole('button', {name: /我的数字分身/}).click();
    await page.getByRole('button', {name: /学习空间/}).click();
    await page.getByText('晓禾 的理解').waitFor();
    await page.screenshot({path: path.join(out, '02-learning-question-desktop.png'), fullPage: true});

    await api(`/v2/learning/${learning.id}/clarify`, {
      answer: '生产风险不明、证据冲突或需要变更服务时必须暂停并找真人。',
    });
    const confirmation = await api(`/v2/learning/${learning.id}/confirm`, {
      method: '确认目标与基线，检查监控证据，再根据变化点定位问题。',
      boundary: '生产风险不明、证据冲突或需要执行变更时暂停并找真人。',
    });
    const trial = await api(`/v2/capabilities/${confirmation.capability.id}/trial`, {});
    await api(`/v2/trials/${trial.id}/submit`, {
      response: '我会先检查目标、基线和监控证据，确认来源后再判断。如果证据冲突或生产风险不确定，我会暂停执行并请求真人升级处理。',
    });
    const twin2 = await api('/v2/twins', {
      name: '林峥', role_goal: '数据库性能分析协作员工', expert_id: expert.id,
    });
    const twin3 = await api('/v2/twins', {
      name: '安澜', role_goal: '业务流量基线分析协作员工', expert_id: expert.id,
    });
    const task = await api('/v2/tasks', {
      title: '完成 48 小时长稳压测',
      goal: '找到性能退化点并给出可复查结论',
      expected_output: '压测报告、风险结论和证据清单',
      required_capabilities: ['长稳压测诊断'],
    });
    await api(`/v2/tasks/${task.id}/claim`, {twin_id: twin.id});
    await api(`/v2/tasks/${task.id}/updates`, {
      twin_id: twin.id,
      kind: 'help',
      summary: '连接池指标出现异常，需要数据库侧协作判断。',
      missing_capability: '数据库连接池分析',
    });
    await api(`/v2/tasks/${task.id}/invite`, {
      twin_id: twin2.id, reason: '补充数据库连接池分析',
    });
    await api(`/v2/tasks/${task.id}/invite`, {
      twin_id: twin3.id, reason: '补充业务流量基线判断',
    });

    await page.reload();
    await page.getByRole('button', {name: '切换产品'}).click();
    await page.getByRole('button', {name: /数字员工运营台/}).click();
    await page.getByRole('button', {name: /运营总览/}).click();
    await page.getByText(/任务组/).last().waitFor();
    await page.screenshot({path: path.join(out, '03-team-home-desktop.png'), fullPage: true});
    await page.getByRole('button', {name: /任务运营/}).click();
    await page.getByText(/任务组 已成立/).waitFor();
    await page.screenshot({path: path.join(out, '04-task-team-desktop.png'), fullPage: true});

    const viewportWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert(viewportWidth <= 1440, `桌面端横向溢出: ${viewportWidth}`);

    await page.setViewportSize({width: 375, height: 812});
    await page.reload();
    await page.screenshot({path: path.join(out, '05-task-team-mobile.png'), fullPage: true});
    const mobileWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert(mobileWidth <= 375, `移动端横向溢出: ${mobileWidth}`);
    assert(errors.length === 0, `浏览器错误:\n${errors.join('\n')}`);
    console.log(JSON.stringify({ok: true, screenshots: out, consoleErrors: errors.length}));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
