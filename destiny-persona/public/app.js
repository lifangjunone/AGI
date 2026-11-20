const $ = (selector) => document.querySelector(selector);
const form = $("#fortune-form");
const entryView = $("#entry-view");
const cardView = $("#card-view");
const blocked = $("#blocked");
let fortune = null;
let cardIndex = 0;
let busy = false;
let billing = null;
let paymentBusy = false;
let confirmationTimer = 0;
let pendingOrder = new URLSearchParams(location.hash.split("?")[1] || "").get("order") || "";
try {
  const saved = JSON.parse(sessionStorage.getItem("destiny-fortune") || "null");
  if (saved?.kind === "daily_fortune" && Array.isArray(saved.cards)) fortune = saved;
  cardIndex = Math.min(Number(sessionStorage.getItem("destiny-card-index") || 0), (fortune?.cards.length || 1) - 1);
} catch {
  sessionStorage.removeItem("destiny-fortune");
  sessionStorage.removeItem("destiny-card-index");
}
try {
  const savedForm = JSON.parse(sessionStorage.getItem("destiny-form") || "null");
  if (savedForm) {
    for (const [name, value] of Object.entries(savedForm)) {
      const field = form.elements.namedItem(name);
      if (field instanceof RadioNodeList) {
        field.value = value;
      } else if (field) {
        field.value = value;
      }
    }
    form.hidden = false;
    $("#start").setAttribute("aria-expanded", "true");
  }
} catch {
  sessionStorage.removeItem("destiny-form");
}

function start() {
  form.hidden = false;
  $("#start").setAttribute("aria-expanded", "true");
  form.scrollIntoView({block: "start"});
  $("#nickname").focus({preventScroll: true});
}

function route({focus = true} = {}) {
  const showCard = location.hash === "#card" && fortune;
  entryView.hidden = Boolean(showCard);
  cardView.hidden = !showCard;
  document.title = showCard ? "今日时运卡 · 命运分身" : "命运分身 · 今日时运";
  scrollTo(0, 0);
  if (showCard && focus) $("#card-title").focus({preventScroll: true});
}

function renderCard(animate = true) {
  if (!fortune) return;
  const card = fortune.cards[cardIndex];
  const pillar = fortune.dayPillar;
  document.documentElement.style.setProperty("--element", pillar.stem.color);
  $("#date-label").textContent = fortune.dateLabel;
  $("#pillar-id").textContent = `六十甲子 · 第${pillar.index}签`;
  $("#recipient").textContent = `${fortune.maskedName}的今日时运`;
  $("#stem-mark").textContent = pillar.stem.name;
  $("#branch-mark").textContent = pillar.branch.name;
  $("#zodiac-mark").textContent = pillar.branch.zodiac;
  $("#element-mark").textContent = pillar.stem.element;
  $("#omen").textContent = `${pillar.name}日 · ${pillar.omen}之象`;
  $("#card-title").textContent = card.title;
  $("#verse").textContent = pillar.verse;
  $("#seal").textContent = card.label;
  $("#reading-kicker").textContent = `从「${card.label}」看今天`;
  $("#reading-title").textContent = card.title;
  $("#reading-lead").textContent = card.lead;
  $("#advice").textContent = card.advice;
  $("#avoid").textContent = card.avoid;
  $("#pillar-copy").textContent = `${pillar.stem.name}属${pillar.stem.polarity}${pillar.stem.element}，${pillar.branch.name}对应生肖${pillar.branch.zodiac}与${pillar.branch.hours}。当天底盘固定，翻卡只改变观察角度。`;
  $("#element-value").textContent = `${pillar.stem.polarity}${pillar.stem.element}`;
  $("#color-value").textContent = pillar.luckyColor;
  $("#direction-value").textContent = pillar.branch.direction;
  $("#card-progress").textContent = `第 ${cardIndex + 1}/${fortune.cards.length} 张`;
  $("#disclaimer").textContent = fortune.disclaimer;
  $("#card-status").textContent = "";
  $("#next-card").textContent = cardIndex === fortune.cards.length - 1 ? "重新洗牌六个角度" : "换个角度解签";
  if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    $("#oracle").classList.remove("reveal");
    requestAnimationFrame(() => requestAnimationFrame(() => $("#oracle").classList.add("reveal")));
  }
}

function showFortune() {
  clearTimeout(confirmationTimer);
  blocked.hidden = true;
  if (location.hash !== "#card") history.pushState({page: "card"}, "", "#card");
  route();
  renderCard();
}

function setOrderState(title, copy, state = "pending") {
  const panel = $("#order-state");
  panel.hidden = false;
  panel.dataset.state = state;
  $("#order-state-title").textContent = title;
  $("#order-copy").textContent = copy;
}

function quotaMessage(quota) {
  if (quota.paidRemaining > 0) return `今日卡已生成，付费次数剩余 ${quota.paidRemaining} 次。`;
  return `今日卡已生成，免费次数剩余 ${quota.freeRemaining}/${quota.limit} 次。`;
}

async function loadBilling() {
  try {
    const response = await fetch("./api/billing/config", {cache: "no-store"});
    billing = await response.json();
    const plans = $("#plans");
    plans.replaceChildren(...billing.plans.map(plan => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "plan";
      button.disabled = !billing.checkoutEnabled;
      button.setAttribute("aria-label", `${plan.name}，${plan.amount} 元，${plan.credits} 次今日时运生成`);
      button.innerHTML = `<strong>${plan.name}</strong><span class="price">¥${plan.amount}</span><small>${plan.credits} 次今日时运生成</small><em>${plan.tag}</em>`;
      button.addEventListener("click", () => checkout(plan.id));
      return button;
    }));
    $("#pay-note").textContent = billing.checkoutEnabled
      ? "支付宝安全收款。支付成功后，次数自动加入当前浏览器。"
      : "在线收款正在开通。你可以先返回查看已有卡片；正式支付启用后这里会直接显示支付宝购买按钮。";
  } catch {
    $("#pay-note").textContent = "暂时无法读取开通状态，请稍后刷新。";
  }
}

async function checkout(planId) {
  if (paymentBusy || !billing?.checkoutEnabled) return;
  paymentBusy = true;
  $("#plans").setAttribute("aria-busy", "true");
  $("#plans").querySelectorAll("button").forEach(button => { button.disabled = true; });
  $("#payment-status").textContent = "正在创建支付宝订单…";
  try {
    const response = await fetch("./api/billing/checkout", {
      method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({planId}),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error("订单创建失败，请稍后重试。");
    pendingOrder = data.order.outTradeNo;
    sessionStorage.setItem("destiny-order", pendingOrder);
    setOrderState("订单已创建", `订单号 ${pendingOrder}，请在 15 分钟内完成付款。`);
    const container = document.createElement("div");
    container.hidden = true;
    container.innerHTML = data.paymentHtml;
    document.body.appendChild(container);
    const paymentForm = container.querySelector("form");
    if (!paymentForm) throw new Error("支付宝支付表单未生成。");
    paymentForm.submit();
  } catch (error) {
    $("#payment-status").textContent = error.message;
    paymentBusy = false;
    $("#plans").removeAttribute("aria-busy");
    $("#plans").querySelectorAll("button").forEach(button => { button.disabled = !billing?.checkoutEnabled; });
  }
}

function finishPayment(data) {
  clearTimeout(confirmationTimer);
  sessionStorage.removeItem("destiny-order");
  pendingOrder = "";
  paymentBusy = false;
  setOrderState("次数已经到账", `本次增加 ${data.order.credits} 次，当前还可生成 ${data.quota.remaining} 次。`, "paid");
  $("#payment-status").textContent = "支付已确认，可以继续生成今日时运卡。";
  $("#refresh-payment").hidden = true;
  $("#continue-reading").hidden = false;
  $("#generate").disabled = false;
  $("#continue-reading").focus({preventScroll: true});
}

async function confirmPayment({attempt = 0, automatic = false} = {}) {
  pendingOrder = pendingOrder || sessionStorage.getItem("destiny-order") || "";
  if (!pendingOrder) {
    $("#payment-status").textContent = "没有找到待确认订单。";
    return;
  }
  if (paymentBusy && !automatic) return;
  paymentBusy = true;
  $("#refresh-payment").disabled = true;
  setOrderState("正在确认订单", `订单号 ${pendingOrder}，正在向支付宝核对结果。`);
  $("#payment-status").textContent = attempt ? `正在进行第 ${attempt + 1} 次自动确认…` : "正在向支付宝确认支付结果…";
  try {
    const response = await fetch("./api/billing/confirm", {
      method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({order: pendingOrder}),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error("订单确认失败，请稍后重试。");
    if (data.order.status === "PAID") {
      finishPayment(data);
    } else if (data.order.status === "CLOSED") {
      paymentBusy = false;
      setOrderState("订单已关闭", "这笔订单没有到账，请重新选择次数包。", "closed");
      $("#payment-status").textContent = "订单已关闭，没有扣除或增加次数。";
      $("#refresh-payment").hidden = true;
    } else {
      paymentBusy = false;
      if (attempt < 4) {
        $("#payment-status").textContent = "支付宝暂未返回到账结果，本页会继续自动确认。";
        confirmationTimer = setTimeout(() => confirmPayment({attempt: attempt + 1, automatic: true}), 2500);
      } else {
        setOrderState("等待支付宝确认", `订单号 ${pendingOrder}。如已付款，可稍后重新确认。`);
        $("#payment-status").textContent = "暂未确认到账。你的订单已保留，可以稍后重新确认。";
        $("#refresh-payment").hidden = false;
      }
    }
  } catch (error) {
    paymentBusy = false;
    if (automatic && attempt < 4) {
      $("#payment-status").textContent = "确认暂时未完成，本页会自动重试。";
      confirmationTimer = setTimeout(() => confirmPayment({attempt: attempt + 1, automatic: true}), 2500);
    } else {
      $("#payment-status").textContent = `${error.message} 订单已保留，可重新确认。`;
      $("#refresh-payment").hidden = false;
    }
  } finally {
    $("#refresh-payment").disabled = false;
  }
}

function continueAfterPayment() {
  clearTimeout(confirmationTimer);
  blocked.hidden = true;
  form.hidden = false;
  $("#form-status").classList.remove("error");
  $("#form-status").textContent = "次数已到账，填写内容仍在，可以直接生成。";
  form.scrollIntoView({block: "start"});
  $("#generate").focus({preventScroll: true});
}

$("#start").addEventListener("click", start);
$("#birthday").max = new Date().toLocaleDateString("en-CA");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  sessionStorage.setItem("destiny-form", JSON.stringify(Object.fromEntries(new FormData(form))));
  busy = true;
  $("#generate").disabled = true;
  form.setAttribute("aria-busy", "true");
  $("#generate").textContent = "正在起今日签…";
  $("#form-status").classList.remove("error");
  $("#form-status").textContent = "正在生成，请稍候。";
  try {
    const response = await fetch("./api/read", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (response.status === 402) {
      $("#form-status").textContent = "免费次数已用完，可以购买次数包继续生成。";
      blocked.hidden = false;
      $("#back-card").hidden = !fortune;
      $("#blocked-title").focus({preventScroll: true});
      blocked.scrollIntoView({block: "nearest"});
      await loadBilling();
      return;
    }
    if (!response.ok || !data.ok) throw new Error(data.message || "生成未完成，请稍后重试。");
    fortune = data;
    cardIndex = 0;
    sessionStorage.setItem("destiny-fortune", JSON.stringify(fortune));
    sessionStorage.setItem("destiny-card-index", "0");
    $("#form-status").textContent = quotaMessage(data.quota);
    showFortune();
  } catch (error) {
    $("#form-status").classList.add("error");
    $("#form-status").textContent = error.name === "TimeoutError" ? "请求超时，填写内容仍在，可以重试。" : error.message === "Failed to fetch" ? "暂时无法连接，请检查网络后重试。" : error.message;
  } finally {
    busy = false;
    $("#generate").disabled = false;
    form.removeAttribute("aria-busy");
    $("#generate").textContent = "生成今日时运卡";
  }
});

$("#return-entry").addEventListener("click", () => history.back());
$("#back-card").addEventListener("click", showFortune);
$("#refresh-payment").addEventListener("click", () => confirmPayment());
$("#continue-reading").addEventListener("click", continueAfterPayment);
$("#next-card").addEventListener("click", () => {
  if (!fortune) return;
  cardIndex += 1;
  if (cardIndex >= fortune.cards.length) {
    cardIndex = 0;
    for (let i = fortune.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fortune.cards[i], fortune.cards[j]] = [fortune.cards[j], fortune.cards[i]];
    }
  }
  sessionStorage.setItem("destiny-fortune", JSON.stringify(fortune));
  sessionStorage.setItem("destiny-card-index", String(cardIndex));
  renderCard();
  $("#card-title").focus({preventScroll: true});
});

$("#copy-card").addEventListener("click", async () => {
  if (!fortune) return;
  const card = fortune.cards[cardIndex];
  const text = `${fortune.dateLabel} · ${fortune.dayPillar.name}日\n${card.label}签：${card.title}\n${fortune.dayPillar.verse}\n宜：${card.advice}\n忌：${card.avoid}\nhttps://lifeyoume.icu/destiny-persona/`;
  try {
    await navigator.clipboard.writeText(text);
    $("#card-status").textContent = "当前签文已复制。";
  } catch {
    $("#card-status").textContent = "当前环境无法自动复制，请手动选择签文。";
  }
});

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.stroke();
}

$("#save-card").addEventListener("click", () => {
  if (!fortune) return;
  const card = fortune.cards[cardIndex];
  const pillar = fortune.dayPillar;
  const canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = 1520;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#17362f"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = pillar.stem.color; ctx.lineWidth = 3;
  roundRect(ctx, 55, 55, 970, 1410, 22);
  ctx.lineWidth = 1; roundRect(ctx, 75, 75, 930, 1370, 12);
  ctx.textAlign = "center";
  ctx.fillStyle = "#c5d7cd"; ctx.font = "34px sans-serif";
  ctx.fillText(`${fortune.dateLabel} · 第${pillar.index}签`, 540, 150);
  ctx.fillStyle = pillar.stem.color; ctx.font = "52px serif";
  ctx.fillText(`${pillar.name}日 · ${pillar.stem.polarity}${pillar.stem.element} · 肖${pillar.branch.zodiac}`, 540, 260);
  ctx.strokeStyle = pillar.stem.color;
  for (const radius of [260, 215, 165]) { ctx.beginPath(); ctx.arc(540, 600, radius, 0, Math.PI * 2); ctx.stroke(); }
  ctx.font = "180px serif"; ctx.fillStyle = "#f7edce"; ctx.fillText(pillar.name, 540, 665);
  ctx.font = "40px serif"; ctx.fillStyle = pillar.stem.color; ctx.fillText(`${card.label}签`, 540, 900);
  ctx.font = "86px serif"; ctx.fillStyle = "#f7edce"; ctx.fillText(card.title, 540, 1025);
  ctx.font = "44px serif"; ctx.fillStyle = "#dce5df"; ctx.fillText(pillar.verse, 540, 1130);
  ctx.font = "30px sans-serif"; ctx.fillStyle = "#c5d7cd"; ctx.fillText(`宜 · ${card.advice}`, 540, 1245);
  ctx.fillText(`忌 · ${card.avoid}`, 540, 1310);
  ctx.font = "26px sans-serif"; ctx.fillText("命运分身 · 娱乐与自我观察", 540, 1400);
  const link = document.createElement("a");
  link.download = `今日时运-${fortune.date}-${pillar.name}-${card.label}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
  $("#card-status").textContent = "当前卡片图片已保存。";
});

addEventListener("popstate", route);
addEventListener("hashchange", route);
route({focus: false});
if (location.hash === "#card" && fortune) renderCard(false);
if (location.hash.startsWith("#purchase")) {
  history.replaceState({page: "entry"}, "", location.pathname + "#purchase");
  start();
  blocked.hidden = false;
  $("#plans").hidden = true;
  $("#pay-note").textContent = "支付页面已返回，正在自动核对到账结果。";
  loadBilling().then(() => {
    $("#plans").hidden = false;
    confirmPayment({automatic: true});
  });
}
