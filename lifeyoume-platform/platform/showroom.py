"""Presentation-only showroom. Catalog policies remain owned by app.py."""
from urllib.parse import urlencode

SELECTED = (
    "meyou-agent-network", "frame60", "flowframe-studio",
    "resume-forge", "privacy-vault", "travel-frame",
)


def highlights(product):
    return product.highlights or tuple((item, "") for item in product.capabilities)


def visual(app, product, *, eager=False):
    if product.preview:
        return (
            '<div class="show-preview"><img '
            f'src="/assets/{app.esc(product.preview)}" '
            f'alt="{app.esc(product.preview_alt or product.name + " 界面预览")}" '
            f'loading="{"eager" if eager else "lazy"}" width="1200" height="750"></div>'
        )
    # Existing assets can be editorial photos; don't label them as UI screenshots.
    if product.visual:
        return (
            '<div class="show-preview"><img '
            f'src="/assets/{app.esc(product.visual)}" alt="{app.esc(product.name)} 产品配图" '
            f'loading="{"eager" if eager else "lazy"}" width="1200" height="750"></div>'
        )
    return app.product_visual(product)


def actions(app, product):
    esc = app.esc
    primary = (
        f'<a class="show-button" href="/products/{esc(product.id)}/open">'
        f'{esc(product.cta)} <span aria-hidden="true">↗</span></a>'
        if product.public_url else '<span class="show-unavailable">暂未开放公开入口</span>'
    )
    return (
        f'<div class="show-actions">{primary}'
        f'<a class="show-link" data-detail-link href="/products/{esc(product.id)}?from=card">'
        f'了解亮点<span class="sr-only">：{esc(product.name)}</span> <span aria-hidden="true">→</span></a></div>'
    )


def card(app, product, *, selected=False, index=0):
    esc = app.esc
    state, label = app.product_status(product)
    search = " ".join((
        product.name, product.tagline, product.summary, product.collection,
        product.audience, product.scenario, *product.capabilities,
        *(title + " " + description for title, description in highlights(product)),
    ))
    chips = "".join(f"<li>{esc(title)}</li>" for title, _ in highlights(product)[:3])
    platforms = " · ".join(product.platforms)
    return f"""<article class="show-card {'show-selected-card' if selected else 'product-card'}"
 data-category="{esc(product.category)}" data-scope="{esc(product.visibility)}"
 data-entry="{str(bool(product.public_url)).lower()}" data-search="{esc(search)}">
 {visual(app, product)}
 <div class="show-card-copy">
  <div class="show-meta"><span>{f'{index:02d} / ' if selected else ''}{esc(product.category)}</span>
   <span class="status {esc(state)}"><i aria-hidden="true"></i>{esc(label)}</span></div>
  <h3>{esc(product.name)}</h3>
  <p>{esc(product.scenario or product.tagline)}</p>
  <ul class="show-chips" aria-label="核心亮点">{chips}</ul>
  <span class="show-platform">{esc(platforms)}</span>
  {actions(app, product)}
 </div></article>"""


def catalog(app, products):
    esc = app.esc
    public, _, _, rotation = app.ranked_products(app.visible_products(products))
    lookup = {item.id: item for item in public}
    selected = [lookup[key] for key in SELECTED if key in lookup]
    lead = lookup.get("flowframe-studio") or (selected[0] if selected else None)
    stage = (
        f'<a class="show-stage" data-detail-link href="/products/{esc(lead.id)}">'
        f'<div class="show-window"><span aria-hidden="true">● ● ●</span><span>{esc(lead.name)}</span></div>'
        f'{visual(app, lead, eager=True)}'
        f'<div class="show-stage-caption"><span>{esc(lead.tagline)}</span><b aria-hidden="true">↗</b></div></a>'
        if lead else ""
    )
    categories = ["全部", *sorted({item.category for item in public})]
    controls = "".join(
        f'<button type="button" data-category-filter="{esc(category)}" aria-pressed="{str(category == "全部").lower()}">'
        f'{esc(category)} <span>{len(public) if category == "全部" else sum(item.category == category for item in public)}</span></button>'
        for category in categories
    )
    main_selected = "".join(card(app, item, selected=True, index=i) for i, item in enumerate(selected[:3], 1))
    secondary = "".join(card(app, item, selected=True, index=i) for i, item in enumerate(selected[3:], 4))
    body = f"""<main class="showroom" id="main-content">
 <section class="show-hero" aria-labelledby="show-title">
  <div class="show-hero-copy"><p class="show-kicker">LIFEYOUME / PRODUCT STUDIO</p>
   <h1 id="show-title">把想法，<br>变成用得上的<span>产品。</span></h1>
   <p class="show-lead">创作一条视频，遇见一个新朋友，或迈出职业的下一步。<br>从真实需要出发，找到为你解决问题的工具。</p>
   <a class="show-button" href="#explore">找到适合我的产品 <span aria-hidden="true">↓</span></a>
   <div class="show-hero-note"><span>{len(public):02d} 款产品与实验</span><span>独立创造 · 持续生长</span></div>
  </div>{stage}
 </section>
 <section class="show-selection" aria-labelledby="selected-title">
  <div class="show-heading"><div><p class="show-kicker">精选 / SELECTED</p><h2 id="selected-title">不同的想法，同样认真。</h2></div>
   <p>从关系连接到内容创作，<br>认识这些正在生长的产品。</p></div>
  <div class="show-selected-grid">{main_selected}</div>
  <div class="show-secondary-grid">{secondary}</div>
 </section>
 <section class="show-explore" id="explore" aria-labelledby="explore-title" tabindex="-1">
  <div class="show-heading"><div><p class="show-kicker">探索 / EXPLORE</p><h2 id="explore-title">你的下一件好工具。</h2></div><p>按场景发现，也可以直接搜索。</p></div>
  <div class="show-controls">
   <label class="show-search"><span>搜索产品</span><div><input id="product-search" type="search" placeholder="试试「视频」「简历」「加密」" autocomplete="off"><button type="button" id="catalog-clear" aria-label="清空搜索">清空</button></div></label>
   <label><span>可用范围</span><select id="product-availability"><option value="all">全部</option><option value="open">有公开入口</option><option value="lab">实验室</option></select></label>
   <button type="button" id="catalog-reset" class="show-reset">重置筛选</button>
  </div>
  <div class="show-categories" aria-label="产品分类">{controls}</div>
  <div class="show-results"><p aria-live="polite" aria-atomic="true"><strong id="visible-count">{len(public)}</strong> 个产品</p>
   <details><summary>排序说明</summary><p>后台主推优先，其余按近七天热度排序；同热度每 {rotation} 分钟轮换。无公开入口的产品始终置后。</p></details></div>
  <div id="product-grid" class="show-catalog-grid">{"".join(card(app, item) for item in public)}</div>
  <div class="show-empty" id="catalog-empty" hidden><h3>没有找到匹配产品</h3><p>试试“视频”“学习”或“本地”，也可以重置筛选，重新发现。</p><button type="button" data-reset-filters class="show-button">查看全部产品</button></div>
 </section>
 <section class="show-ending"><p class="show-kicker">BUILT FOR REAL LIFE</p><h2>让技术靠近生活，<br>让想法成为日常。</h2><a class="show-link" href="#explore">继续探索 <span aria-hidden="true">↑</span></a></section>
</main>
<footer class="site-footer"><span>LifeYouMe · 独立产品工作室</span><a href="/">返回首页</a></footer>"""
    return app.page("产品展厅", body, portal=True, showroom=True)


def detail(app, product, products):
    esc = app.esc
    state, label = app.product_status(product)
    action = (
        f'<a class="show-button" href="/products/{esc(product.id)}/open">{esc(product.cta)} <span aria-hidden="true">↗</span></a>'
        if product.public_url else '<span class="show-unavailable">暂未开放公开入口</span>'
    )
    features = "".join(
        f'<article><span class="show-kicker">{index:02d}</span><h3>{esc(title)}</h3>'
        f'{f"<p>{esc(description)}</p>" if description else ""}</article>'
        for index, (title, description) in enumerate(highlights(product), 1)
    )
    steps = product.steps or (
        ("打开产品，查看当前可用范围。", "按产品页面提示开始使用。")
        if product.public_url else ("阅读产品亮点与当前进展。", "当前暂无公开入口，请以实际开放状态为准。")
    )
    limitations = product.limitations or (
        "当前能力以产品内实际开放范围为准，模型或外部服务可能需要额外配置。",
        *(() if product.public_url else ("此产品尚未开放公开体验入口。",)),
    )
    related_ids = product.related_ids or tuple(
        item.id for item in products if item.category == product.category and item.id != product.id
    )[:3]
    lookup = {item.id: item for item in app.visible_products(products)}
    related = [lookup[key] for key in related_ids if key in lookup][:4]
    related_html = (
        '<section class="show-related"><div class="show-heading"><div><p class="show-kicker">继续发现</p>'
        f'<h2>{esc(product.collection or "也许你还会喜欢")}</h2></div></div>'
        f'<div class="show-catalog-grid">{"".join(card(app, item) for item in related)}</div></section>'
        if related else ""
    )
    sticky = f'<div class="show-sticky"><span>{esc(product.name)}</span>{action}</div>' if product.public_url else ""
    body = f"""<main class="showroom show-detail {'has-sticky' if sticky else ''}" id="main-content">
 <a class="show-link show-back" data-catalog-back href="/products">← 返回产品目录</a>
 <section class="show-detail-hero">
  <div><div class="show-meta"><span>{esc(product.category)}</span><span class="status {esc(state)}"><i aria-hidden="true"></i>{esc(label)}</span></div>
   <h1>{esc(product.name)}</h1><p class="show-detail-tagline">{esc(product.tagline)}</p><p class="show-lead">{esc(product.summary)}</p>
   <div class="show-actions">{action}<a class="show-link" href="#highlights">看看有什么不同 ↓</a></div>
  </div>{visual(app, product, eager=True)}
 </section>
 <section class="show-audience"><div><p class="show-kicker">为谁而做</p><h2>适合谁？</h2><p>{esc(product.audience or "对这个方向感兴趣的用户")}</p></div>
  <div><p class="show-kicker">使用场景</p><p>{esc(product.scenario or product.tagline)}</p><span class="show-platform">{esc(" · ".join(product.platforms))}</span></div></section>
 <section id="highlights"><div class="show-heading"><div><p class="show-kicker">WHAT MAKES IT DIFFERENT</p><h2>核心亮点</h2></div></div><div class="show-features">{features}</div></section>
 <section class="show-start"><div><p class="show-kicker">GET STARTED</p><h2>如何开始</h2></div><ol>{"".join(f"<li>{esc(step)}</li>" for step in steps)}</ol></section>
 <section class="show-limits"><p class="show-kicker">保持透明</p><h2>当前能力与限制</h2><ul>{"".join(f"<li>{esc(item)}</li>" for item in limitations)}</ul></section>
 {related_html}
</main>{sticky}
<footer class="site-footer"><span>LifeYouMe · {esc(product.name)}</span><a href="/products" data-catalog-back>全部产品</a></footer>"""
    return app.page(product.name, body, portal=True, showroom=True)
