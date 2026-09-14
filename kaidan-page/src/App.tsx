import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  AlertTriangle,
  BadgeDollarSign,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Copy,
  Download,
  Eye,
  LayoutTemplate,
  Lightbulb,
  Menu,
  PencilLine,
  RotateCcw,
  Save,
  Share2,
  Sparkles,
  Store,
  Target,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  emptyOffer,
  exportHtml,
  normalizeOffer,
  Offer,
  pricingHealth,
  readiness,
  revenueProjection,
  shareCopy,
  templates,
} from "./domain";

const STORAGE_KEY = "kaidan-page-offer-v1";

type EditorTab = "offer" | "pricing" | "money";
type MobileView = "edit" | "preview";

function loadOffer(): Offer {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeOffer(JSON.parse(saved)) : templates.career;
  } catch {
    return templates.career;
  }
}

async function writeClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy failed");
}

const currency = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  maximumFractionDigits: 0,
});

function App() {
  const [offer, setOffer] = useState<Offer>(loadOffer);
  const [tab, setTab] = useState<EditorTab>("offer");
  const [orders, setOrders] = useState(10);
  const [pro, setPro] = useState(false);
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("edit");
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [previewPackage, setPreviewPackage] = useState(1);
  const [savedAt, setSavedAt] = useState("刚刚");
  const ready = useMemo(() => readiness(offer), [offer]);
  const priceHealth = useMemo(() => pricingHealth(offer), [offer]);
  const revenue = useMemo(
    () => revenueProjection(offer, orders, pro),
    [offer, orders, pro],
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(offer));
    setSavedAt(
      new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date()),
    );
  }, [offer]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const update = <K extends keyof Offer>(key: K, value: Offer[K]) => {
    setOffer((current) => ({ ...current, [key]: value }));
  };

  const updatePackage = (
    index: number,
    key: "name" | "price" | "description",
    value: string | number,
  ) => {
    setOffer((current) => {
      const packages = current.packages.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ) as Offer["packages"];
      return { ...current, packages };
    });
  };

  const downloadPage = () => {
    if (ready.score < 100) {
      const pricingFields = new Set(["三档价格", "交付周期"]);
      setTab(pricingFields.has(ready.missing[0]) ? "pricing" : "offer");
      setMobileView("edit");
      setReadinessOpen(true);
      setToast(`还差：${ready.missing.join("、")}`);
      return;
    }
    const blob = new Blob([exportHtml(offer)], { type: "text/html;charset=utf-8" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${offer.serviceName.replace(/\s+/g, "-") || "我的服务"}-售卖页.html`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    setToast("售卖页已导出");
  };

  const copyLaunch = async () => {
    try {
      await writeClipboard(shareCopy(offer));
      setToast("首发文案已复制");
    } catch {
      setToast("复制失败，请检查浏览器剪贴板权限");
    }
  };

  const confirmReset = () => {
    setOffer(structuredClone(emptyOffer));
    setTab("offer");
    setMobileView("edit");
    setReadinessOpen(true);
    setShowResetConfirm(false);
    setToast("已开始一项新服务");
  };

  return (
    <div className="app-shell">
      <aside className={mobileNav ? "sidebar sidebar-open" : "sidebar"}>
        <div className="brand-mark">
          <div className="brand-symbol">开</div>
          <div>
            <strong>开单页</strong>
            <span>Kaidan</span>
          </div>
          <button
            className="icon-button close-nav"
            onClick={() => setMobileNav(false)}
            aria-label="关闭导航"
          >
            <X size={18} />
          </button>
        </div>

        <nav aria-label="主导航">
          <button className="nav-item active">
            <Store size={18} />
            商品化工作台
          </button>
          <button className="nav-item" disabled>
            <Users size={18} />
            意向客户
            <span className="soon">下一阶段</span>
          </button>
          <button className="nav-item" disabled>
            <BarChart3 size={18} />
            经营数据
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="plan-box">
            <span>免费计划</span>
            <strong>1 个服务 · 3% 成交费</strong>
            <button onClick={() => setPro(true)}>
              升级 Pro
              <ArrowUpRight size={14} />
            </button>
          </div>
          <p>草稿已自动保存在此设备</p>
        </div>
      </aside>

      {mobileNav && <button className="nav-scrim" onClick={() => setMobileNav(false)} />}

      <main className="main-area">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobileNav(true)}
            aria-label="打开导航"
          >
            <Menu size={20} />
          </button>
          <div>
            <span className="eyebrow">服务 01</span>
            <h1>{offer.serviceName || "未命名服务"}</h1>
          </div>
          <div className="top-actions">
            <span className="save-state">
              <Save size={13} />
              已保存 {savedAt}
            </span>
            <button className="secondary-button" onClick={copyLaunch}>
              <Share2 size={16} />
              <span>复制首发文案</span>
            </button>
            <button className="primary-button" onClick={downloadPage}>
              <Download size={16} />
              <span>导出售卖页</span>
            </button>
          </div>
        </header>

        <section className="status-strip">
          <button
            className="readiness readiness-button"
            onClick={() => setReadinessOpen((current) => !current)}
            aria-expanded={readinessOpen}
          >
            <div
              className="score-ring"
              style={{ "--score": `${ready.score * 3.6}deg` } as React.CSSProperties}
            >
              <span>{ready.score}</span>
            </div>
            <div>
              <span>发布准备度</span>
              <strong>
                {ready.score === 100
                  ? "可以开卖"
                  : `还需补齐 ${ready.missing.length} 项`}
              </strong>
            </div>
            <ChevronRight
              size={15}
              className={readinessOpen ? "disclosure open" : "disclosure"}
            />
          </button>
          <div className="status-metric">
            <CircleDollarSign size={20} />
            <div>
              <span>主推客单价</span>
              <strong>{currency.format(offer.packages[1].price)}</strong>
            </div>
          </div>
          <div className="status-metric">
            <Target size={20} />
            <div>
              <span>月目标到手</span>
              <strong>{currency.format(revenue.net)}</strong>
            </div>
          </div>
          <button
            className="reset-button"
            onClick={() => setShowResetConfirm(true)}
            title="创建新服务"
            aria-label="创建新服务"
          >
            <RotateCcw size={16} />
          </button>
        </section>

        {readinessOpen && (
          <section className="readiness-panel" aria-label="发布检查">
            <div>
              {ready.score === 100 ? (
                <CheckCircle2 size={18} />
              ) : (
                <AlertTriangle size={18} />
              )}
              <span>
                <strong>{ready.score === 100 ? "发布信息完整" : "发布前补齐"}</strong>
                {ready.score === 100
                  ? "售卖页已经具备价格、交付与联系闭环。"
                  : "点击缺项可回到对应步骤。"}
              </span>
            </div>
            <div className="missing-list">
              {ready.score === 100 ? (
                <span className="complete-chip">
                  <Check size={13} />
                  10 项检查通过
                </span>
              ) : (
                ready.missing.map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      setTab(
                        item === "三档价格" || item === "交付周期"
                          ? "pricing"
                          : "offer",
                      );
                      setMobileView("edit");
                    }}
                  >
                    {item}
                    <ChevronRight size={13} />
                  </button>
                ))
              )}
            </div>
          </section>
        )}

        <div className="mobile-view-switch" role="group" aria-label="移动端视图">
          <button
            className={mobileView === "edit" ? "active" : ""}
            onClick={() => setMobileView("edit")}
          >
            <PencilLine size={15} />
            编辑
          </button>
          <button
            className={mobileView === "preview" ? "active" : ""}
            onClick={() => setMobileView("preview")}
          >
            <Eye size={15} />
            预览
          </button>
          <span className="mobile-save-state">
            <Save size={12} />
            已保存 {savedAt}
          </span>
        </div>

        <div className="workspace">
          <section
            className={
              mobileView === "edit" ? "editor-panel" : "editor-panel mobile-view-hidden"
            }
          >
            <div className="template-row">
              <span>
                <LayoutTemplate size={15} />
                快速开始
              </span>
              <div>
                <button onClick={() => setOffer(structuredClone(templates.career))}>
                  简历诊断
                </button>
                <button onClick={() => setOffer(structuredClone(templates.design))}>
                  视觉设计
                </button>
                <button onClick={() => setOffer(structuredClone(templates.automation))}>
                  AI 自动化
                </button>
              </div>
            </div>

            <div className="tabs" role="tablist">
              <button
                role="tab"
                aria-selected={tab === "offer"}
                className={tab === "offer" ? "active" : ""}
                onClick={() => setTab("offer")}
              >
                1 服务定位
              </button>
              <button
                role="tab"
                aria-selected={tab === "pricing"}
                className={tab === "pricing" ? "active" : ""}
                onClick={() => setTab("pricing")}
              >
                2 报价方案
              </button>
              <button
                role="tab"
                aria-selected={tab === "money"}
                className={tab === "money" ? "active" : ""}
                onClick={() => setTab("money")}
              >
                3 收入测算
              </button>
            </div>

            {tab === "offer" && (
              <div className="form-body">
                <div className="field-grid">
                  <label>
                    <span>你的称呼</span>
                    <input
                      value={offer.sellerName}
                      onChange={(event) => update("sellerName", event.target.value)}
                      placeholder="例如：小林"
                    />
                  </label>
                  <label>
                    <span>服务名称</span>
                    <input
                      value={offer.serviceName}
                      onChange={(event) => update("serviceName", event.target.value)}
                      placeholder="一句话说清你卖什么"
                    />
                  </label>
                </div>
                <label>
                  <span>最适合谁</span>
                  <textarea
                    value={offer.audience}
                    onChange={(event) => update("audience", event.target.value)}
                    placeholder="描述一个具体、正在为问题付出代价的人"
                  />
                </label>
                <label>
                  <span>买完得到什么结果</span>
                  <textarea
                    value={offer.promise}
                    onChange={(event) => update("promise", event.target.value)}
                    placeholder="写结果，不写空泛能力"
                  />
                </label>
                <label>
                  <span>为什么相信你</span>
                  <input
                    value={offer.proof}
                    onChange={(event) => update("proof", event.target.value)}
                    placeholder="经验、案例、方法或真实数字"
                  />
                </label>
                <div className="contact-grid">
                  <label>
                    <span>联系方式类型</span>
                    <select
                      value={offer.contactLabel}
                      onChange={(event) => update("contactLabel", event.target.value)}
                    >
                      <option>微信</option>
                      <option>邮箱</option>
                      <option>电话</option>
                    </select>
                  </label>
                  <label>
                    <span>买家如何联系你</span>
                    <input
                      value={offer.contactValue}
                      onChange={(event) => update("contactValue", event.target.value)}
                      placeholder="微信号、邮箱或手机号"
                    />
                  </label>
                  <label>
                    <span>行动按钮文字</span>
                    <input
                      value={offer.ctaText}
                      onChange={(event) => update("ctaText", event.target.value)}
                      placeholder="例如：预约一个名额"
                    />
                  </label>
                </div>
                <fieldset>
                  <legend>交付内容</legend>
                  {offer.deliverables.map((item, index) => (
                    <div className="deliverable" key={index}>
                      <Check size={15} />
                      <input
                        aria-label={`交付内容 ${index + 1}`}
                        value={item}
                        onChange={(event) => {
                          const next = [...offer.deliverables];
                          next[index] = event.target.value;
                          update("deliverables", next);
                        }}
                        placeholder={`交付项 ${index + 1}`}
                      />
                    </div>
                  ))}
                </fieldset>
                <button className="next-button" onClick={() => setTab("pricing")}>
                  设置三档报价
                  <ChevronRight size={17} />
                </button>
              </div>
            )}

            {tab === "pricing" && (
              <div className="form-body">
                <div className="pricing-editor">
                  {offer.packages.map((item, index) => (
                    <article key={index} className={index === 1 ? "recommended" : ""}>
                      {index === 1 && <em>主推</em>}
                      <label>
                        <span>方案名</span>
                        <input
                          value={item.name}
                          onChange={(event) =>
                            updatePackage(index, "name", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <span>价格</span>
                        <div className="money-input">
                          <b>¥</b>
                          <input
                            type="number"
                            min="0"
                            value={item.price}
                            onChange={(event) =>
                              updatePackage(index, "price", Number(event.target.value))
                            }
                          />
                        </div>
                      </label>
                      <label>
                        <span>包含什么</span>
                        <textarea
                          value={item.description}
                          onChange={(event) =>
                            updatePackage(index, "description", event.target.value)
                          }
                        />
                      </label>
                    </article>
                  ))}
                </div>
                <div className={priceHealth.ascending ? "price-health good" : "price-health"}>
                  {priceHealth.ascending ? (
                    <CheckCircle2 size={17} />
                  ) : (
                    <AlertTriangle size={17} />
                  )}
                  <span>{priceHealth.message}</span>
                </div>
                <div className="field-grid">
                  <label>
                    <span>交付周期（天）</span>
                    <input
                      type="number"
                      min="1"
                      value={offer.deliveryDays}
                      onChange={(event) => update("deliveryDays", Number(event.target.value))}
                    />
                  </label>
                  <label>
                    <span>每月最多接单</span>
                    <input
                      type="number"
                      min="1"
                      value={offer.monthlyCapacity}
                      onChange={(event) =>
                        update("monthlyCapacity", Number(event.target.value))
                      }
                    />
                  </label>
                </div>
                <button className="next-button" onClick={() => setTab("money")}>
                  测算能赚多少
                  <ChevronRight size={17} />
                </button>
              </div>
            )}

            {tab === "money" && (
              <div className="form-body money-panel">
                <div className="orders-control">
                  <label htmlFor="orders">每月预计成交</label>
                  <strong>{orders} 单</strong>
                  <input
                    id="orders"
                    type="range"
                    min="1"
                    max="50"
                    value={orders}
                    onChange={(event) => setOrders(Number(event.target.value))}
                  />
                  <div>
                    <span>1</span>
                    <span>50</span>
                  </div>
                </div>
                <label className="field-inline">
                  <span>每单投入时间</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={offer.hoursPerOrder}
                    onChange={(event) =>
                      update("hoursPerOrder", Number(event.target.value))
                    }
                  />
                  <b>小时</b>
                </label>
                <div className="money-grid">
                  <article>
                    <span>预计营收</span>
                    <strong>{currency.format(revenue.gross)}</strong>
                  </article>
                  <article>
                    <span>{pro ? "Pro 订阅" : "平台费 3%"}</span>
                    <strong>-{currency.format(revenue.platformFee)}</strong>
                  </article>
                  <article className="net-card">
                    <span>预计到手</span>
                    <strong>{currency.format(revenue.net)}</strong>
                  </article>
                </div>
                {revenue.overCapacity ? (
                  <div className="warning">
                    <Lightbulb size={18} />
                    当前目标超过每月 {offer.monthlyCapacity} 单产能。先涨价或缩短交付，
                    不要用透支兑现增长。
                  </div>
                ) : (
                  <div className="positive">
                    <CheckCircle2 size={18} />
                    预计投入 {revenue.hours} 小时，在当前产能范围内。
                  </div>
                )}
                <button
                  className={pro ? "plan-toggle selected" : "plan-toggle"}
                  onClick={() => setPro((current) => !current)}
                >
                  <WalletCards size={18} />
                  <span>
                    <strong>Pro ¥29/月</strong>
                    {revenue.proSaves > 0
                      ? `当前销量每月可少付 ${currency.format(revenue.proSaves)}`
                      : "月营收超过 ¥967 时更省"}
                  </span>
                  <span className="toggle" aria-hidden="true" />
                </button>
                <div className="first-actions">
                  <span>今天完成</span>
                  <ol>
                    <li>发给 3 位曾向你请教这项技能的人</li>
                    <li>把售卖页发到一个熟人可见的社交圈</li>
                    <li>给首位客户一个明确截止日期的体验价</li>
                  </ol>
                </div>
              </div>
            )}
          </section>

          <aside
            className={
              mobileView === "preview"
                ? "preview-panel"
                : "preview-panel mobile-view-hidden"
            }
          >
            <div className="preview-heading">
              <div>
                <span className="eyebrow">买家视角</span>
                <h2>实时售卖页</h2>
              </div>
              <span className="live-dot">实时</span>
            </div>
            <div className="phone-frame">
              <div className="phone-bar">
                <span>9:41</span>
                <span>kaidan.page</span>
              </div>
              <div className="storefront">
                <div className="cover-art" aria-label="服务品牌封面">
                  <span>{(offer.sellerName || "开").slice(0, 1)}</span>
                  <div>
                    <small>ONE PERSON BUSINESS</small>
                    <strong>把专业<br />变成结果</strong>
                  </div>
                </div>
                <div className="storefront-body">
                  <span className="seller">{offer.sellerName || "你的名字"} · 专业服务</span>
                  <h2>{offer.serviceName || "给你的服务起一个好名字"}</h2>
                  <p className="promise">
                    {offer.promise || "写下客户购买后能获得的明确结果。"}
                  </p>
                  <div className="audience">
                    <Target size={15} />
                    <p>{offer.audience || "这项服务最适合谁？"}</p>
                  </div>
                  <h3>这次会交付</h3>
                  <ul>
                    {offer.deliverables.filter(Boolean).map((item) => (
                      <li key={item}>
                        <Check size={14} />
                        {item}
                      </li>
                    ))}
                    {!offer.deliverables.some(Boolean) && <li>添加至少两项明确交付</li>}
                  </ul>
                  <p className="delivery-line">
                    {offer.deliveryDays} 天内交付 · 每月限量 {offer.monthlyCapacity} 单
                  </p>
                  <div className="package-tabs" aria-label="方案选择">
                    {offer.packages.map((item, index) => (
                      <button
                        key={`${item.name}-${index}`}
                        className={previewPackage === index ? "active" : ""}
                        onClick={() => setPreviewPackage(index)}
                      >
                        {item.name || `方案 ${index + 1}`}
                      </button>
                    ))}
                  </div>
                  <div className="package-strip">
                    <span>{offer.packages[previewPackage].name || "未命名方案"}</span>
                    <strong>¥{offer.packages[previewPackage].price || 0}</strong>
                    <small>
                      {offer.packages[previewPackage].description || "说明包含的内容"}
                    </small>
                  </div>
                  <button>{offer.ctaText || "咨询下单"}</button>
                  <p className="trust-line">
                    <BadgeDollarSign size={13} />
                    {offer.proof || "补充一条可信依据"}
                  </p>
                  <p className="contact-line">
                    <span>{offer.contactLabel || "联系方式"}</span>
                    <strong>{offer.contactValue || "等待卖家补充"}</strong>
                  </p>
                  <small className="powered">用「开单页」创建你的第一张售卖页</small>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <section className="action-dock">
          <div>
            <Sparkles size={18} />
            <span>
              <strong>{ready.score === 100 ? "今天拿首单" : "先完成售卖页"}</strong>
              {ready.score === 100
                ? "发给 3 位曾向你请教过这项技能的人"
                : `还有 ${ready.missing.length} 项发布信息需要补齐`}
            </span>
          </div>
          <button
            onClick={() => {
              if (ready.score === 100) {
                void copyLaunch();
              } else {
                setReadinessOpen(true);
                setMobileView("edit");
              }
            }}
          >
            {ready.score === 100 ? <Copy size={16} /> : <ChevronRight size={16} />}
            {ready.score === 100 ? "复制行动文案" : "查看缺项"}
          </button>
        </section>
      </main>

      {showResetConfirm && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
          >
            <button
              className="icon-button"
              onClick={() => setShowResetConfirm(false)}
              aria-label="关闭确认框"
            >
              <X size={18} />
            </button>
            <span className="modal-kicker">NEW OFFER</span>
            <h2 id="reset-title">创建新服务？</h2>
            <p>当前草稿会被清空。已导出的售卖页不受影响。</p>
            <div>
              <button
                className="secondary-button"
                onClick={() => setShowResetConfirm(false)}
              >
                继续编辑
              </button>
              <button className="danger-button" onClick={confirmReset}>
                清空并创建
              </button>
            </div>
          </section>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;
