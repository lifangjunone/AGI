// 渲染：产出公众号编辑器可直接粘贴的“内联样式” HTML（不依赖 class/外部 CSS）。
// 同时产出一个带工具栏的完整预览页面。
import { config } from "./config.js";

function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// —— 公众号安全样式：只用 block/内联样式，不用 flex/grid/class/外链 ——
const C = {
  section: 'max-width:100%;margin:0 0 22px 0;color:#1f2329;font-size:16px;line-height:1.85;letter-spacing:0.2px;',
  kicker:
    'display:inline-block;margin:0 0 14px 0;padding:4px 10px;font-size:12px;letter-spacing:2px;' +
    'color:#b23f14;background:#fdeee7;border-radius:4px;font-weight:600;',
  h1: 'margin:0 0 10px 0;font-size:24px;line-height:1.4;color:#14181f;font-weight:800;',
  sub: 'margin:0 0 20px 0;font-size:15px;color:#6b6757;line-height:1.7;',
  takeawayBox:
    'margin:0 0 24px 0;padding:16px 18px;background:#fff7f2;border-left:4px solid #d8521e;border-radius:0 6px 6px 0;',
  takeawayLabel: 'margin:0 0 6px 0;font-size:12px;letter-spacing:2px;color:#b23f14;font-weight:700;',
  takeawayText: 'margin:0;font-size:16px;line-height:1.8;color:#1f2329;font-weight:600;',
  secHead:
    'margin:28px 0 14px 0;font-size:17px;font-weight:800;color:#14181f;' +
    'padding-bottom:8px;border-bottom:2px solid #14181f;',
  card: 'margin:0 0 16px 0;padding:16px 18px;border:1px solid #ece8df;border-radius:10px;background:#fffdf9;',
  cardTitle: 'margin:0 0 8px 0;font-size:16px;font-weight:700;color:#14181f;line-height:1.5;',
  label: 'margin:0 0 4px 0;font-size:12px;letter-spacing:1px;font-weight:700;color:#b23f14;',
  body: 'margin:0 0 8px 0;font-size:15px;line-height:1.8;color:#3d3a31;',
  link: 'display:inline-block;margin-top:4px;font-size:13px;color:#b23f14;text-decoration:none;word-break:break-all;',
  practicalBox:
    'margin:24px 0 8px 0;padding:18px 20px;background:#14181f;border-radius:10px;',
  practicalLabel: 'margin:0 0 8px 0;font-size:12px;letter-spacing:2px;color:#ffb894;font-weight:700;',
  practicalText: 'margin:0;font-size:15px;line-height:1.8;color:#f6f5f1;',
  refsHead: 'margin:28px 0 10px 0;font-size:14px;font-weight:700;color:#6b6757;',
  refItem: 'margin:0 0 6px 0;font-size:13px;line-height:1.7;color:#6b6757;',
  footer: 'margin:26px 0 0 0;padding-top:14px;border-top:1px solid #ece8df;font-size:12px;color:#928e7d;',
};

/** 公众号正文 HTML（内联样式，可直接粘贴） */
export function renderArticleBody(brief) {
  const a = brief.article;
  const dateLabel = brief.id;

  const signals = a.signals
    .map(
      (s, i) => `
  <section style="${C.card}">
    <p style="${C.cardTitle}">${i + 1}. ${esc(s.title)}</p>
    <p style="${C.label}">发生了什么</p>
    <p style="${C.body}">${esc(s.point)}</p>
    <p style="${C.label}">对现场交付</p>
    <p style="${C.body}">${esc(s.fde)}</p>
    <a href="${esc(s.url)}" style="${C.link}">来源：${esc(s.source)} ↗</a>
  </section>`
    )
    .join("");

  const refs = brief.refs
    .map(
      (r) =>
        `<p style="${C.refItem}">· ${esc(r.title)}（${esc(r.source)}）</p>`
    )
    .join("");

  return `
<section style="${C.section}" data-fde-article="1">
  <p style="${C.kicker}">FDE 每日速递</p>
  <h1 style="${C.h1}">${esc(a.title)}</h1>
  <p style="${C.sub}">${esc(a.subtitle)}</p>

  <section style="${C.takeawayBox}">
    <p style="${C.takeawayLabel}">今日一句话</p>
    <p style="${C.takeawayText}">${esc(a.takeaway)}</p>
  </section>

  <p style="${C.secHead}">今日 ${a.signals.length} 个关键信号</p>
  ${signals}

  <section style="${C.practicalBox}">
    <p style="${C.practicalLabel}">今天就可以做</p>
    <p style="${C.practicalText}">${esc(a.practical)}</p>
  </section>

  <p style="${C.refsHead}">参考来源</p>
  ${refs}

  <p style="${C.footer}">FDE 现场作战工具包 · ${dateLabel} · 由 ${esc(brief.model)} 辅助整理</p>
</section>`;
}

/** 完整预览页（含工具栏、复制按钮、来源状态） */
export function renderPage(brief) {
  const body = renderArticleBody(brief);
  const statusRows = Object.entries(brief.sourceStatus || {})
    .map(([name, s]) => {
      const dot = s.ok ? "#1f7a4d" : "#b3261e";
      const text = s.ok ? `${s.count} 条` : `失败：${esc(s.error || "")}`;
      return `<li><span class="dot" style="background:${dot}"></span>${esc(name)} · ${text}</li>`;
    })
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(brief.article.title)} · FDE 每日速递</title>
<style>
  :root{--paper:#f3f1ea;--ink:#17150f;--muted:#6b6757;--accent:#d8521e;--line:#e4e0d5;}
  *{box-sizing:border-box;}
  body{margin:0;background:var(--paper);color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;}
  .toolbar{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.92);backdrop-filter:blur(10px);
    border-bottom:1px solid var(--line);}
  .toolbar-inner{max-width:760px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;gap:12px;}
  .toolbar .meta{font-size:13px;color:var(--muted);margin-right:auto;}
  .btn{appearance:none;border:1px solid var(--ink);background:var(--ink);color:#fff;border-radius:8px;
    padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;}
  .btn.ghost{background:transparent;color:var(--ink);}
  .btn:active{transform:translateY(1px);}
  .page{max-width:760px;margin:0 auto;padding:32px 20px 80px;}
  .paper{background:#fff;border:1px solid var(--line);border-radius:14px;padding:36px 40px;}
  .status{max-width:760px;margin:18px auto 0;padding:0 20px;}
  .status ul{list-style:none;margin:10px 0 0;padding:0;font-size:12px;color:var(--muted);}
  .status li{margin:4px 0;}
  .dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:7px;}
  .toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%) translateY(20px);
    background:var(--ink);color:#fff;padding:10px 18px;border-radius:10px;font-size:14px;
    opacity:0;transition:all .25s ease;pointer-events:none;}
  .toast.show{opacity:1;transform:translateX(-50%) translateY(0);}
  @media (max-width:600px){.paper{padding:24px 20px;}}
</style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-inner">
      <span class="meta">FDE 每日速递 · ${brief.id}</span>
      <button class="btn ghost" id="copyRaw">复制HTML</button>
      <button class="btn" id="copyRich">复制到公众号</button>
    </div>
  </div>

  <div class="status">
    <div style="font-size:12px;color:var(--muted)">采集候选 ${brief.candidateCount} 条 · 模型 ${esc(brief.model)}</div>
    <ul>${statusRows}</ul>
  </div>

  <main class="page">
    <div class="paper" id="articlePaper">
${body}
    </div>
  </main>

  <div class="toast" id="toast"></div>

<script>
  const ARTICLE_HTML = document.getElementById('articlePaper').innerHTML.trim();
  function toast(msg){
    const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
    clearTimeout(t._timer); t._timer=setTimeout(()=>t.classList.remove('show'),1800);
  }
  async function copyRich(){
    try{
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([ARTICLE_HTML], {type:'text/html'}),
            'text/plain': new Blob([ARTICLE_HTML], {type:'text/plain'})
          })
        ]);
        toast('已复制，去公众号后台粘贴');
        return;
      }
    }catch(e){/* 回退 */}
    copyRawFallback('富文本复制受限，请改用复制HTML');
  }
  function copyRawFallback(okMsg){
    const ta=document.createElement('textarea'); ta.value=ARTICLE_HTML;
    ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta);
    ta.focus(); ta.select();
    try{ document.execCommand('copy'); toast(okMsg||'HTML 已复制'); }
    catch(e){ toast('复制失败，请手动选择正文'); }
    document.body.removeChild(ta);
  }
  document.getElementById('copyRich').addEventListener('click', copyRich);
  document.getElementById('copyRaw').addEventListener('click', ()=>copyRawFallback('HTML 已复制'));
</script>
</body>
</html>`;
}
