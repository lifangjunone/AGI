import './style.css';
import './workbench.css';
import * as mobilenet from '@tensorflow-models/mobilenet';
import '@tensorflow/tfjs';

const LEGACY_STORAGE_KEY = 'travel-frame-state-v2';
const ACCOUNT_STORAGE_PREFIX = 'travel-frame-state-v2:user:';
const LEGACY_OWNER_KEY = 'travel-frame-legacy-owner';
const AUTH_ORIGIN = 'https://auth.lifeyoume.icu';
let activeStorageKey = LEGACY_STORAGE_KEY;
const VISION_VERSION = 1;
const defaultCategories = ['风光', '人物', '建筑', '动物', '美食', '城市', '交通', '植物', '亲子', '截图', '其他'];
const demoPhotos = [
  { id: 1, demo: true, title: '湖畔晨光', time: '09-18 06:42', place: '喀纳斯', type: '风光', people: '无人物', action: '日出', score: 96, x: 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=900&q=80' },
  { id: 2, demo: true, title: '木屋与松林', time: '09-18 06:45', place: '喀纳斯', type: '建筑', people: '无人物', action: '漫步', score: 88, x: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80' },
  { id: 3, demo: true, title: '风里的笑脸', time: '09-18 14:20', place: '禾木村', type: '人物', people: '小林', action: '回头', score: 94, x: 'https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?auto=format&fit=crop&w=900&q=80' },
  { id: 4, demo: true, title: '山谷公路', time: '09-19 10:06', place: '独库公路', type: '风光', people: '无人物', action: '自驾', score: 91, x: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=80' },
  { id: 5, demo: true, title: '天池倒影', time: '09-19 16:31', place: '赛里木湖', type: '风光', people: '2 人', action: '驻足', score: 97, x: 'https://images.unsplash.com/photo-1439853949127-fa647821eba0?auto=format&fit=crop&w=900&q=80' },
  { id: 6, demo: true, title: '草原上的马', time: '09-20 09:18', place: '那拉提', type: '动物', people: '无人物', action: '奔跑', score: 89, x: 'https://images.unsplash.com/photo-1501700493788-fa1a4fc9fe62?auto=format&fit=crop&w=900&q=80' },
  { id: 7, demo: true, title: '黄昏野餐', time: '09-20 19:04', place: '那拉提', type: '人物', people: '小林、阿北', action: '举杯', score: 93, x: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=900&q=80' },
  { id: 8, demo: true, title: '归途云层', time: '09-21 11:43', place: '伊犁', type: '风光', people: '无人物', action: '飞行', score: 86, x: 'https://images.unsplash.com/photo-1499346030926-9a72daac6c63?auto=format&fit=crop&w=900&q=80' }
];

let state = loadState();
let tab = 'home';
let workMode = 'picks';
let filter = '全部';
let search = '';
let activePhoto = null;
let zoomed = false;
let onlySelected = false;
let activeGroup = state.duplicateGroups[0]?.id || '';
let storageWarning = '';
let visionModelPromise = null;
let analyzingCount = 0;
let albumDialog = null;
let currentUser = null;
let accountMenuOpen = false;

const app = document.querySelector('#app');
const findPhoto = id => state.photos.find(p => String(p.id) === String(id));
const userPhotos = () => state.photos.filter(p => !p.demo);
const workspacePhotos = () => userPhotos().length ? userPhotos() : state.photos;
const totalPhotos = () => workspacePhotos().length;
const selectedCount = () => state.selected.filter(id => workspacePhotos().some(p => String(p.id) === String(id))).length;
const filters = () => ['全部', ...state.categories];
const persist = () => {
  try {
    state.albumSchemaVersion = 2;
    localStorage.setItem(activeStorageKey, JSON.stringify(state));
    storageWarning = '';
  } catch {
    storageWarning = '浏览器本地空间已满，后续照片可能无法保存；建议减少单次上传数量。';
  }
};
const hasSelected = id => state.selected.includes(id);
const setIncludes = (list, id) => list.some(x => String(x) === String(id));

function loadState(storageKey = activeStorageKey) {
  const fallback = {
    photos: demoPhotos,
    categories: defaultCategories,
    selected: [1, 3, 4, 5, 7],
    completedDuplicateGroups: [],
    reviewPending: [2, 6, 8],
    albums: [],
    duplicateGroups: [
      { id: 'lake', title: '湖边连拍', reason: 'AI 建议保留光线最好、主体最稳的一张', ids: [5, 1, 8], keep: 5 },
      { id: 'people', title: '人物回头连拍', reason: '闭眼与轻微糊片已自动降权', ids: [3, 7, 2], keep: 3 },
      { id: 'road', title: '公路视角', reason: '构图线条最完整的照片被设为 Top Pick', ids: [4, 6, 8], keep: 4 }
    ]
  };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!saved || !Array.isArray(saved.photos)) return fallback;
    const legacyAlbums = Array.isArray(saved.albums)
      ? saved.albums
      : (saved.customAlbums || []).map((name, index) => ({
          id: `legacy-${index}-${Date.now()}`,
          name,
          description: '',
          photoIds: [],
          createdAt: new Date().toISOString()
        }));
    const merged = {
      ...fallback,
      ...saved,
      photos: [...saved.photos.filter(p => !p.demo), ...demoPhotos],
      categories: unique([...(saved.categories || []), ...defaultCategories]),
      selected: unique(saved.selected || fallback.selected),
      reviewPending: unique(saved.reviewPending || fallback.reviewPending),
      albums: legacyAlbums
        .map(normalizeAlbum)
        .filter(album => saved.albumSchemaVersion >= 2 || !isLegacySystemAlbum(album)),
      albumSchemaVersion: 2,
      duplicateGroups: saved.duplicateGroups || fallback.duplicateGroups
    };
    const ownIds = merged.photos.filter(p => !p.demo).map(p => p.id);
    merged.photos = merged.photos.map(p => p.demo ? p : migrateUploadedPhoto(p));
    merged.reviewPending = merged.reviewPending.filter(id => !ownIds.some(ownId => String(ownId) === String(id)));
    return merged;
  } catch {
    return fallback;
  }
}

function normalizeAlbum(album, index = 0) {
  if (typeof album === 'string') {
    return { id: `album-${index}-${Date.now()}`, name: album, description: '', photoIds: [], createdAt: new Date().toISOString() };
  }
  return {
    id: album.id || `album-${index}-${Date.now()}`,
    name: album.name || '未命名相册',
    description: album.description || '',
    photoIds: unique(album.photoIds || []),
    createdAt: album.createdAt || new Date().toISOString()
  };
}

function isLegacySystemAlbum(album) {
  return album.name === '识别异常'
    || album.name === '分类与标签'
    || /^我的旅行(?:\s+\d{4})?$/.test(album.name);
}

function migrateUploadedPhoto(photo) {
  if (photo.visionVersion === VISION_VERSION) return photo;
  return {
    ...photo,
    type: '分析中',
    people: '分析中',
    action: '分析中',
    place: /^待确认/.test(photo.place || '') ? '地点未识别' : photo.place,
    aiConfidence: 0,
    aiAnalyzed: false,
    visionLabels: []
  };
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function loadVisionModel() {
  if (!visionModelPromise) {
    visionModelPromise = mobilenet.load({ version: 2, alpha: 1.0 }).catch(error => {
      visionModelPromise = null;
      throw error;
    });
  }
  return visionModelPromise;
}

const categoryRules = [
  ['美食', /\b(food|dish|plate|meat|steak|barbecue|barbeque|grill|hotdog|hamburger|pizza|potpie|restaurant|dining|bakery|bread|cake|dessert|coffee|espresso|wine|beer|fruit|vegetable|broccoli|cauliflower|cabbage|corn|mushroom|noodle|soup|chocolate|ice cream|cheeseburger|sandwich|burrito|guacamole|carbonara|consomme|trifle|custard apple|banana|orange|lemon|pineapple|strawberry|apple)\b/i],
  ['人物', /\b(person|people|man|woman|boy|girl|bridegroom|groom|scuba diver|ballplayer|swimmer|runner|skier|cowboy|military uniform|academic gown|maillot|bikini)\b/i],
  ['动物', /\b(dog|cat|bird|horse|pony|cow|ox|sheep|goat|pig|bear|panda|monkey|ape|elephant|lion|tiger|leopard|fox|wolf|rabbit|hamster|squirrel|fish|shark|whale|dolphin|turtle|snake|lizard|insect|butterfly|bee|spider|hen|cock|duck|goose|eagle|owl)\b/i],
  ['交通', /\b(car|taxi|cab|bus|truck|van|jeep|motorcycle|bicycle|bike|train|locomotive|airliner|aircraft|plane|ship|boat|canoe|kayak|scooter|tractor|ambulance|fire engine|minibus|sports car|convertible)\b/i],
  ['建筑', /\b(building|palace|castle|church|monastery|mosque|temple|tower|bridge|house|home|cottage|villa|hotel|restaurant|library|cinema|theater|barn|greenhouse|dome|arch|column|obelisk|lighthouse)\b/i],
  ['城市', /\b(street|road|traffic light|parking meter|crosswalk|shopping cart|shop|store|market|fountain|plaza|dock|promontory)\b/i],
  ['植物', /\b(flower|daisy|rose|orchid|sunflower|tree|plant|pot|garden|greenhouse|rapeseed|corn|mushroom)\b/i],
  ['风光', /\b(mountain|alp|valley|volcano|cliff|seashore|coast|beach|lakeside|lake|river|waterfall|geyser|coral reef|sandbar|desert|forest|woodland|field|meadow|sky|sunset|sunrise|snow|iceberg|promontory)\b/i]
];

function mapVisionResult(predictions) {
  const normalized = predictions.map(item => ({
    label: item.className,
    probability: item.probability
  }));
  for (const [category, pattern] of categoryRules) {
    const match = normalized.find(item => pattern.test(item.label));
    if (match) {
      return {
        type: category,
        people: category === '人物' ? '画面中有人物' : '无人物',
        action: category === '美食' ? '用餐记录' : category === '人物' ? '旅行留影' : category === '交通' ? '出行' : '旅行记录',
        aiConfidence: match.probability,
        visionLabels: normalized
      };
    }
  }
  return {
    type: '其他',
    people: '未检测到人物',
    action: '旅行记录',
    aiConfidence: normalized[0]?.probability || 0,
    visionLabels: normalized
  };
}

function imageForPrediction(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function analyzePhoto(photo) {
  try {
    const [model, image] = await Promise.all([loadVisionModel(), imageForPrediction(photo.x)]);
    const predictions = await model.classify(image, 5);
    Object.assign(photo, mapVisionResult(predictions), {
      aiAnalyzed: true,
      analysisError: '',
      visionVersion: VISION_VERSION
    });
  } catch (error) {
    Object.assign(photo, {
      type: '分析失败',
      people: '未分析',
      action: '未分析',
      aiAnalyzed: false,
      analysisError: '视觉模型加载失败，请稍后点“重新分析”',
      visionLabels: []
    });
  }
}

async function analyzeUserPhotos(photos, { notify = true } = {}) {
  const targets = photos.filter(photo => !photo.demo);
  if (!targets.length) return;
  analyzingCount += targets.length;
  render();
  await Promise.all(targets.map(analyzePhoto));
  analyzingCount = Math.max(0, analyzingCount - targets.length);
  persist();
  render();
  if (notify) toast(targets.some(p => p.analysisError) ? '部分照片分析失败，可稍后重新分析' : `已看图完成 ${targets.length} 张照片分类`);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match]));
}

function list() {
  const keyword = search.trim();
  return workspacePhotos().filter(p =>
    (!onlySelected || hasSelected(p.id)) &&
    (filter === '全部' || p.type === filter) &&
    `${p.title}${p.place}${p.type}${p.people}${p.action}${p.note || ''}${p.album || ''}`.includes(keyword)
  );
}

function card(p, compact = false) {
  return `<article class="photo-card ${compact ? 'compact' : ''}" data-photo="${p.id}">
    <img src="${p.x}" alt="${escapeHtml(p.title)}">
    <span class="score-badge">${p.type === '分析中' ? '分析中' : `${p.score}分`}</span>
    ${hasSelected(p.id) ? '<span class="chosen">✓ 已入选</span>' : ''}
    ${p.demo ? '<span class="demo-badge">示例</span>' : ''}
    <div class="photo-label"><b>${escapeHtml(p.title)}</b><span>${escapeHtml(p.place)} · ${escapeHtml(p.time)}</span></div>
  </article>`;
}

function home() {
  const hero = workspacePhotos()[0] || demoPhotos[4];
  const pending = state.reviewPending.filter(id => workspacePhotos().some(p => String(p.id) === String(id))).length;
  return `<section class="page home-page">
    ${storageWarning ? `<div class="warning-bar">${storageWarning}</div>` : ''}
    <div class="hero"><div class="welcome"><p>${userPhotos().length ? `已保存 ${userPhotos().length} 张你的照片` : '可以先体验示例，也可以上传自己的旅行照片'}</p><h1>把旅行的美好，<br>好好留下来。</h1><label class="primary-button hero-upload">上传旅行照片<input id="hero-upload" type="file" accept="image/*" multiple hidden></label></div><div class="hero-photo"><img src="${hero.x}" alt="旅行照片"><div><span>${userPhotos().length ? '智能图库' : '示例图库'}</span><b>${userPhotos().length ? '我的全部照片' : '风和旷野'}</b><small>${totalPhotos()} 张照片 · ${selectedCount()} 张精选</small></div></div></div>
    <section class="section-block"><div class="section-head"><div><h2>已经为你整理好</h2><p>${pending ? `仅有 ${pending} 张识别置信度较低，不影响其他照片使用` : '照片已自动分类和评分，你只需要看结果，不需要逐张确认'}</p></div><button class="plain-button" data-work="picks">查看全部 ›</button></div>
      <div class="task-row">
        <button class="task-card" data-work="picks"><span class="task-icon pink">✦</span><b>旅行精选</b><strong>${selectedCount()}<em>张</em></strong><small>从 ${totalPhotos()} 张中挑出</small><i>去看看 ›</i></button>
        <button class="task-card" data-work="duplicates"><span class="task-icon purple">⊙</span><b>相似照片</b><strong>${userPhotos().length ? 0 : state.duplicateGroups.length - state.completedDuplicateGroups.length}<em>组</em></strong><small>${userPhotos().length ? '暂未发现需要处理的连拍' : '每组已选出最佳一张'}</small><i>去整理 ›</i></button>
        <button class="task-card" data-work="review"><span class="task-icon yellow">!</span><b>识别异常</b><strong>${pending}<em>张</em></strong><small>${pending ? 'AI 已给默认结果，可选修正' : '没有需要你处理的照片'}</small><i>${pending ? '查看 ›' : '已完成 ✓'}</i></button>
      </div>
    </section>
    <section class="section-block"><div class="section-head"><div><h2>分类总览</h2><p>支持新增用户自己的类别，例如“亲子”“露营”“美食打卡”。</p></div><button class="plain-button" data-work="tags">管理标签 ›</button></div>${tagOverview()}</section>
    <section class="section-block trip-section"><div class="section-head"><div><h2>我的相册</h2><p>相册由你创建；系统不会自动把照片塞进新相册。</p></div><button class="plain-button" data-tab="albums">管理相册 ›</button></div><div class="trip-card" data-tab="albums"><img src="${state.albums[0]?.photoIds?.length ? findPhoto(state.albums[0].photoIds[0])?.x || hero.x : hero.x}" alt="相册"><div class="trip-gradient"></div><div class="trip-info"><span>${state.albums.length ? `${state.albums.length} 个相册` : '尚未创建相册'}</span><h3>${state.albums[0]?.name || '把喜欢的照片收进相册'}</h3><p>${state.albums[0]?.description || '创建空相册后，再选择要加入的照片'}</p><b>${state.albums[0]?.photoIds?.length || 0} 张照片</b></div></div></section>
  </section>`;
}

function topPlaces() {
  return unique(workspacePhotos().map(p => p.place).filter(p => !/^待确认|未命名|地点未识别/.test(p))).slice(0, 4);
}

function tagOverview() {
  const items = [
    ['地点', topPlaces().join(' / ') || '照片没有位置数据', '⌖'],
    ['人物', topValues('people').join(' / ') || '待识别人物', '◎'],
    ['景色', state.categories.slice(0, 5).join(' / '), '▦'],
    ['动作', topValues('action').join(' / ') || '待识别动作', '↗']
  ];
  return `<div class="tag-overview">${items.map(i => `<button data-work="tags"><span>${i[2]}</span><b>${i[0]}</b><small>${escapeHtml(i[1])}</small></button>`).join('')}</div>`;
}

function topValues(key) {
  return unique(workspacePhotos().map(p => p[key]).filter(v => v && !/^待识别|无人物/.test(v))).slice(0, 4);
}

function sort() {
  return `<section class="page sort-page">
    <div class="sort-header"><div><p class="crumb">智能图库</p><h1>智能整理</h1><span>${analyzingCount ? `正在用本地视觉模型分析 ${analyzingCount} 张照片…` : `${totalPhotos()} 张照片已整理，照片与结果保存在本机`}</span></div><button class="outline-button" id="analyze" ${analyzingCount ? 'disabled' : ''}>${analyzingCount ? '分析中…' : '↻ 重新分析'}</button></div>
    <div class="work-tabs">
      ${[['picks','精选'],['duplicates','相似组'],['tags','分类结果'],['review','识别异常']].map(x => `<button class="${workMode === x[0] ? 'active' : ''}" data-mode="${x[0]}">${x[1]}</button>`).join('')}
    </div>
    ${workMode === 'duplicates' ? duplicateView() : workMode === 'tags' ? tagsView() : workMode === 'review' ? reviewView() : picksView()}
  </section>`;
}

function picksView() {
  const thumbIds = state.selected.slice(0, 3);
  return `<section class="recommend"><div class="recommend-copy"><span class="spark">✦</span><div><b>为你挑出了 ${selectedCount()} 张旅行精选</b><p>上传照片、手动标记、新增类别都会参与筛选</p></div><button id="review-picks">去查看</button></div><div class="recommend-thumbs">${thumbIds.map(id => findPhoto(id)).filter(Boolean).map(p => `<img src="${p.x}" alt="精选">`).join('')}</div></section>
    <div class="filter-strip"><div>${filters().map(f=>`<button class="filter ${filter===f?'active':''}" data-filter="${escapeHtml(f)}">${escapeHtml(f)}</button>`).join('')}</div><button class="sort-button" id="sort-time">按拍摄时间⌄</button></div>
    <div class="explain"><span>✦</span><p>系统已经给出自动整理结果。你可以直接浏览；只有发现错误时，才需要点开照片修改。</p></div>
    ${list().length ? `<div class="photo-grid">${list().map(p => card(p)).join('')}</div>` : `<div class="done-state"><b>没有匹配的照片</b><span>换个关键词，或清空搜索后再试。</span><button class="secondary-button" id="clear-search">清空搜索</button></div>`}`;
}

function duplicateView() {
  if (userPhotos().length) return '<div class="done-state"><b>没有需要你处理的相似照片</b><span>当前上传照片未发现明显连拍组；后续检测到时会自动保留最佳一张。</span></div>';
  const group = state.duplicateGroups.find(g => g.id === activeGroup) || state.duplicateGroups[0];
  if (!group) return '<div class="done-state"><b>暂无相似照片组</b><span>上传更多照片后可以继续整理。</span></div>';
  const done = state.completedDuplicateGroups.includes(group.id);
  return `<div class="duplicate-layout">
    <aside class="group-list">${state.duplicateGroups.map(g => `<button class="${g.id === activeGroup ? 'active' : ''}" data-group="${g.id}"><b>${escapeHtml(g.title)}${state.completedDuplicateGroups.includes(g.id) ? ' ✓' : ''}</b><span>${g.ids.length} 张 · 保留 ${escapeHtml(findPhoto(g.keep)?.title || '待选择')}</span></button>`).join('')}</aside>
    <section class="group-detail"><div class="section-head"><div><h2>${escapeHtml(group.title)}</h2><p>${done ? '这一组已经确认保留方案，可继续调整。' : group.reason}</p></div><button class="${done ? 'selected-button' : 'primary-button'}" id="keep-best">${done ? '已完成整理' : '只保留 Top Pick'}</button></div>
      <div class="top-pick"><img src="${findPhoto(group.keep)?.x || ''}" alt="Top Pick"><div><span>Top Pick</span><b>${escapeHtml(findPhoto(group.keep)?.title || '待选择')}</b><p>${findPhoto(group.keep)?.score || '-'} 分 · ${escapeHtml(findPhoto(group.keep)?.place || '')} · ${escapeHtml(findPhoto(group.keep)?.type || '')}</p></div></div>
      <div class="stack-grid">${group.ids.map(id => findPhoto(id)).filter(Boolean).map(p => `<div class="stack-item ${p.id === group.keep ? 'keep' : ''}">${card(p, true)}<button data-keep="${p.id}">${p.id === group.keep ? '当前保留' : '改为保留'}</button></div>`).join('')}</div>
    </section>
  </div>`;
}

function tagsView() {
  return `<div class="tag-workbench"><div class="section-head"><div><h2>自动分类结果</h2><p>默认直接使用整理结果；发现不准确时再修改，也可以新增自己的类别。</p></div></div>
    ${tagOverview()}
    <div class="category-manager"><div><b>景色/内容类别</b><p>${state.categories.map(c => `<button class="category-chip" data-filter="${escapeHtml(c)}">${escapeHtml(c)}<span>${workspacePhotos().filter(p => p.type === c).length}</span></button>`).join('')}</p></div><form id="category-form"><input id="new-category" maxlength="12" placeholder="新增类别，如：露营"><button class="primary-button">添加</button></form></div>
    <div class="tag-table">${workspacePhotos().map(p => `<button data-photo="${p.id}"><img src="${p.x}" alt="${escapeHtml(p.title)}"><b>${escapeHtml(p.title)}</b><span>${escapeHtml(p.place)}</span><em>${escapeHtml(p.type)}</em><small>${p.visionLabels?.length ? `识别：${escapeHtml(p.visionLabels.slice(0, 2).map(x => x.label).join(' / '))}` : escapeHtml(p.analysisError || `${p.people} · ${p.action}`)}</small></button>`).join('')}</div></div>`;
}

function reviewView() {
  const ids = state.reviewPending.filter(id => workspacePhotos().some(p => String(p.id) === String(id)));
  return `<div class="review-panel"><h2>识别异常</h2><p>这里只放极少数无法可靠读取或识别的照片。没有异常时，你什么都不用做。</p>${ids.length ? `<div class="review-list">${ids.map(id => `<button data-photo="${id}"><img src="${findPhoto(id).x}" alt="${escapeHtml(findPhoto(id).title)}"><span><b>${escapeHtml(findPhoto(id).title)}</b><small>AI 已给出默认结果，你可以选择是否修正</small></span><em>可选修正</em></button>`).join('')}</div>` : '<div class="done-state"><b>不需要你确认</b><span>所有照片已经自动完成基础分类。</span></div>'}</div>`;
}

function mapView() {
  const places = topPlaces();
  return `<section class="page map-page"><div class="section-head"><div><h2>旅行地图</h2><p>按照片可读取的拍摄地点自动整理路线。</p></div></div><div class="map-card"><div class="map-route">${(places.length ? places : ['暂无位置数据']).map((p, i) => `<button data-place="${escapeHtml(p)}"><span>${i + 1}</span><b>${escapeHtml(p)}</b><small>${workspacePhotos().filter(x => x.place === p).length} 张</small></button>`).join('')}</div><div class="map-panel"><b>我的旅行路线</b><p>${places.length ? places.join(' → ') : '这些照片没有可读取的位置信息，不需要你手工填写。'}</p><button class="primary-button" data-work="picks">查看旅行照片</button></div></div></section>`;
}

function albumsView() {
  return `<section class="page albums-page"><div class="section-head"><div><h2>我的相册</h2><p>相册只包含你明确选择的照片。创建空相册不会自动添加封面或照片。</p></div><button class="primary-button" id="create-album">＋ 新建相册</button></div>
    ${state.albums.length ? `<div class="album-grid">${state.albums.map(albumCard).join('')}</div>` : `<div class="album-empty"><span>▣</span><h3>还没有相册</h3><p>可以先建一个空相册，再从你的照片里选择要加入的内容。</p><button class="primary-button" id="create-album-empty">创建第一个相册</button></div>`}
  </section>`;
}

function albumCard(album) {
  const photos = album.photoIds.map(findPhoto).filter(Boolean);
  const cover = photos[0];
  return `<article class="album-card">
    <button class="album-cover" data-album-open="${album.id}">
      ${cover ? `<img src="${cover.x}" alt="${escapeHtml(album.name)}">` : '<div class="album-no-cover"><span>▣</span><small>空相册</small></div>'}
      <span>${photos.length} 张</span>
    </button>
    <div class="album-copy"><div><b>${escapeHtml(album.name)}</b><p>${escapeHtml(album.description || '暂无描述')}</p></div><button class="album-edit" data-album-edit="${album.id}">编辑资料</button></div>
  </article>`;
}

function profileView() {
  const account = currentUser
    ? `<div class="account-card"><div class="account-avatar">${escapeHtml(userInitial())}</div><div><span>LifeYouMe 账号</span><b>${escapeHtml(currentUser.display_name)}</b><p>${escapeHtml(currentUser.email)}</p></div><a href="${AUTH_ORIGIN}/account">管理账号</a></div>`
    : `<div class="account-card signed-out"><div class="account-avatar">旅</div><div><span>保存你的旅行记忆</span><b>登录后按账号隔离照片</b><p>使用 LifeYouMe 统一账号，换账号不会看到彼此的照片和相册。</p></div><div class="account-card-actions"><a class="secondary-button" href="${authUrl('login')}">登录</a><a class="primary-button" href="${authUrl('register')}">免费注册</a></div></div>`;
  return `<section class="page profile-page"><div class="section-head"><div><h2>我的</h2><p>账号、照片隐私与 AI 分析设置。</p></div></div>${account}<div class="setting-list"><button data-setting="local"><b>${currentUser ? '账号独立保存' : '本机保存'}</b><span>${currentUser ? `当前数据仅属于 ${escapeHtml(currentUser.display_name)}` : '已开启 · 登录后可避免不同用户共用数据'}</span></button><button data-setting="sync"><b>云端同步</b><span>未开启 · 当前照片仍只保存在这台设备</span></button><button data-setting="export"><b>导出精选相册</b><span>生成可分享的旅行相册</span></button><button data-setting="reset"><b>清空当前数据</b><span>删除${currentUser ? '当前账号在本浏览器中' : '本浏览器'}保存的导入照片和标签</span></button></div></section>`;
}

function authUrl(mode) {
  const returnTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  return `${AUTH_ORIGIN}/${mode}?return_to=${encodeURIComponent(returnTo)}`;
}

function userInitial() {
  return (currentUser?.display_name || currentUser?.email || '旅').trim().slice(0, 1).toUpperCase();
}

function accountControls() {
  if (!currentUser) {
    return `<div class="auth-entry"><a href="${authUrl('login')}">登录</a><a class="auth-register" href="${authUrl('register')}">注册</a></div>`;
  }
  return `<div class="account-control"><button class="user-avatar" id="account-toggle" aria-label="打开账号菜单">${escapeHtml(userInitial())}</button>
    ${accountMenuOpen ? `<div class="account-menu"><div><b>${escapeHtml(currentUser.display_name)}</b><span>${escapeHtml(currentUser.email)}</span></div><button data-tab="me">账号与隐私</button><a href="${AUTH_ORIGIN}/account">账号设置</a><form method="post" action="${AUTH_ORIGIN}/logout"><button type="submit">退出登录</button></form></div>` : ''}
  </div>`;
}

function empty() {
  if (tab === 'map') return mapView();
  if (tab === 'albums') return albumsView();
  if (tab === 'me') return profileView();
  return `<section class="page placeholder"><span>✦</span><h1>建设中</h1><p>这个页面还在完善。</p><button class="primary-button" data-tab="home">返回首页</button></section>`;
}

function viewer() {
  if (!activePhoto) return '';
  const p = findPhoto(activePhoto);
  if (!p) return '';
  const labels = p.visionLabels?.slice(0, 3).map(item => `${item.label} ${Math.round(item.probability * 100)}%`).join(' · ');
  return `<div class="viewer ${zoomed ? 'zoomed' : ''}" role="dialog" aria-modal="true"><button class="viewer-close" data-close>×</button><div class="viewer-photo" data-zoom><img src="${p.x}" alt="${escapeHtml(p.title)}"><span>${zoomed ? '点击还原' : '点击放大'} · ${p.score} 分</span></div><aside class="viewer-panel"><div><p class="viewer-kicker">${p.demo ? '示例照片' : '我的照片'} · 照片信息</p><h2>${escapeHtml(p.title)}</h2><p class="viewer-meta">${escapeHtml(p.place)} · ${escapeHtml(p.time)} · ${escapeHtml(p.type)}</p></div><div class="ai-reason"><b>✦ 本地图像识别结果</b><p>${labels ? `视觉模型识别：${escapeHtml(labels)}` : escapeHtml(p.analysisError || '正在分析图片内容…')}</p></div><div class="manual"><div class="manual-title"><b>修改分类与标记</b><span>仅在需要时修改</span></div><label>地点<input id="tag-place" value="${escapeHtml(p.place)}"></label><label>景色类型<select id="tag-type">${state.categories.map(t => `<option ${p.type === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select></label><label>人物<input id="tag-people" value="${escapeHtml(p.people || '')}" placeholder="如：小林、阿北"></label><label>动作<input id="tag-action" value="${escapeHtml(p.action || '')}" placeholder="如：回头、举杯、自驾"></label><label>备注<input id="tag-note" value="${escapeHtml(p.note || '')}" placeholder="如：第一次到赛湖"></label><label class="new-type-field">新增类别<input id="tag-new-type" maxlength="12" placeholder="没有合适类别？如：露营"></label></div><div class="viewer-actions"><button class="secondary-button" id="save-tags">保存修改</button><button class="${hasSelected(p.id) ? 'selected-button' : 'primary-button'}" id="toggle-pick">${hasSelected(p.id) ? '✓ 已设为精选' : '✦ 设为精选'}</button></div></aside></div>`;
}

function albumModal() {
  if (!albumDialog) return '';
  const editing = albumDialog.mode === 'edit';
  const album = editing ? state.albums.find(item => item.id === albumDialog.albumId) : null;
  const selectedIds = new Set(albumDialog.photoIds || album?.photoIds || []);
  return `<div class="album-modal-backdrop" role="dialog" aria-modal="true">
    <section class="album-modal">
      <header><div><span>${editing ? '编辑相册' : '新建相册'}</span><h2>${editing ? '修改相册信息' : '创建你的旅行相册'}</h2></div><button type="button" data-album-close>×</button></header>
      <form id="album-form">
        <label>相册名称<input id="album-name" maxlength="30" value="${escapeHtml(albumDialog.name ?? album?.name ?? suggestAlbumName())}" placeholder="例如：成都周末"></label>
        <label>相册描述<textarea id="album-description" maxlength="120" placeholder="写下地点、时间或这段旅行的故事">${escapeHtml(albumDialog.description ?? album?.description ?? '')}</textarea></label>
        <div class="album-photo-picker"><div><b>选择照片</b><span>已选 <strong id="album-selected-count">${selectedIds.size}</strong> 张；不选就是空相册</span></div>
          ${userPhotos().length ? `<div class="album-photo-options">${userPhotos().map(photo => `<label class="${selectedIds.has(photo.id) ? 'selected' : ''}"><input type="checkbox" name="album-photo" value="${photo.id}" ${selectedIds.has(photo.id) ? 'checked' : ''}><img src="${photo.x}" alt="${escapeHtml(photo.title)}"><span>✓</span></label>`).join('')}</div>` : '<div class="album-no-photos">还没有上传自己的照片，你可以先创建空相册。</div>'}
        </div>
        <footer><button type="button" class="secondary-button" data-album-close>取消</button><button class="primary-button">${editing ? '保存修改' : '创建相册'}</button></footer>
      </form>
    </section>
  </div>`;
}

function render() {
  app.innerHTML=`<div class="app-shell"><header class="topbar"><a class="brand" href="#" data-tab="home"><span>✦</span>旅拍管家</a><div class="global-search"><span>⌕</span><input id="search" value="${escapeHtml(search)}" placeholder="搜照片：比如“去年海边的合照”"></div><div class="top-actions"><label class="upload-button">上传照片<input id="upload" type="file" accept="image/*" multiple hidden></label><button class="icon-button" id="notify">◌<i></i></button>${accountControls()}</div></header><main>${tab==='home'?home():tab==='sort'?sort():empty()}</main><nav class="bottom-nav">${[['home','⌂','首页'],['sort','✦','智能整理'],['map','⌖','旅行地图'],['albums','▣','相册'],['me','◉','我的']].map(n=>`<button class="${tab===n[0]?'active':''}" data-tab="${n[0]}"><span>${n[1]}</span>${n[2]}</button>`).join('')}</nav><div id="toast" class="toast"></div>${viewer()}${albumModal()}</div>`;
  bind();
}

function bind(){
  document.querySelectorAll('[data-tab]').forEach(x=>x.onclick=(event)=>{event.preventDefault();tab=x.dataset.tab;activePhoto=null;accountMenuOpen=false;render()});
  document.querySelector('#account-toggle')?.addEventListener('click',event=>{event.stopPropagation();accountMenuOpen=!accountMenuOpen;render()});
  document.querySelectorAll('[data-work]').forEach(x=>x.onclick=()=>{tab='sort';workMode=x.dataset.work;onlySelected=false;activePhoto=null;render()});
  document.querySelectorAll('[data-mode]').forEach(x=>x.onclick=()=>{workMode=x.dataset.mode;onlySelected=false;activePhoto=null;render()});
  document.querySelectorAll('[data-filter]').forEach(x=>x.onclick=()=>{filter=x.dataset.filter;onlySelected=false;tab='sort';workMode='picks';render()});
  document.querySelectorAll('[data-group]').forEach(x=>x.onclick=()=>{activeGroup=x.dataset.group;render()});
  document.querySelectorAll('[data-keep]').forEach(x=>x.onclick=(event)=>{event.stopPropagation();state.duplicateGroups.find(g=>g.id===activeGroup).keep=+x.dataset.keep;state.completedDuplicateGroups=state.completedDuplicateGroups.filter(g => g !== activeGroup);persist();render();toast('已更新这一组的保留照片')});
  document.querySelectorAll('[data-photo]').forEach(x=>x.onclick=()=>{activePhoto=+x.dataset.photo;zoomed=false;render()});
  document.querySelector('[data-close]')?.addEventListener('click',()=>{activePhoto=null;zoomed=false;render()});
  document.querySelector('[data-zoom]')?.addEventListener('click',()=>{zoomed=!zoomed;render()});
  document.querySelector('#toggle-pick')?.addEventListener('click',()=>{state.selected = hasSelected(activePhoto) ? state.selected.filter(id => String(id) !== String(activePhoto)) : unique([...state.selected, activePhoto]);persist();render();toast(hasSelected(activePhoto)?'已设为旅行精选':'已移出旅行精选')});
  document.querySelector('#save-tags')?.addEventListener('click', saveTags);
  document.querySelector('#search')?.addEventListener('input',e=>{search=e.target.value});
  document.querySelector('#search')?.addEventListener('keydown',e=>{if(e.key==='Enter'){tab='sort';workMode='picks';onlySelected=false;render();toast(search ? `已搜索：${search}` : '已显示全部照片')}});
  document.querySelector('#upload')?.addEventListener('change', importFiles);
  document.querySelector('#hero-upload')?.addEventListener('change', importFiles);
  document.querySelector('#start-sort')?.addEventListener('click',()=>{tab='sort';workMode='picks';render()});
  document.querySelector('#analyze')?.addEventListener('click',()=>reanalyzeAll());
  document.querySelector('#keep-best')?.addEventListener('click',()=>{state.completedDuplicateGroups=unique([...state.completedDuplicateGroups, activeGroup]);const keep=state.duplicateGroups.find(g=>g.id===activeGroup)?.keep;if(keep) state.selected=unique([...state.selected, keep]);persist();render();toast('已保留 Top Pick，其余照片已放入待处理清单')});
  document.querySelector('#review-picks')?.addEventListener('click',()=>{onlySelected=true;filter='全部';render();toast(`已筛出 ${selectedCount()} 张旅行精选`)});
  document.querySelector('#clear-search')?.addEventListener('click',()=>{search='';filter='全部';onlySelected=false;render();toast('已清空搜索条件')});
  document.querySelector('#sort-time')?.addEventListener('click',()=>toast('当前已按拍摄时间排序'));
  document.querySelector('#create-album')?.addEventListener('click',()=>openAlbumDialog());
  document.querySelector('#create-album-empty')?.addEventListener('click',()=>openAlbumDialog());
  document.querySelectorAll('[data-album-edit]').forEach(button => button.onclick=()=>openAlbumDialog(button.dataset.albumEdit));
  document.querySelectorAll('[data-album-open]').forEach(button => button.onclick=()=>openAlbumDialog(button.dataset.albumOpen));
  document.querySelectorAll('[data-album-close]').forEach(button => button.onclick=closeAlbumDialog);
  document.querySelector('#album-form')?.addEventListener('submit',saveAlbum);
  document.querySelectorAll('input[name="album-photo"]').forEach(input => input.onchange=syncAlbumSelection);
  document.querySelector('#category-form')?.addEventListener('submit', addCategory);
  document.querySelector('#notify')?.addEventListener('click',()=>toast('暂无新消息，整理任务已完成 86%'));
  document.querySelectorAll('[data-place]').forEach(x=>x.onclick=()=>{search=x.dataset.place;tab='sort';workMode='picks';filter='全部';onlySelected=false;render()});
  document.querySelectorAll('[data-setting]').forEach(x=>x.onclick=()=>handleSetting(x.dataset.setting));
  window.onkeydown = event => {
    if (event.key === 'Escape') {
      if (albumDialog) return closeAlbumDialog();
      if (activePhoto) {
        activePhoto = null;
        zoomed = false;
        render();
      }
    }
  };
}

function saveTags() {
  const p = findPhoto(activePhoto);
  const newType = document.querySelector('#tag-new-type').value.trim();
  const chosenType = newType || document.querySelector('#tag-type').value;
  if (newType) state.categories = unique([newType, ...state.categories]);
  p.place = document.querySelector('#tag-place').value.trim() || '未命名地点';
  p.type = chosenType;
  p.people = document.querySelector('#tag-people').value.trim() || '无人物';
  p.action = document.querySelector('#tag-action').value.trim() || '未标记动作';
  p.note = document.querySelector('#tag-note').value.trim();
  state.reviewPending = state.reviewPending.filter(id => String(id) !== String(activePhoto));
  persist();
  activePhoto = null;
  zoomed = false;
  render();
  toast(newType ? `已新增“${newType}”并保存照片标记` : '人工分类和标记已保存');
}

function addCategory(event) {
  event.preventDefault();
  const input = document.querySelector('#new-category');
  const name = input.value.trim();
  if (!name) return toast('请输入类别名称');
  if (state.categories.includes(name)) return toast('这个类别已经存在');
  state.categories = unique([name, ...state.categories]);
  filter = name;
  persist();
  render();
  toast(`已新增类别“${name}”`);
}

function openAlbumDialog(albumId = null) {
  const album = albumId ? state.albums.find(item => item.id === albumId) : null;
  albumDialog = {
    mode: album ? 'edit' : 'create',
    albumId: album?.id || null,
    name: album?.name || suggestAlbumName(),
    description: album?.description || '',
    photoIds: [...(album?.photoIds || [])]
  };
  render();
  setTimeout(() => document.querySelector('#album-name')?.focus(), 0);
}

function closeAlbumDialog() {
  albumDialog = null;
  render();
}

function syncAlbumSelection() {
  const checked = [...document.querySelectorAll('input[name="album-photo"]:checked')].map(input => Number(input.value));
  albumDialog.photoIds = checked;
  document.querySelector('#album-selected-count').textContent = checked.length;
  document.querySelectorAll('.album-photo-options label').forEach(label => {
    label.classList.toggle('selected', label.querySelector('input').checked);
  });
}

function saveAlbum(event) {
  event.preventDefault();
  const name = document.querySelector('#album-name').value.trim();
  const description = document.querySelector('#album-description').value.trim();
  const photoIds = [...document.querySelectorAll('input[name="album-photo"]:checked')].map(input => Number(input.value));
  if (!name) return toast('请输入相册名称');
  const editing = albumDialog.mode === 'edit';
  if (editing) {
    const album = state.albums.find(item => item.id === albumDialog.albumId);
    if (!album) return toast('没有找到这个相册，请刷新后重试');
    Object.assign(album, { name, description, photoIds });
  } else {
    state.albums.unshift({
      id: `album-${Date.now()}`,
      name,
      description,
      photoIds,
      createdAt: new Date().toISOString()
    });
  }
  persist();
  albumDialog = null;
  render();
  toast(editing ? '相册信息已更新' : `已创建“${name}”`);
}

function suggestAlbumName() {
  const places = topPlaces();
  const year = new Date().getFullYear();
  if (places.length) return `${places[0]}旅行 ${year}`;
  return `我的旅行 ${year}`;
}

async function importFiles(event) {
  const files = [...event.target.files].filter(file => file.type.startsWith('image/'));
  if (!files.length) return;
  toast(`正在分析并整理 ${files.length} 张照片…`);
  const start = Date.now();
  const imported = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    try {
      imported.push({
        id: start + index,
        title: file.name.replace(/\.[^.]+$/, ''),
        time: formatFileTime(file.lastModified),
        place: '地点未识别',
        type: '分析中',
        people: '分析中',
        action: '分析中',
        note: '',
        album: '',
        score: 84 + (index % 12),
        aiConfidence: 0,
        aiAnalyzed: false,
        visionLabels: [],
        x: await fileToDataUrl(file)
      });
    } catch {
      toast(`有照片导入失败：${file.name}`);
    }
  }
  if (!imported.length) return;
  state.photos = [...imported, ...state.photos];
  state.reviewPending = state.reviewPending.filter(id => findPhoto(id)?.demo);
  state.selected = unique([...state.selected, ...imported.filter(p => p.score >= 88).map(p => p.id)]);
  persist();
  tab = 'sort';
  workMode = 'picks';
  filter = '全部';
  search = '';
  render();
  if (storageWarning) toast(storageWarning);
  await analyzeUserPhotos(imported);
}

async function reanalyzeAll() {
  const targets = userPhotos();
  if (!targets.length) return toast('请先上传自己的照片');
  targets.forEach(photo => {
    photo.type = '分析中';
    photo.people = '分析中';
    photo.action = '分析中';
    photo.aiAnalyzed = false;
    photo.visionLabels = [];
  });
  await analyzeUserPhotos(targets);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const max = 1200;
        const ratio = Math.min(1, max / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * ratio));
        canvas.height = Math.max(1, Math.round(img.height * ratio));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function formatFileTime(lastModified) {
  const d = new Date(lastModified || Date.now());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

function handleSetting(setting) {
  if (setting === 'reset') {
    if (!window.confirm(`确定清空${currentUser ? '当前账号在本浏览器中' : '本机'}保存的导入照片、相册和分类吗？示例数据会保留。`)) return;
    localStorage.removeItem(activeStorageKey);
    state = loadState(activeStorageKey);
    tab = 'home';
    workMode = 'picks';
    filter = '全部';
    search = '';
    render();
    toast('已清空本机数据');
    return;
  }
  toast(setting === 'sync' ? '云端同步需要你主动授权后才能开启' : setting === 'export' ? '已准备导出精选相册' : '上传照片已保存在当前浏览器');
}

function toast(t){const n=document.querySelector('#toast');if(!n)return;n.textContent=t;n.classList.add('show');setTimeout(()=>n.classList.remove('show'),2600)}

async function initializeAccount() {
  try {
    const response = await fetch(`${AUTH_ORIGIN}/api/v1/session/state`, { credentials: 'include' });
    const session = await response.json();
    currentUser = session.authenticated ? session.user : null;
  } catch {
    currentUser = null;
  }

  if (currentUser) {
    activeStorageKey = `${ACCOUNT_STORAGE_PREFIX}${currentUser.id}`;
    if (!localStorage.getItem(activeStorageKey) && localStorage.getItem(LEGACY_STORAGE_KEY) && !localStorage.getItem(LEGACY_OWNER_KEY)) {
      localStorage.setItem(activeStorageKey, localStorage.getItem(LEGACY_STORAGE_KEY));
      localStorage.setItem(LEGACY_OWNER_KEY, currentUser.id);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  } else {
    activeStorageKey = LEGACY_STORAGE_KEY;
  }
  state = loadState(activeStorageKey);
  activeGroup = state.duplicateGroups[0]?.id || '';
  render();
  const photosNeedingVision = userPhotos().filter(photo => photo.visionVersion !== VISION_VERSION || !photo.aiAnalyzed);
  if (photosNeedingVision.length) analyzeUserPhotos(photosNeedingVision, { notify: true });
}

initializeAccount();
