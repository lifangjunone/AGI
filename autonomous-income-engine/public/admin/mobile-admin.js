(() => {
  const $ = (selector) => document.querySelector(selector);
  const login = $('[data-login]');
  const app = $('[data-app]');
  const loginMessage = $('[data-login-message]');
  const appMessage = $('[data-app-message]');
  let refreshTimer = null;
  let loginCompleted = false;
  let activeTab = 'orders';

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.error || '请求失败'), { status: response.status });
    return payload;
  }

  function timeLabel(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '';
  }

  function renderOrders(payload) {
    $('[data-pending]').textContent = payload.summary.pending;
    $('[data-paid]').textContent = payload.summary.paid;
    $('[data-revenue]').textContent = '¥' + payload.summary.revenue.toFixed(2);
    const visible = payload.orders.filter((order) => ['pending', 'paid'].includes(order.status));
    $('[data-orders]').replaceChildren(...(visible.length ? visible : [{ empty: true }]).map((order) => {
      if (order.empty) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = '暂时没有订单';
        return empty;
      }
      const card = document.createElement('article');
      card.className = 'order';
      const pending = order.status === 'pending';
      card.innerHTML = `
        <div class="order-top">
          <span class="amount">¥${Number(order.amount).toFixed(2)}</span>
          <span class="status ${pending ? '' : 'paid'}">${pending ? '待核对' : '已确认'}</span>
        </div>
        <strong>${order.productTitle || order.experimentId || '产品订单'}</strong>
        <div class="order-meta">${timeLabel(order.createdAt)} · ${pending ? Math.max(0, Math.ceil(order.expiresInSeconds / 60)) + ' 分钟后过期' : '确认于 ' + timeLabel(order.paidAt)}</div>
        ${pending ? '<button class="confirm" type="button">我已核对微信到账，确认交付</button>' : ''}
      `;
      const button = card.querySelector('.confirm');
      button?.addEventListener('click', async () => {
        if (!confirm(`确认微信已收到 ¥${Number(order.amount).toFixed(2)}？确认后买家将立即获得下载。`)) return;
        button.disabled = true;
        button.textContent = '正在确认…';
        try {
          await api(`../api/admin-mobile/orders/${encodeURIComponent(order.id)}/confirm`, { method: 'POST', body: '{}' });
          appMessage.textContent = `¥${Number(order.amount).toFixed(2)} 已确认，买家页面会自动解锁。`;
          await loadOrders();
        } catch (error) {
          appMessage.textContent = error.message;
          button.disabled = false;
          button.textContent = '我已核对微信到账，确认交付';
        }
      });
      return card;
    }));
  }

  async function loadOrders() {
    try {
      renderOrders(await api('../api/admin-mobile/orders'));
    } catch (error) {
      if (error.status === 401) showLogin();
      else appMessage.textContent = error.message;
    }
  }

  function renderActionTasks(payload) {
    $('[data-action-pending]').textContent = payload.summary.pending;
    $('[data-action-confirmed]').textContent = payload.summary.confirmed;
    const visible = payload.tasks.filter((task) => ['pending', 'owner-confirmed', 'expired'].includes(task.status));
    $('[data-action-tasks]').replaceChildren(...(visible.length ? visible : [{ empty: true }]).map((task) => {
      if (task.empty) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = '当前没有需要你处理的任务';
        return empty;
      }
      const card = document.createElement('article');
      card.className = 'action-task';
      const pending = task.status === 'pending';
      const confirmed = task.status === 'owner-confirmed';
      const loginTask = task.type === 'xiaohongshu-login';
      const migrationTask = task.type === 'merchant-payment-migration';
      card.innerHTML = `
        <div class="order-top">
          <strong>${task.title}</strong>
          <span class="status ${confirmed ? 'paid' : ''}">${pending ? (loginTask ? '待扫码' : '待办理') : confirmed ? '已确认' : '已过期'}</span>
        </div>
        <p>${task.message}</p>
        ${task.qrImageUrl && pending && loginTask ? `<img class="login-qr" src="${task.qrImageUrl}" alt="小红书登录二维码">` : ''}
        <div class="order-meta">创建于 ${timeLabel(task.createdAt)} · ${pending ? (loginTask ? '请在二维码过期前完成' : '完成商户实名认证和签约后，系统会验证官方回调') : confirmed ? '确认于 ' + timeLabel(task.confirmedAt) : '等待系统生成新二维码'}</div>
        ${pending && loginTask ? '<button class="confirm-login" type="button">我已完成扫码认证</button>' : ''}
        ${pending && migrationTask ? '<p class="disclosure">为防止伪造自动收款，只有官方支付回调通过小额真实订单验证后，系统才会关闭人工到账确认。</p>' : ''}
      `;
      card.querySelector('.confirm-login')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = '正在通知发布程序…';
        try {
          await api(`../api/admin-mobile/action-tasks/${encodeURIComponent(task.id)}/confirm`, {
            method: 'POST',
            body: '{}'
          });
          appMessage.textContent = '已收到你的确认。系统正在重新检查小红书登录状态，通过后会继续发布。';
          await loadActionTasks();
        } catch (error) {
          appMessage.textContent = error.message;
          button.disabled = false;
          button.textContent = '我已完成扫码认证';
        }
      });
      return card;
    }));
  }

  async function loadActionTasks() {
    try {
      renderActionTasks(await api('../api/admin-mobile/action-tasks'));
    } catch (error) {
      if (error.status === 401) showLogin();
      else appMessage.textContent = error.message;
    }
  }

  function copyText(value, message) {
    return navigator.clipboard.writeText(value).then(() => {
      appMessage.textContent = message;
    }).catch(() => {
      appMessage.textContent = '复制失败，请长按文字手动复制。';
    });
  }

  function promotionCopy(item) {
    return [
      item.title,
      '',
      item.opening,
      '',
      item.body,
      '',
      item.disclosure,
      '',
      item.hashtags,
      '',
      '免费试自己的图片：' + item.trackingUrl
    ].join('\n');
  }

  function renderPromotion(payload) {
    const promotion = payload.promotion;
    const funnel = promotion.funnel;
    $('[data-funnel]').replaceChildren(...[
      ['真人访问', funnel.visits],
      ['开始上传', funnel.uploads],
      ['生成成功', funnel.generated],
      ['创建订单', funnel.checkouts],
      ['真实付款', funnel.paid],
      ['完成下载', funnel.downloads]
    ].map(([label, value]) => {
      const card = document.createElement('article');
      card.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
      return card;
    }));
    $('[data-diagnosis]').innerHTML = `
      <strong>第 ${promotion.day} 天 · ${promotion.diagnosis.label}</strong>
      <p>${promotion.diagnosis.action}</p>
    `;
    $('[data-milestones]').replaceChildren(...promotion.milestones.map((item) => {
      const row = document.createElement('article');
      row.className = 'milestone' + (item.reached ? ' reached' : '');
      row.innerHTML = `<strong>${item.day} 天目标${item.reached ? ' ✓' : ''}</strong><span>${item.visits} 访问 · ${item.generated} 生成 · ${item.checkouts} 下单 · ${item.paid} 付款</span>`;
      return row;
    }));
    $('[data-xianyu]').innerHTML = `
      <strong>闲鱼入口：${promotion.xianyu.unlocked ? '已解锁' : '暂不启用'}</strong>
      <p>${promotion.xianyu.reason}（当前 ${promotion.xianyu.generatedCurrent}/${promotion.xianyu.generatedRequired}）</p>
    `;
    $('[data-boundaries]').replaceChildren(...promotion.boundaries.map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
    $('[data-promotion-packages]').replaceChildren(...promotion.packages.map((item) => {
      const card = document.createElement('article');
      card.className = 'promotion-package';
      card.innerHTML = `
        <div class="package-top">
          <span class="package-badge ${item.status === 'published' ? 'published' : ''}">${item.label}</span>
          <span class="package-badge ${item.status === 'published' ? 'published' : ''}">${item.status === 'published' ? '已发布' : '待审核'}</span>
        </div>
        <h3>${item.title}</h3>
        <p><strong>封面：</strong>${item.demo}处理前 / 四平台处理后</p>
        <p><strong>15 秒录屏：</strong>${item.visual.storyboard.join(' → ')}</p>
        <p>${item.opening}</p>
        <p>${item.body}</p>
        <p class="disclosure">${item.disclosure}</p>
        <p>${item.hashtags}</p>
        <p class="tracking-link">${item.trackingUrl}</p>
        <div class="package-actions">
          <button type="button" class="copy">复制发布包</button>
          <button type="button" class="secondary publish" ${item.status === 'published' ? 'disabled' : ''}>${item.status === 'published' ? '已确认发布' : '标记已发布'}</button>
        </div>
      `;
      card.querySelector('.copy').addEventListener('click', () => copyText(promotionCopy(item), `${item.label}发布包已复制。`));
      card.querySelector('.publish').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = '正在保存…';
        try {
          const result = await api(`../api/admin-mobile/promotion-packages/${encodeURIComponent(item.id)}/published`, {
            method: 'POST',
            body: JSON.stringify({})
          });
          renderPromotion(result);
          appMessage.textContent = `${item.label}已记录为发布。后续访问会通过独立链接归因。`;
        } catch (error) {
          appMessage.textContent = error.message;
          button.disabled = false;
          button.textContent = '标记已发布';
        }
      });
      return card;
    }));
  }

  async function loadPromotion() {
    try {
      renderPromotion(await api('../api/admin-mobile/promotion-center'));
    } catch (error) {
      if (error.status === 401) showLogin();
      else appMessage.textContent = error.message;
    }
  }

  function renderBusiness(payload) {
    const business = payload.business;
    $('[data-business-mode]').innerHTML = `
      <strong>${business.operatingMode}</strong>
      <p>${business.fullyAutonomous ? '当前已满足全链路无人运行条件。' : business.autonomyBlockers.join('；')}</p>
    `;
    const totals = business.products.reduce((sum, product) => ({
      visits: sum.visits + Number(product.funnel.visits || 0),
      completed: sum.completed + Number(product.funnel.completed || 0),
      checkouts: sum.checkouts + Number(product.funnel.checkouts || 0),
      paid: sum.paid + Number(product.funnel.paid || 0),
      revenue: sum.revenue + Number(product.funnel.revenue || 0)
    }), { visits: 0, completed: 0, checkouts: 0, paid: 0, revenue: 0 });
    $('[data-business-summary]').replaceChildren(...[
      ['有效访问', totals.visits],
      ['完成结果', totals.completed],
      ['创建订单', totals.checkouts],
      ['真实付款', totals.paid],
      ['收入', '¥' + totals.revenue.toFixed(2)]
    ].map(([label, value]) => {
      const card = document.createElement('article');
      card.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
      return card;
    }));
    const xhs = business.channelHealth.xiaohongshu;
    $('[data-channel-health]').innerHTML = `
      <h3>渠道健康</h3>
      <p><strong>小红书：${xhs.state}</strong> · 已排期 ${xhs.scheduled} · 已发布 ${xhs.published} · 异常 ${xhs.failed}</p>
      <p>不可用时自动降级到自有站和搜索入口，不重复提交未知结果。</p>
    `;
    const migration = business.paymentMigration;
    $('[data-payment-migration]').innerHTML = `
      <h3>支付自动化</h3>
      <p><strong>${migration.status === 'action-required' ? '达到迁移门槛' : '个人微信确认阶段'}</strong></p>
      <p>本月真实付款 ${migration.monthlyPaidOrders}/${migration.threshold}；${migration.remaining ? `还差 ${migration.remaining} 单触发官方商户支付迁移。` : '请在待处理页完成一次性商户签约。'}</p>
    `;
    $('[data-lifecycle]').innerHTML = `<h3>产品生命周期</h3>` + business.products.map((product) => `
      <article class="business-row">
        <div><strong>${product.title}</strong><span>${product.lifecycle} · ${product.lifecycleReason}</span></div>
        <b>${product.rank ? 'TOP ' + product.rank : product.quality.score + '分'}</b>
      </article>
    `).join('');
    const latest = business.evolutionDecisions.latest.slice(-5).reverse();
    $('[data-decisions]').innerHTML = `<h3>最近自动决策</h3>` + (latest.length ? latest.map((item) => `
      <article class="business-row"><div><strong>${item.day} · ${item.decision}</strong><span>${item.reason}</span></div><b>${item.variant}</b></article>
    `).join('') : '<p>等待第一轮有效数据后生成决策。</p>');
  }

  async function loadBusiness() {
    try {
      renderBusiness(await api('../api/admin-mobile/business-state'));
    } catch (error) {
      if (error.status === 401) showLogin();
      else appMessage.textContent = error.message;
    }
  }

  function renderMatrix(payload) {
    const matrix = payload.matrix;
    $('[data-matrix-summary]').replaceChildren(...[
      ['可用产品', matrix.readyCount],
      ['公开实验', matrix.visibleCount],
      ['榜单类型', matrix.rankingKind]
    ].map(([label, value]) => {
      const card = document.createElement('article');
      card.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
      return card;
    }));
    $('[data-matrix-products]').replaceChildren(...matrix.products.map((item) => {
      const card = document.createElement('article');
      card.className = 'matrix-admin-product';
      card.innerHTML = `
        <div class="matrix-rank-row">
          <span class="matrix-rank-badge">${item.rank ? 'TOP ' + item.rank : item.status === 'building' ? '构建中' : '候选'}</span>
          <span>${item.rankLabel}</span>
        </div>
        <h3>${item.title}</h3>
        <p>${item.promise}</p>
        <div class="matrix-admin-metrics">
          <span><strong>${item.funnel.visits}</strong>真人访问</span>
          <span><strong>${item.funnel.completed}</strong>完成结果</span>
          <span><strong>${item.funnel.checkouts}</strong>创建订单</span>
          <span><strong>${item.funnel.paid}</strong>确认付款</span>
        </div>
        <p><strong>得分 ${item.score}</strong> · 付款 ${item.funnel.paid}×${matrix.weights.paid} + 下单 ${item.funnel.checkouts}×${matrix.weights.checkout} + 完成 ${item.funnel.completed}×${matrix.weights.completed} + 开始 ${item.funnel.started}×${matrix.weights.started} + 访问 ${item.funnel.visits}×${matrix.weights.qualifiedVisit}</p>
        <div class="acquisition-campaigns"></div>
        ${item.campaignUrl ? `<p class="matrix-link">${item.campaignUrl}</p><button type="button" class="copy-link">复制独立推广链接</button>` : '<p>工具完成并通过验收后，才会生成推广和付款入口。</p>'}
      `;
      const acquisition = card.querySelector('.acquisition-campaigns');
      for (const campaign of item.acquisition?.campaigns || []) {
        const detail = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = `${campaign.campaign} · 访问 ${campaign.funnel.visits} / 开始 ${campaign.funnel.started} / 完成 ${campaign.funnel.completed} / 下单 ${campaign.funnel.checkouts} / 付款 ${campaign.funnel.paid}`;
        const action = document.createElement('p');
        action.textContent = `${campaign.sampleEnough ? '' : '样本不足，暂不下结论。'}${campaign.action}`;
        detail.append(summary, action);
        acquisition.append(detail);
      }
      card.querySelector('.copy-link')?.addEventListener('click', () => copyText(item.campaignUrl, `${item.shortTitle || item.title}推广链接已复制。`));
      return card;
    }));
    $('[data-ranking-rule]').innerHTML = `<h3>榜单规则</h3><p>${matrix.rankingNote}</p>${matrix.nextCandidate ? `<p>下一候选：第 ${matrix.nextCandidate.activationDay} 天公开「${matrix.nextCandidate.title}」；未完成工具时只展示构建状态。</p>` : ''}`;
  }

  async function loadMatrix() {
    try {
      renderMatrix(await api('../api/admin-mobile/product-matrix'));
    } catch (error) {
      if (error.status === 401) showLogin();
      else appMessage.textContent = error.message;
    }
  }

  function selectTab(tab) {
    activeTab = tab;
    document.querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
    $('[data-orders-page]').hidden = tab !== 'orders';
    $('[data-actions-page]').hidden = tab !== 'actions';
    $('[data-matrix-page]').hidden = tab !== 'matrix';
    $('[data-promotion-page]').hidden = tab !== 'promotion';
    $('[data-page-title]').textContent = tab === 'orders' ? '待确认收款' : tab === 'actions' ? '待处理任务' : tab === 'matrix' ? '产品榜' : '推广中心';
    if (tab === 'actions') loadActionTasks();
    if (tab === 'matrix') loadMatrix();
    if (tab === 'promotion') loadBusiness();
  }

  function showLogin() {
    if (loginCompleted) return;
    login.hidden = false;
    app.hidden = true;
    if (refreshTimer) clearInterval(refreshTimer);
  }

  function showApp() {
    login.hidden = true;
    app.hidden = false;
    loadOrders();
    const requested = location.hash === '#actions' ? 'actions' : activeTab;
    selectTab(requested);
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      loadOrders();
      if (activeTab === 'actions') loadActionTasks();
    }, 5000);
  }

  $('[data-login-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    button.disabled = true;
    loginMessage.textContent = '正在登录…';
    try {
      await api('../api/admin-mobile/login', {
        method: 'POST',
        body: JSON.stringify({ password: form.password.value })
      });
      await api('../api/admin-mobile/session');
      loginCompleted = true;
      form.reset();
      loginMessage.textContent = '';
      showApp();
    } catch (error) {
      loginMessage.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  $('[data-logout]').addEventListener('click', async () => {
    await api('../api/admin-mobile/logout', { method: 'POST', body: '{}' }).catch(() => {});
    loginCompleted = false;
    showLogin();
  });
  $('[data-refresh]').addEventListener('click', loadOrders);
  $('[data-refresh-actions]').addEventListener('click', loadActionTasks);
  $('[data-refresh-business]').addEventListener('click', loadBusiness);
  $('[data-refresh-matrix]').addEventListener('click', loadMatrix);
  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => selectTab(button.dataset.tab)));
  $('[data-enable-push]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('当前浏览器不支持网页推送');
      const session = await api('../api/admin-mobile/session');
      if (!session.pushConfigured || !session.pushPublicKey) throw new Error('服务器推送尚未配置');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('没有获得通知权限');
      const registration = await navigator.serviceWorker.ready;
      const bytes = Uint8Array.from(atob(session.pushPublicKey.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
      await api('../api/admin-mobile/push-subscriptions', {
        method: 'POST',
        body: JSON.stringify({ subscription: subscription.toJSON() })
      });
      button.textContent = '新订单通知已开启';
      appMessage.textContent = '收到新订单时，手机会显示通知。';
    } catch (error) {
      appMessage.textContent = error.message;
    }
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  api('../api/admin-mobile/session').then(showApp).catch(showLogin);
})();
