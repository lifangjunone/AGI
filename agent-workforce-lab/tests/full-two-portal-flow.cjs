const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const base = process.env.TARGET_URL || 'http://127.0.0.1:43222';
const out = process.env.PW_ARTIFACT_DIR ||
  path.join(process.cwd(), 'design', 'review', 'product-v2', 'full-two-portal-flow');
fs.mkdirSync(out, {recursive: true});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitNotice(page, text) {
  try {
    await page.getByText(text, {exact: true}).waitFor({timeout: 3500});
  } catch {
    // Toast 仅停留 2.2 秒，业务完成状态由后续页面断言确认。
  }
}

async function fillModal(page, title, fields, submit = '确认并继续') {
  const dialog = page.getByRole('dialog', {name: title});
  await dialog.waitFor();
  for (const [label, value] of Object.entries(fields)) {
    await dialog.getByLabel(label).fill(value);
  }
  await dialog.getByRole('button', {name: submit}).click();
}

(async () => {
  const browser = await chromium.launch({headless: true});
  const employeeContext = await browser.newContext({viewport: {width: 1440, height: 900}});
  const operatorContext = await browser.newContext({viewport: {width: 1440, height: 900}});
  const employee = await employeeContext.newPage();
  const operator = await operatorContext.newPage();
  const errors = [];
  const failedResponses = [];
  for (const [name, page] of [['员工端', employee], ['运营端', operator]]) {
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`${name} console: ${message.text()}`);
    });
    page.on('pageerror', error => errors.push(`${name} page: ${error.message}`));
    page.on('response', response => {
      if (response.url().includes('/api/') && response.status() >= 400) {
        failedResponses.push(`${name} ${response.status()} ${response.request().method()} ${response.url()}`);
      }
    });
  }

  try {
    const stamp = Date.now();
    const employeeEmail = `employee-${stamp}@example.com`;
    const operatorEmail = `operator-${stamp}@example.com`;
    const password = 'product123';

    // 先注册独立运营账号，不创建自己的组织。
    await operator.goto(base);
    await operator.getByLabel('你的姓名').fill('运营验收员');
    await operator.getByLabel('工作邮箱').fill(operatorEmail);
    await operator.getByLabel('密码').fill(password);
    await operator.getByRole('button', {name: '继续进入产品'}).click();
    await operator.getByRole('heading', {name: /从一位真实专家/}).waitFor();

    // 员工创建组织、专家身份和数字分身。
    await employee.goto(base);
    await employee.getByLabel('你的姓名').fill('真实员工周明');
    await employee.getByLabel('工作邮箱').fill(employeeEmail);
    await employee.getByLabel('密码').fill(password);
    await employee.getByRole('button', {name: '继续进入产品'}).click();
    await employee.getByLabel('团队或组织名称').fill('完整流程验收团队');
    await employee.getByRole('button', {name: '建立空间并开始'}).click();
    await employee.getByRole('heading', {name: '选择工作空间'}).waitFor();
    await employee.getByRole('button', {name: /我的数字分身/}).click();
    await employee.getByRole('button', {name: /成长档案/}).click();
    await employee.getByRole('button', {name: '建立我的专家身份'}).click();
    await fillModal(employee, '添加真实专家', {
      '姓名': '周明',
      '岗位与专长': '稳定性工程专家',
      '允许数字员工学习的范围': 'AS 长稳压测、异常证据判断、风险止损与升级边界',
    });
    await waitNotice(employee, '真实专家已添加');
    await employee.getByRole('button', {name: '创建我的数字分身'}).click();
    await fillModal(employee, '创建数字员工', {
      '数字员工姓名': '晓禾',
      '岗位目标': '独立处理 AS 长稳压测，在风险不明确时主动升级真人',
    });
    await waitNotice(employee, '数字员工已创建');
    await employee.screenshot({path: path.join(out, '01-employee-twin-created.png'), fullPage: true});

    // 员工把已有工作经验教给分身，完成澄清和方法确认。
    await employee.getByRole('button', {name: /学习空间/}).click();
    await employee.getByRole('button', {name: '记录工作经验'}).click();
    await fillModal(employee, '记录一段真实工作', {
      '这段经验是什么': 'AS 48小时压测稳定性',
      '已有工作来源': '脱敏 Oncall 处理记录与复盘文档',
      '已经发生的工作过程': '先确认压测目标和历史基线，再检查监控证据与异常发生时间。证据冲突时不直接下结论，需要核对来源；涉及生产变更或风险不明确时必须暂停并升级真人。',
    });
    await waitNotice(employee, '学习记录已生成');
    await employee.getByLabel('只回答它真正不懂的地方').fill(
      '当监控证据冲突、生产风险不明确、需要执行服务变更或超出授权范围时，必须暂停并找真人确认。'
    );
    await employee.getByRole('button', {name: '回答并继续'}).click();
    await waitNotice(employee, '回答已记录');
    await employee.getByLabel('数字员工复述的方法').fill(
      '先确认压测目标和历史基线，再检查监控证据与异常时间，核对证据来源后再判断。'
    );
    await employee.getByLabel('适用边界与必须找人的情况').fill(
      '证据冲突、生产风险不明确、需要执行服务变更或超出授权范围时，暂停并升级真人。'
    );
    await employee.getByRole('button', {name: '确认方法，交给运营考核'}).click();
    await waitNotice(employee, '候选能力已进入运营考核队列');
    await employee.screenshot({path: path.join(out, '02-employee-learning-confirmed.png'), fullPage: true});

    // 负责人邀请专门运营人员加入组织。
    await employee.getByRole('button', {name: '切换产品'}).click();
    await employee.getByRole('button', {name: /数字员工运营台/}).click();
    await employee.getByRole('button', {name: '团队成员'}).click();
    const teamDialog = employee.getByRole('dialog', {name: '团队成员与邀请'});
    await teamDialog.getByLabel('受邀邮箱').fill(operatorEmail);
    await teamDialog.getByLabel('加入角色').selectOption('operator');
    await teamDialog.getByRole('button', {name: '生成邀请链接'}).click();
    const inviteUrl = await teamDialog.getByLabel(/邀请链接/).inputValue();
    assert(inviteUrl.includes('/join#invite='), '没有生成有效的运营人员邀请链接');

    // 运营人员接受邀请，并确认自己的员工端看不到他人的分身。
    await operator.goto(inviteUrl);
    await operator.getByRole('heading', {name: '加入团队'}).waitFor();
    await operator.getByText(/加入身份：运营人员 — 考核、发布与验收/).waitFor();
    await operator.getByRole('button', {name: '接受邀请并进入我的分身'}).click();
    await operator.getByRole('heading', {name: /让你的经验，长成一个真正能独立工作的数字分身/}).waitFor();
    assert(await operator.getByText('晓禾', {exact: true}).count() === 0, '运营人员在个人员工端看到了他人的分身');

    // 运营只安排并启动考试，答案由数字员工运行引擎生成。
    await operator.getByRole('button', {name: '切换产品'}).click();
    await operator.getByRole('button', {name: /数字员工运营台/}).click();
    await operator.getByRole('heading', {name: '运营总览'}).waitFor();
    await operator.getByText(/当前管理 1 位数字员工/).waitFor();
    await operator.getByRole('button', {name: /考核准入/}).click();
    await operator.getByRole('heading', {name: /考核与准入 · 1 位数字员工/}).waitFor();
    await operator.getByText('晓禾', {exact: true}).first().waitFor();
    await operator.getByRole('button', {name: '安排考试'}).click();
    await waitNotice(operator, '考试场景已生成，等待启动数字员工');
    await operator.getByRole('button', {name: '启动数字员工考试'}).click();
    await waitNotice(operator, '数字员工已独立完成考试');
    await operator.getByText('已验证能力', {exact: true}).waitFor();
    await operator.getByText('考试通过 · 已获得新手印记', {exact: true}).waitFor();
    await operator.getByText('查看数字员工运行依据', {exact: true}).click();
    await operator.getByText('local_rules_v1', {exact: true}).waitFor();
    await operator.screenshot({path: path.join(out, '03-operator-trial-passed.png'), fullPage: true});

    // 运营发布任务，员工端仍不出现组织任务。
    await operator.getByRole('button', {name: /任务运营/}).click();
    await operator.getByRole('button', {name: '发布新任务'}).click();
    await fillModal(operator, '发布新任务', {
      '任务名称': '完成 AS 48 小时长稳压测',
      '任务目标': '基于历史基线和监控证据定位性能退化点，输出可复查结论',
      '期望成果': '压测报告、风险结论和证据清单',
      '需要的能力（逗号分隔）': 'AS 48小时压测稳定性',
    });
    await waitNotice(operator, '任务已发布');
    await employee.goto(`${base}/me`);
    await employee.getByRole('heading', {name: /晓禾 的成长路线/}).waitFor();
    assert(await employee.getByText('完成 AS 48 小时长稳压测', {exact: true}).count() === 0,
      '员工端泄露了组织任务运营记录');

    // 运营只启动；数字员工自主认领、生成执行记录与成果草稿。
    await operator.getByText('完成 AS 48 小时长稳压测', {exact: true}).first().click();
    await operator.getByRole('button', {name: '启动数字员工'}).click();
    await waitNotice(operator, '数字员工已自主认领并提交成果草稿');
    await operator.getByText(/当前未连接实际业务系统/).waitFor();
    await operator.getByText('查看数字员工运行依据', {exact: true}).last().click();
    await operator.getByText(/不代表真实压测或变更已发生/).waitFor();
    await operator.getByRole('button', {name: '验收通过'}).click();
    await fillModal(operator, '验收成果', {
      '验收说明': '仅验收执行方案、引用和风险边界；未将其视为真实压测已经执行。',
    }, '确认验收，经验回流');
    await waitNotice(operator, '成果已验收');
    await operator.getByText('已验收', {exact: true}).first().waitFor();
    await operator.screenshot({path: path.join(out, '04-operator-task-accepted.png'), fullPage: true});

    // 最终数据一致性：能力保持合格、交付计数增长、任务完成。
    const workspaceResponse = await operatorContext.request.get(`${base}/api/v2/workspace?portal=operations`);
    assert(workspaceResponse.ok(), `运营工作区读取失败：${workspaceResponse.status()}`);
    const workspace = await workspaceResponse.json();
    const capability = workspace.capabilities.find(item => item.name === 'AS 48小时压测稳定性');
    const task = workspace.tasks.find(item => item.title === '完成 AS 48 小时长稳压测');
    const deliverable = workspace.deliverables.find(item => item.task_id === task?.id);
    assert(capability?.status === 'qualified', '最终能力状态不是 qualified');
    assert(capability?.accepted_count === 1, '验收后能力交付证据没有回流');
    assert(task?.status === 'completed', '任务验收后没有进入 completed');
    assert(deliverable?.status === 'accepted', '成果没有进入 accepted');
    assert(deliverable?.runtime?.external_execution === false, '成果错误声称已执行外部系统');
    assert(workspace.task_runs?.[0]?.engine === 'local_rules_v1', '没有保留数字员工运行引擎');
    assert(errors.length === 0, `浏览器运行错误：\n${errors.join('\n')}`);
    assert(failedResponses.length === 0, `流程中出现失败接口：\n${failedResponses.join('\n')}`);

    console.log(JSON.stringify({
      ok: true,
      employee: employeeEmail,
      operator: operatorEmail,
      result: {
        twin: '晓禾',
        capability: capability.status,
        accepted_count: capability.accepted_count,
        task: task.status,
        deliverable: deliverable.status,
      },
      screenshots: out,
    }, null, 2));
  } finally {
    await employeeContext.close();
    await operatorContext.close();
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
