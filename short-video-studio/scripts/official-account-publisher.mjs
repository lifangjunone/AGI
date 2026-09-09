import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const DATA_DIR = path.join(ROOT, "data", "official-account-publisher");
const PROFILE_DIR = process.env.WECHAT_PUBLISHER_PROFILE ||
  path.join(os.homedir(), "Library", "Application Support", "LifeYouMe", "wechat-official-publisher");
const COVER_PATH = process.env.WECHAT_PUBLISHER_COVER ||
  path.join(ROOT, "public", "studio-poster.jpg");
const ACCOUNT_HOME = "https://mp.weixin.qq.com/";
const LOGIN_WAIT_MS = 180_000;

const articles = [
  {
    title: "商品卖点不会写？用这套公式，3分钟生成10个标题",
    digest: "不会写卖点，不等于产品没机会。用“人群+场景+结果”这套公式，把一个普通商品拆成10个可直接拍的视频标题。",
    paragraphs: [
      ["p", "很多人拍商品短视频，第一句话就是“今天给大家介绍一款……”。用户划走，不一定是产品不好，而是开头没有回答一个问题：这件商品到底能帮我解决什么问题？"],
      ["h2", "一、先确定目标人群"],
      ["p", "不要只写“所有人都能用”。把人群说具体，例如租房上班族、带娃家长、刚开店的卖家、经常出差的人。人群越具体，标题越容易让目标用户停下来。"],
      ["h2", "二、再写真实场景"],
      ["p", "场景越具体，用户越容易代入。可以从“早上出门、下班回家、发货前、客户催单、拍视频前”这些时刻开始。"],
      ["h2", "三、最后写清楚结果"],
      ["p", "结果不要写“效果很好”，要写成用户能感受到的变化，例如省下10分钟、少走一次弯路、一次准备7天内容、让客户更快看懂卖点。"],
      ["h2", "四、直接套用这10个标题"],
      ["ol", [
        "给刚开店的卖家：用这3句话，把商品卖点说清楚",
        "客户总问“有什么用”？把商品放进这5个真实场景",
        "不会拍短视频？一个商品拆成7天内容的简单方法",
        "别再只说“质量好”，这样写用户更容易理解",
        "发货前多做这一步，能少回答很多重复问题",
        "租房空间小，也能用这个方法解决收纳问题",
        "带娃后时间不够用，先把这件事交给一套固定流程",
        "商品没有大卖点？先找到用户最在意的一个小问题",
        "朋友圈不知道发什么？今天直接复制这段内容",
        "从一个商品开始，安排好接下来7天要发什么"
      ]],
      ["h2", "五、把标题变成视频"],
      ["p", "选中一个标题后，按“问题开场—展示场景—给出方法—说明结果—行动引导”拍摄。不要一上来讲参数，先让用户看到自己的问题。"],
      ["blockquote", "智助乖乖可以根据你的商品、目标客户和卖点，生成标题、口播、分镜和发布计划。先免费生成一份预览，再决定是否继续完善。"],
      ["p", "进入小程序，回复“模板”或点击菜单“免费工具”，开始生成。"]
    ]
  },
  {
    title: "别再硬拍产品介绍：一个商品拆成7天短视频内容",
    digest: "没有选题，不需要每天硬想。用一件商品的7个内容角度，连续一周都有可拍的内容。",
    paragraphs: [
      ["p", "很多小商家不是没有商品，而是不知道今天拍什么、明天拍什么。结果是偶尔发一条产品介绍，之后又停更。稳定更新的关键，不是每天找新商品，而是把一个商品拆成不同的用户问题。"],
      ["h2", "第1天：解决什么问题"],
      ["p", "先讲用户遇到的具体麻烦，不急着展示产品。比如“发货时最容易漏掉哪一步”“小空间为什么总是乱”。"],
      ["h2", "第2天：使用前后对比"],
      ["p", "用一个真实场景展示变化，避免只拍精致摆拍。用户更关心使用之后少了什么麻烦。"],
      ["h2", "第3天：三种适合人群"],
      ["p", "把商品放进三个不同人群的生活里，让观众快速判断自己是不是适合购买。"],
      ["h2", "第4天：一个常见误区"],
      ["p", "解释用户常见的错误选择，再给出简单判断方法。这样的内容比单纯说“我们家质量好”更容易建立信任。"],
      ["h2", "第5天：使用步骤"],
      ["p", "把复杂的使用方法拆成三步，拍成短而清楚的教程。"],
      ["h2", "第6天：真实问答"],
      ["p", "挑一个客户经常问的问题，用口语回答。问题本身就是现成的内容选题。"],
      ["h2", "第7天：购买前检查清单"],
      ["p", "告诉用户购买前应该看什么规格、场景和售后条件，最后再自然介绍你的商品。"],
      ["blockquote", "好内容不是把商品夸得更大，而是让用户更快判断它是否适合自己。"]
    ]
  },
  {
    title: "客户总问“有什么用”？先把商品放进这5个场景",
    digest: "用户不是不需要，而是没有在内容里看见自己的生活。用场景代替参数，商品更容易被理解。",
    paragraphs: [
      ["p", "“功能很多”“品质很好”“性价比高”这些话，商家很熟悉，用户却很难记住。真正能让人停下来的，是一句“这正好解决了我现在的问题”。"],
      ["h2", "场景一：出门前"],
      ["p", "适合展示节省准备时间、减少遗漏、方便携带的商品。"],
      ["h2", "场景二：工作中"],
      ["p", "适合展示效率、收纳、沟通和重复操作的改善。"],
      ["h2", "场景三：回家后"],
      ["p", "适合展示清洁、放松、收纳和家庭使用体验。"],
      ["h2", "场景四：客户下单前"],
      ["p", "适合展示规格选择、使用边界和售后说明，减少客户犹豫。"],
      ["h2", "场景五：复购时"],
      ["p", "适合展示消耗速度、补充方式和长期使用成本。"],
      ["p", "下一次写内容时，先写“用户在什么时候遇到问题”，再写“商品怎么解决”。顺序一换，内容就不再像硬广告。"]
    ]
  },
  {
    title: "朋友圈没人点赞，不一定是产品不好，可能是顺序错了",
    digest: "朋友圈文案不要一上来就报价。先让读者看见问题，再给方法，最后再给购买入口。",
    paragraphs: [
      ["p", "很多朋友圈文案只有三句话：新品上架、今天优惠、欢迎下单。对已经了解你的人还有效，对大多数潜在客户来说，缺少一个愿意继续看的理由。"],
      ["h2", "推荐使用四段式顺序"],
      ["p", "第一段写一个真实问题；第二段说你观察到的原因；第三段给出一个可以马上执行的小方法；第四段再介绍商品或服务。"],
      ["h2", "一个可直接改写的模板"],
      ["blockquote", "最近发现，很多人在【场景】时都会遇到【问题】。其实先做【小方法】，就能避免【损失/麻烦】。我最近在用【商品】，它主要帮我解决【具体结果】。需要了解规格的，可以留言“清单”。"],
      ["p", "先提供判断依据，再给购买入口，读者会更容易把你当成一个解决问题的人，而不只是一个卖东西的人。"]
    ]
  },
  {
    title: "不会拍口播？用“问题—场景—结果”写出第一条视频",
    digest: "一条能让用户听懂的口播，不需要复杂表演。把问题、使用场景和结果说清楚就够了。",
    paragraphs: [
      ["p", "口播最常见的问题，是一上来就堆参数。用户还没确认自己有没有这个需求，就被迫听了一串规格。"],
      ["h2", "第一句：说出问题"],
      ["p", "例如：“如果你每天发货都要反复确认这几项，今天这条内容可能帮你省下不少时间。”"],
      ["h2", "第二段：放进场景"],
      ["p", "展示用户什么时候会用到它，镜头要让人一看就知道地点、动作和麻烦在哪里。"],
      ["h2", "第三段：说明结果"],
      ["p", "不要只说“很方便”，而要说明少做了哪一步、节省了多少时间，或者避免了什么错误。"],
      ["h2", "最后：给一个低压力动作"],
      ["p", "可以邀请用户回复关键词、领取清单或进入小程序免费生成，不必每条内容都直接催促购买。"]
    ]
  },
  {
    title: "商品没有大卖点？先找到用户最在意的一个小问题",
    digest: "普通商品也能做内容。不要强行制造夸张卖点，先解决一个具体、频繁、容易被忽略的小问题。",
    paragraphs: [
      ["p", "很多商家觉得自己的商品太普通，没法拍内容。其实用户购买的理由，往往不是一个宏大的创新，而是某个每天都会遇到的小麻烦。"],
      ["h2", "判断小问题的三个标准"],
      ["p", "它是不是经常发生？用户是不是已经在想办法解决？解决之后的变化是不是能被看见？满足这三点，就值得做成一条内容。"],
      ["h2", "不要夸大，先把边界说清楚"],
      ["p", "真实说明适用人群、使用条件和不能解决的问题，反而更容易建立信任。内容的作用是帮助用户做判断，而不是替用户做承诺。"],
      ["blockquote", "小问题讲清楚，普通商品也能拥有自己的购买理由。"]
    ]
  },
  {
    title: "从一个商品开始，安排好接下来7天要发什么",
    digest: "把一周内容提前排好，减少临时赶稿。每天一个角度，持续让用户理解、信任并行动。",
    paragraphs: [
      ["p", "稳定更新不等于每天重复广告，而是让用户从不同角度逐渐了解你的商品。下面这份安排可以直接套用。"],
      ["ol", ["第1天讲用户问题", "第2天展示使用场景", "第3天回答一个常见疑问", "第4天给出选择方法", "第5天展示使用步骤", "第6天分享真实案例", "第7天给出下一步行动"] ],
      ["p", "每条内容只解决一个问题，标题不要超过一个核心承诺。这样更容易写，也更容易让用户记住。"],
      ["p", "如果你不想从空白开始，可以在智助乖乖输入商品、目标客户和卖点，先免费生成一份7天内容预览。"]
    ]
  }
];

function beijingDateKey() {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date()).replaceAll("/", "-");
}

function publishSlot() {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    hour12: false
  }).format(new Date()));
  return hour < 13 ? "morning" : "evening";
}

function slotIndex(slot) {
  return slot === "morning" ? 0 : 1;
}

function dayNumber() {
  return Math.floor(Date.now() / 86_400_000);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function renderBlock([type, content]) {
  if (type === "ol") {
    return `<ol>${content.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`;
  }
  return `<${type}>${escapeHtml(content)}</${type}>`;
}

function renderArticle(article) {
  return article.paragraphs.map(renderBlock).join("");
}

async function logRun(entry) {
  await mkdir(DATA_DIR, { recursive: true });
  await appendFile(
    path.join(DATA_DIR, "runs.jsonl"),
    `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`
  );
}

async function alreadyPublished(dateKey, slot) {
  try {
    const state = JSON.parse(await readFile(path.join(DATA_DIR, "state.json"), "utf8"));
    return state.dateKey === dateKey && state.slot === slot && state.status === "published";
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function markPublished(dateKey, slot, title) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    path.join(DATA_DIR, "state.json"),
    `${JSON.stringify({ dateKey, slot, status: "published", title, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    { mode: 0o600 }
  );
}

async function waitForDashboard(page) {
  await page.goto(ACCOUNT_HOME, { waitUntil: "domcontentloaded" });
  const loginVisible = await page.locator("text=微信公众平台").first().isVisible().catch(() => false);
  if (loginVisible && page.url().includes("login")) {
    await page.waitForURL(/mp\.weixin\.qq\.com\/(?!cgi-bin\/login)/, { timeout: LOGIN_WAIT_MS });
  }
  await page.waitForTimeout(1500);
}

async function fillArticle(page, article) {
  await page.goto("https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&type=77", {
    waitUntil: "domcontentloaded"
  });
  await page.waitForTimeout(1800);
  await page.locator('input[placeholder*="标题"], input[placeholder*="请输入标题"]').first().fill(article.title);
  const author = page.locator('input[placeholder*="作者"]').first();
  if (await author.count()) await author.fill("智助乖乖");
  const digest = page.locator('textarea[placeholder*="摘要"], textarea[placeholder*="简介"]').first();
  if (await digest.count()) await digest.fill(article.digest);
  const editor = page.locator('[contenteditable="true"]:visible').first();
  const html = renderArticle(article);
  const plainText = article.paragraphs.map(([, content]) => Array.isArray(content) ? content.join("\n") : content).join("\n\n");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "https://mp.weixin.qq.com"
  });
  await page.evaluate(async ({ html: clipboardHtml, plainText: clipboardText }) => {
    const clipboardItem = new ClipboardItem({
      "text/html": new Blob([clipboardHtml], { type: "text/html" }),
      "text/plain": new Blob([clipboardText], { type: "text/plain" })
    });
    await navigator.clipboard.write([clipboardItem]);
  }, { html, plainText });
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
  await page.waitForTimeout(500);
  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.count()) {
    await fileInput.setInputFiles(COVER_PATH);
  } else {
    await page.getByText("封面", { exact: true }).click();
    await page.locator('input[type="file"]').first().setInputFiles(COVER_PATH);
  }
  await page.waitForTimeout(1200);
  await page.getByText("发表", { exact: true }).click();
  await page.waitForTimeout(1000);
  const confirm = page.getByText("确认发表", { exact: true });
  if (await confirm.count()) await confirm.click();
}

const dateKey = beijingDateKey();
const slot = process.env.WECHAT_PUBLISHER_SLOT || publishSlot();
const article = articles[(dayNumber() * 2 + slotIndex(slot)) % articles.length];
if (await alreadyPublished(dateKey, slot)) {
  console.log(JSON.stringify({ status: "skipped", dateKey, slot, reason: "already published for this slot" }));
  process.exit(0);
}
const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: process.env.WECHAT_PUBLISHER_HEADLESS === "1",
  viewport: { width: 1440, height: 1000 }
});
try {
  const page = browser.pages()[0] || await browser.newPage();
  await waitForDashboard(page);
  await fillArticle(page, article);
  await markPublished(dateKey, slot, article.title);
  await logRun({ dateKey, slot, status: "published", title: article.title });
  console.log(JSON.stringify({ status: "published", dateKey, slot, title: article.title }));
} catch (error) {
  await logRun({ dateKey, slot, status: "failed", error: error.message });
  console.error(JSON.stringify({ status: "failed", dateKey, slot, error: error.message }));
  process.exitCode = 1;
} finally {
  await browser.close();
}
