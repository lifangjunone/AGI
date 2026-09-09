import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ArkClient } from "./ark-client.mjs";
import {
  EPISODE_DURATION_SECONDS,
  MAX_SEASON_EPISODES,
  MAX_VIDEO_SEGMENT_SECONDS,
  OUTPUT_DURATION_OPTIONS
} from "./config.mjs";
import { loadAuthorizedText, searchNovel } from "./novel-search.mjs";
import { TaskScheduler } from "./task-scheduler.mjs";

const STAGES = ["discover", "ingest", "adapt", "design", "render", "assemble"];
const STAGE_LABELS = {
  discover: "全网检索",
  ingest: "内容核验",
  adapt: "全书拆集",
  design: "本季设定",
  render: "分集渲染",
  assemble: "逐集装配"
};
const DEMO_IMAGE_ENDPOINT = "https://copilot-cn.bytedance.net/api/ide/v1/text_to_image";
const TARGET_SOURCE_CHARACTERS_PER_EPISODE = 6000;
const MAX_ADAPTATION_PLAN_EPISODES = 240;

function now() {
  return new Date().toISOString();
}

function imageUrl(prompt, imageSize = "landscape_16_9") {
  return `${DEMO_IMAGE_ENDPOINT}?prompt=${encodeURIComponent(prompt)}&image_size=${imageSize}`;
}

function createPipelineNodes(novelName) {
  return Object.fromEntries(STAGES.map((id, index) => [id, {
    id,
    order: index + 1,
    label: STAGE_LABELS[id],
    status: "pending",
    startedAt: null,
    completedAt: null,
    input: id === "discover" ? { novelName } : null,
    output: null,
    error: null
  }]));
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve()
      : reject(new Error(`${command} 执行失败: ${stderr.slice(-1200)}`)));
  });
}

async function downloadFile(url, file) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`素材下载失败: ${response.status}`);
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
}

function makeShots(title, episodeNumber, count, duration) {
  const beats = ["异象出现", "人物抉择", "追踪线索", "冲突升级", "秘密揭露", "危机逼近", "绝地反击", "悬念收束"];
  return Array.from({ length: count }, (_, index) => {
    const beat = beats[Math.floor(index / Math.max(1, count / beats.length)) % beats.length];
    return {
      id: `E${String(episodeNumber).padStart(3, "0")}-S${String(index + 1).padStart(3, "0")}`,
      order: index + 1,
      duration,
      status: index < 8 ? "succeeded" : index < 12 ? "running" : "queued",
      prompt: `${title} cinematic adaptation, episode ${episodeNumber}, ${beat}, shot ${index + 1}, consistent characters, realistic lighting, 16:9`,
      progress: index < 8 ? 100 : index < 12 ? 46 + (index % 4) * 11 : 0
    };
  });
}

function makeShotsForDuration(
  title,
  episodeNumber,
  durationSeconds,
  segmentSeconds = MAX_VIDEO_SEGMENT_SECONDS,
  segmentBriefs = []
) {
  const durations = [];
  let remaining = durationSeconds;
  while (remaining > 0) {
    const duration = Math.min(segmentSeconds, remaining);
    durations.push(duration);
    remaining -= duration;
  }
  return durations.map((duration, index) => {
    const shot = makeShots(title, episodeNumber, 1, duration)[0];
    return {
      ...shot,
      id: `E${String(episodeNumber).padStart(3, "0")}-S${String(index + 1).padStart(3, "0")}`,
      order: index + 1,
      continuityMode: index === 0 ? "episode-opening" : "previous-last-frame",
      previousShotId: index === 0
        ? null
        : `E${String(episodeNumber).padStart(3, "0")}-S${String(index).padStart(3, "0")}`,
      prompt: segmentBriefs[index]?.prompt
        || `${title} cinematic adaptation, episode ${episodeNumber}, continuous segment ${index + 1} of ${durations.length}, ${segmentBriefs[index]?.beat || "advance the story naturally"}, preserve character identity, wardrobe, props, geography, lighting direction and screen direction, realistic cinematic lighting, 16:9`
    };
  });
}

function projectDurationSeconds(project, config) {
  const episodeDuration = Number(project?.episodeDurationSeconds);
  if (Number.isFinite(episodeDuration) && episodeDuration > 0) return episodeDuration;
  const configured = Number(project?.targetDurationSeconds);
  if (Number.isFinite(configured) && configured > 0) return configured;
  const legacy = Number(project?.episodes?.[0]?.durationSeconds)
    || Number(project?.episodes?.[0]?.durationMinutes) * 60;
  return Number.isFinite(legacy) && legacy > 0
    ? legacy
    : Number(config.production.defaultOutputDurationSeconds)
      || Number(config.production.episodeMinutes) * 60;
}

function chapterHeading(line) {
  return /^(?:第[零〇一二三四五六七八九十百千万两\d]{1,12}[章节回卷部篇]|chapter\s+\d+\b)/i
    .test(String(line || "").trim());
}

function extractChapterInventory(sourceText, fallbackTitle = "正文") {
  const text = String(sourceText || "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const chapters = [];
  let offset = 0;
  for (const line of lines) {
    const normalized = line.trim();
    if (normalized && chapterHeading(normalized)) {
      if (chapters.length) {
        chapters.at(-1).characterCount = Math.max(
          1,
          offset - chapters.at(-1).startOffset
        );
      }
      chapters.push({
        number: chapters.length + 1,
        title: normalized.slice(0, 120),
        startOffset: offset,
        characterCount: 0
      });
    }
    offset += line.length + 1;
  }
  if (chapters.length) {
    chapters.at(-1).characterCount = Math.max(
      1,
      text.length - chapters.at(-1).startOffset
    );
    return chapters;
  }
  if (!text.trim()) return [];
  const inferredCount = Math.max(
    1,
    Math.min(
      MAX_ADAPTATION_PLAN_EPISODES,
      Math.ceil(text.length / TARGET_SOURCE_CHARACTERS_PER_EPISODE)
    )
  );
  const size = Math.ceil(text.length / inferredCount);
  return Array.from({ length: inferredCount }, (_, index) => ({
    number: index + 1,
    title: `${fallbackTitle} · 内容单元 ${index + 1}`,
    startOffset: index * size,
    characterCount: Math.min(size, Math.max(0, text.length - index * size)),
    inferred: true
  }));
}

function buildFallbackAdaptationPlan(title, sourceText, source) {
  const chapters = extractChapterInventory(
    sourceText || source?.description || "",
    title
  );
  const inventory = chapters.length
    ? chapters
    : [{
        number: 1,
        title: "现有内容梗概",
        startOffset: 0,
        characterCount: String(source?.description || "").length
      }];
  const episodes = [];
  let group = [];
  let characters = 0;
  const flush = () => {
    if (!group.length || episodes.length >= MAX_ADAPTATION_PLAN_EPISODES) return;
    const first = group[0];
    const last = group.at(-1);
    const number = episodes.length + 1;
    episodes.push({
      number,
      title: first.title.replace(
        /^(?:第[零〇一二三四五六七八九十百千万两\d]{1,12}[章节回卷部篇]|chapter\s+\d+\b)\s*/i,
        ""
      ).slice(0, 48) || `叙事单元 ${number}`,
      logline: `改编自${first.number === last.number ? first.title : `${first.title} 至 ${last.title}`}，形成完整的五分钟叙事单元。`,
      sourceRange: first.number === last.number
        ? first.title
        : `${first.title} - ${last.title}`,
      sourceChapterStart: first.number,
      sourceChapterEnd: last.number,
      estimatedSourceCharacters: characters
    });
    group = [];
    characters = 0;
  };
  for (const chapter of inventory) {
    if (
      group.length
      && characters + chapter.characterCount > TARGET_SOURCE_CHARACTERS_PER_EPISODE
    ) {
      flush();
    }
    group.push(chapter);
    characters += chapter.characterCount;
    if (characters >= TARGET_SOURCE_CHARACTERS_PER_EPISODE) flush();
  }
  flush();
  return {
    title,
    generatedAt: now(),
    analysisBasis: chapters.some((chapter) => !chapter.inferred)
      ? "chapter-boundaries-and-content-density"
      : sourceText
        ? "content-density"
        : "available-synopsis",
    sourceCharacterCount: String(sourceText || "").length,
    detectedChapterCount: chapters.filter((chapter) => !chapter.inferred).length,
    recommendedEpisodeCount: episodes.length,
    suggestedSeasonSize: Math.min(6, episodes.length),
    episodes
  };
}

function normalizeAdaptationPlan(candidate, fallback) {
  const sourceEpisodes = Array.isArray(candidate?.episodes)
    ? candidate.episodes
    : [];
  const episodes = sourceEpisodes
    .slice(0, MAX_ADAPTATION_PLAN_EPISODES)
    .map((episode, index) => {
      const fallbackEpisode = fallback.episodes[index]
        || fallback.episodes.at(-1);
      return {
        ...fallbackEpisode,
        ...episode,
        number: index + 1,
        title: String(episode?.title || fallbackEpisode?.title || `第 ${index + 1} 集`).slice(0, 80),
        logline: String(episode?.logline || fallbackEpisode?.logline || "待生成分集梗概").slice(0, 500),
        sourceRange: String(episode?.sourceRange || fallbackEpisode?.sourceRange || "待核验章节").slice(0, 180)
      };
    });
  const normalizedEpisodes = episodes.length ? episodes : fallback.episodes;
  return {
    ...fallback,
    ...candidate,
    generatedAt: now(),
    sourceCharacterCount: fallback.sourceCharacterCount,
    detectedChapterCount: fallback.detectedChapterCount,
    recommendedEpisodeCount: normalizedEpisodes.length,
    suggestedSeasonSize: Math.max(
      1,
      Math.min(
        MAX_SEASON_EPISODES,
        Number(candidate?.suggestedSeasonSize) || fallback.suggestedSeasonSize,
        normalizedEpisodes.length
      )
    ),
    episodes: normalizedEpisodes
  };
}

function buildDemoBible(title, source, config, targetDurationSeconds) {
  const protagonist = title === "西游记" ? "孙悟空" : "主角";
  const companion = title === "西游记" ? "唐三藏" : "同行者";
  const durationSeconds = targetDurationSeconds
    || config.production.defaultOutputDurationSeconds
    || config.production.episodeMinutes * 60;
  const episode = {
    number: 1,
    title: "风暴前夜",
    logline: `${protagonist}在旅程转折点发现异常征兆，被迫在使命与同伴安全之间做出选择。`,
    durationMinutes: durationSeconds / 60,
    durationSeconds,
    sourceRange: "开篇核心事件",
    shots: makeShotsForDuration(title, 1, durationSeconds)
  };
  return {
    tone: "东方史诗、写实奇幻、克制而有张力",
    synopsis: source.description || `${title}的系列化影视改编，以人物选择推动连续剧情。`,
    characters: [
      { name: protagonist, role: "核心主角", traits: "敏锐、坚韧、行动果断", continuityId: "CHAR-001" },
      { name: companion, role: "精神锚点", traits: "克制、坚定、富有同理心", continuityId: "CHAR-002" },
      { name: "守关者", role: "本集对手", traits: "冷静、强大、立场复杂", continuityId: "CHAR-003" }
    ],
    weapons: [
      { name: title === "西游记" ? "如意金箍棒" : "玄铁长刃", owner: protagonist, continuityId: "PROP-001" },
      { name: "古旧罗盘", owner: companion, continuityId: "PROP-002" }
    ],
    locations: [
      { name: "云岭古道", mood: "风雨将至，远山压境", continuityId: "LOC-001" },
      { name: "废弃驿站", mood: "烛火摇曳，危机潜伏", continuityId: "LOC-002" },
      { name: "断崖关隘", mood: "高风急云，决战空间", continuityId: "LOC-003" }
    ],
    episodes: [episode]
  };
}

function buildSeriesBible(title, source, config, episodeCount) {
  const count = Math.max(
    1,
    Math.min(MAX_SEASON_EPISODES, Number(episodeCount) || 1)
  );
  const durationSeconds = Number(config.production.episodeDurationSeconds) || EPISODE_DURATION_SECONDS;
  const base = buildDemoBible(title, source, config, durationSeconds);
  const arcNames = ["启程", "异兆", "试炼", "裂变", "决战", "余波", "暗线", "再会", "破局", "归途", "真相", "新章"];
  base.seasonTitle = `${title} · 第一季`;
  base.seasonSynopsis = base.synopsis;
  base.episodes = Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const titleText = `第${number}集 ${arcNames[index] || `篇章${number}`}`;
    const segmentBriefs = Array.from({ length: durationSeconds / MAX_VIDEO_SEGMENT_SECONDS }, (__, segmentIndex) => ({
      order: segmentIndex + 1,
      beat: `第 ${segmentIndex + 1} 段推进本集冲突并承接前一段动作`,
      prompt: `${title}，${titleText}，第 ${segmentIndex + 1} 个连续段落。保持角色身份、服装、道具、场景方位、光线和运动方向连续，电影写实风格，16:9`
    }));
    return {
      number,
      title: titleText,
      logline: `${base.characters[0].name}沿主线继续推进，在新的阻力中完成阶段目标并留下下一集悬念。`,
      durationMinutes: durationSeconds / 60,
      durationSeconds,
      sourceRange: `第 ${number} 个改编单元`,
      contentStatus: "ready",
      script: `本集按五分钟结构展开：建立目标、升级冲突、形成转折，并以明确悬念收束。`,
      continuityIn: number === 1 ? "系列开场" : `承接第 ${number - 1} 集结尾状态`,
      continuityOut: number === count ? "本季阶段收束" : `进入第 ${number + 1} 集悬念`,
      segmentBriefs,
      shots: makeShotsForDuration(
        title,
        number,
        durationSeconds,
        MAX_VIDEO_SEGMENT_SECONDS,
        segmentBriefs
      )
    };
  });
  return base;
}

function buildAssets(title, bible) {
  return [
    ...bible.characters.map((item, index) => ({
      id: item.continuityId,
      type: "character",
      name: item.name,
      status: "approved",
      imageUrl: imageUrl(`Cinematic realistic character turnaround for ${title}, ${item.name}, ${item.role}, neutral studio lighting, full body costume design, no text`, "portrait_4_3"),
      prompt: `${title} ${item.name} character sheet, ${item.traits}`
    })),
    ...bible.weapons.map((item) => ({
      id: item.continuityId,
      type: "weapon",
      name: item.name,
      status: "approved",
      imageUrl: imageUrl(`Cinematic prop design for ${title}, ${item.name}, isolated detailed weapon on dark neutral background, no text`, "landscape_4_3"),
      prompt: `${title} ${item.name} prop design`
    })),
    ...bible.locations.map((item) => ({
      id: item.continuityId,
      type: "location",
      name: item.name,
      status: "approved",
      imageUrl: imageUrl(`Wide cinematic establishing shot for ${title}, ${item.name}, ${item.mood}, realistic environment, no text`, "landscape_16_9"),
      prompt: `${title} ${item.name}, ${item.mood}`
    }))
  ];
}

export class ProductionPipeline {
  constructor(config, store, { search = searchNovel, loadText = loadAuthorizedText } = {}) {
    this.config = config;
    this.store = store;
    this.searchNovel = search;
    this.loadAuthorizedText = loadText;
    this.ark = new ArkClient(config.ark);
    this.active = new Set();
    this.scheduler = new TaskScheduler({
      store,
      maxConcurrency: config.production.maxProjectConcurrency,
      worker: (id) => this.run(id)
    });
  }

  async create(novelName, options = {}) {
    const title = String(novelName || "").trim();
    if (title.length < 2 || title.length > 100) throw new Error("小说名需为 2-100 个字符");
    const legacyDuration = typeof options === "number" ? Number(options) : null;
    if (legacyDuration !== null && !OUTPUT_DURATION_OPTIONS.includes(legacyDuration)) {
      throw new Error("旧版生成时长仅支持 5、10、15、30 或 60 秒");
    }
    const requestedEpisodeCount = legacyDuration !== null ? 1 : null;
    const duration = legacyDuration || EPISODE_DURATION_SECONDS;
    const project = {
      id: randomUUID(),
      novelName: title,
      status: "queued",
      stage: "discover",
      progress: 2,
      mode: this.config.mode,
      targetDurationSeconds: duration,
      episodeDurationSeconds: duration,
      seasonEpisodeCount: requestedEpisodeCount,
      productionSpec: {
        episodeDurationSeconds: duration,
        segmentDurationSeconds: Math.min(
          MAX_VIDEO_SEGMENT_SECONDS,
          Number(this.config.production.maxVideoSegmentSeconds) || MAX_VIDEO_SEGMENT_SECONDS
        ),
        continuityMode: "last-frame-chain",
        renderOrder: "episode-sequential"
      },
      createdAt: now(),
      updatedAt: now(),
      queuedAt: now(),
      startedAt: null,
      completedAt: null,
      queuePosition: null,
      estimatedWaitMinutes: null,
      source: null,
      sources: [],
      sourceConfirmed: false,
      suggestedSourceId: null,
      bible: null,
      adaptationPlan: null,
      seasonSelection: null,
      assets: [],
      episodes: [],
      nodes: createPipelineNodes(title),
      activity: [{
        at: now(),
        message: legacyDuration !== null
          ? `旧版项目已创建：1 集，时长 ${duration} 秒`
          : "小说项目已创建：确认正文后将按章节与内容生成全书分集规划"
      }],
      error: null
    };
    await this.store.save(project);
    return this.scheduler.enqueue(project.id, { message: "任务已进入生产队列" });
  }

  async selectSeason(id, {
    startEpisode,
    episodeCount,
    seasonNumber = 1
  } = {}) {
    const project = await this.store.get(id);
    if (!project) throw new Error("项目不存在");
    if (project.status !== "season-review" || !project.adaptationPlan?.episodes?.length) {
      throw new Error("当前任务尚未进入本季选择阶段");
    }
    const start = Number(startEpisode);
    const count = Number(episodeCount);
    const season = Number(seasonNumber);
    const total = project.adaptationPlan.episodes.length;
    if (!Number.isInteger(start) || start < 1 || start > total) {
      throw new Error(`起始集必须在 1-${total} 之间`);
    }
    if (
      !Number.isInteger(count)
      || count < 1
      || count > MAX_SEASON_EPISODES
      || start + count - 1 > total
    ) {
      throw new Error(
        `本季集数必须在 1-${Math.min(MAX_SEASON_EPISODES, total - start + 1)} 之间`
      );
    }
    if (!Number.isInteger(season) || season < 1 || season > 99) {
      throw new Error("季号必须在 1-99 之间");
    }
    const endEpisode = start + count - 1;
    project.seasonSelection = {
      seasonNumber: season,
      startEpisode: start,
      endEpisode,
      episodeCount: count,
      selectedAt: now()
    };
    project.seasonEpisodeCount = count;
    project.productionSpec = {
      ...(project.productionSpec || {}),
      episodeCount: count,
      sourceEpisodeStart: start,
      sourceEpisodeEnd: endEpisode
    };
    project.status = "queued";
    project.stage = "adapt";
    project.progress = 44;
    project.error = null;
    project.completedAt = null;
    project.episodes = [];
    if (project.nodes?.adapt) {
      project.nodes.adapt.status = "pending";
      project.nodes.adapt.error = null;
      project.nodes.adapt.completedAt = null;
    }
    await this.store.save(project);
    return this.scheduler.enqueue(id, {
      message: `已锁定第 ${season} 季：全书规划第 ${start}-${endEpisode} 集，开始生成详细剧本`
    });
  }

  async update(project, patch, message) {
    Object.assign(project, patch, { updatedAt: now() });
    if (message) project.activity.unshift({ at: now(), message });
    project.activity = project.activity.slice(0, 30);
    await this.store.save(project);
  }

  async updateNode(project, id, status, { input, output, error = null, projectPatch = {}, message } = {}) {
    project.nodes ||= createPipelineNodes(project.novelName);
    const node = project.nodes[id] || {
      id,
      order: STAGES.indexOf(id) + 1,
      label: STAGE_LABELS[id],
      status: "pending"
    };
    if (status === "running" && !node.startedAt) node.startedAt = now();
    if (["completed", "failed", "paused"].includes(status)) node.completedAt = now();
    Object.assign(node, {
      status,
      ...(input !== undefined ? { input } : {}),
      ...(output !== undefined ? { output } : {}),
      error
    });
    project.nodes[id] = node;
    await this.update(project, { nodes: project.nodes, ...projectPatch }, message);
  }

  async confirmSource(id, sourceId) {
    const project = await this.store.get(id);
    if (!project) throw new Error("项目不存在");
    if (!["source-review", "rights-review"].includes(project.status)) throw new Error("当前任务不在来源确认阶段");
    const source = project.sources.find((candidate) => candidate.id === sourceId);
    if (!source) throw new Error("所选来源不在候选列表中");
    await this.update(project, {
      source,
      sourceConfirmed: true,
      status: "queued",
      stage: "ingest",
      progress: 18,
      error: null
    }, `已确认来源：${source.title} / ${source.source}`);
    return this.scheduler.enqueue(id, { message: "来源确认完成，任务重新进入生产队列" });
  }

  async rescanSources(id) {
    const project = await this.store.get(id);
    if (!project) throw new Error("项目不存在");
    if (!["source-review", "rights-review", "failed"].includes(project.status)) {
      throw new Error("当前任务不能重新检索来源");
    }
    await this.update(project, {
      sources: [],
      searchRuns: [],
      configuredSources: [],
      source: null,
      sourceConfirmed: false,
      suggestedSourceId: null,
      nodes: createPipelineNodes(project.novelName),
      status: "queued",
      stage: "discover",
      progress: 0,
      error: null
    }, "已按最新来源策略重新发起检索");
    return this.scheduler.enqueue(id, { message: "来源重新检索任务已进入队列" });
  }

  async retry(id, { approveBudget = false } = {}) {
    const project = await this.store.get(id);
    if (!project) throw new Error("项目不存在");
    const retryable = ["failed", "rights-review", "budget-gate", "configuration-gate"].includes(project.status)
      || (
        ["planning-ready", "demo-preview", "completed"].includes(project.status)
        && ["planning", "demo"].includes(project.mode)
      );
    if (!retryable) throw new Error("当前任务不能重新生成");

    if (
      project.status === "budget-gate"
      && project.stage === "render"
      && project.contentPlanCompletedAt
      && project.episodes?.length
    ) {
      if (!approveBudget) throw new Error("请先确认全季视频预算");
      project.mode = this.config.mode;
      project.budgetApproved = true;
      project.resumeStage = "render-new";
      project.status = "queued";
      project.progress = 72;
      project.error = null;
      project.completedAt = null;
      if (project.nodes?.render) {
        project.nodes.render.status = "pending";
        project.nodes.render.error = null;
      }
      await this.store.save(project);
      return this.scheduler.enqueue(id, {
        message: "全季视频预算已确认，按集顺序进入渲染队列"
      });
    }

    if (
      project.status === "failed"
      && project.stage === "render"
      && project.contentPlanCompletedAt
      && project.episodes?.length
    ) {
      project.resumeStage = "render-retry";
      project.status = "queued";
      project.error = null;
      project.completedAt = null;
      for (const episode of project.episodes) {
        if (episode.status === "completed") continue;
        episode.status = "queued";
        for (const shot of episode.shots || []) {
          if (!["failed", "expired"].includes(shot.status)) continue;
          shot.status = "queued";
          shot.progress = 0;
          delete shot.remoteTaskId;
        }
      }
      await this.store.save(project);
      return this.scheduler.enqueue(id, {
        message: "失败片段已重置，将从断点继续逐集生成"
      });
    }

    project.mode = this.config.mode;
    project.status = "queued";
    project.stage = project.sourceConfirmed ? "ingest" : "discover";
    project.progress = project.sourceConfirmed ? 18 : 0;
    project.error = null;
    project.completedAt = null;
    project.episodes = [];
    for (const stageId of ["ingest", "adapt", "design", "render", "assemble"]) {
      if (project.nodes?.[stageId]) {
        project.nodes[stageId] = {
          order: STAGES.indexOf(stageId) + 1,
          label: STAGE_LABELS[stageId],
          status: "pending"
        };
      }
    }
    await this.store.save(project);
    return this.scheduler.enqueue(id, {
      message: this.config.mode === "live"
        ? "规划预览已升级为真实生成任务"
        : "任务已重新进入生产队列"
    });
  }

  async importAuthorizedContent(id, { sourceId, content, fileName, rightsConfirmed }) {
    const project = await this.store.get(id);
    if (!project) throw new Error("项目不存在");
    if (!["source-review", "rights-review"].includes(project.status)) {
      throw new Error("当前任务不在内容导入阶段");
    }
    if (rightsConfirmed !== true) throw new Error("必须确认拥有该文本的处理权");
    const source = project.sources.find((candidate) => candidate.id === sourceId);
    if (!source) throw new Error("所选来源不在候选列表中");
    const normalized = String(content || "").replace(/\0/g, "").trim();
    if (normalized.length < 500) throw new Error("正文至少需要 500 个字符");
    if (Buffer.byteLength(normalized, "utf8") > 12 * 1024 * 1024) throw new Error("正文文件不能超过 12 MB");
    const relativeFile = path.join("imports", project.id, "authorized-source.txt");
    const file = path.join(this.config.dataDirectory, relativeFile);
    const directory = path.dirname(file);
    await mkdir(directory, { recursive: true });
    await writeFile(file, normalized, { encoding: "utf8", mode: 0o600 });
    const sha256 = createHash("sha256").update(normalized).digest("hex");
    const importedAt = now();
    const authorizedSource = {
      ...source,
      rights: "user-provided",
      localContentFile: relativeFile,
      contentUrl: null
    };
    await this.update(project, {
      source: authorizedSource,
      sources: project.sources.map((candidate) => candidate.id === sourceId ? authorizedSource : candidate),
      sourceConfirmed: true,
      authorizedContent: {
        fileName: path.basename(String(fileName || "authorized-source.txt")).slice(0, 160),
        characterCount: normalized.length,
        byteCount: Buffer.byteLength(normalized, "utf8"),
        sha256,
        preview: normalized.slice(0, 2000),
        importedAt,
        rightsBasis: "user-declared"
      },
      status: "queued",
      stage: "ingest",
      progress: 18,
      error: null
    }, `已导入授权正文：${normalized.length} 字符`);
    return this.scheduler.enqueue(id, { message: "授权正文已进入内容核验队列" });
  }

  async readSourceText(source) {
    if (source?.rights !== "user-provided" || !source.localContentFile) {
      return this.loadAuthorizedText(source);
    }
    const importsRoot = path.resolve(this.config.dataDirectory, "imports");
    const file = path.resolve(this.config.dataDirectory, source.localContentFile);
    if (!file.startsWith(`${importsRoot}${path.sep}`)) throw new Error("授权正文路径不合法");
    return (await readFile(file, "utf8")).slice(0, 12 * 1024 * 1024);
  }

  async run(id) {
    const project = await this.store.get(id);
    if (!project || this.active.has(id)) return false;
    this.active.add(id);
    let retainSlot = false;

    try {
      if (["render-new", "render-retry"].includes(project.resumeStage) && project.episodes?.length) {
        const renderResume = project.resumeStage;
        delete project.resumeStage;
        await this.updateNode(project, "render", "running", {
          input: {
            episodeCount: project.episodes.length,
            episodeDurationSeconds: projectDurationSeconds(project, this.config),
            totalSegmentCount: project.episodes.reduce((sum, episode) => sum + (episode.shots?.length || 0), 0),
            segmentDurationSeconds: project.productionSpec?.segmentDurationSeconds || MAX_VIDEO_SEGMENT_SECONDS,
            renderOrder: "episode-sequential",
            continuityMode: "previous-last-frame",
            model: this.config.ark.videoModel
          },
          projectPatch: { status: "running", stage: "render", progress: 72, error: null },
          message: "全季内容已锁定，开始逐集视频生产"
        });
        if (renderResume === "render-new") {
          await this.submitVideoBatch(project, project.episodes);
        } else {
          await this.update(project, {
            status: "rendering",
            stage: "render",
            episodes: project.episodes
          }, "从失败片段断点恢复");
          await this.submitNextSequentialShot(project);
        }
        retainSlot = true;
        return retainSlot;
      }
      const requiresDiscovery = !project.sourceConfirmed || !project.source;
      await this.update(project, {
        status: "running",
        stage: requiresDiscovery ? "discover" : "ingest",
        progress: requiresDiscovery ? 8 : 20,
        error: null,
        startedAt: now(),
        completedAt: null,
        queuePosition: null,
        estimatedWaitMinutes: null
      }, requiresDiscovery ? "正在检索可信内容源" : "正在读取已确认来源");
      if (requiresDiscovery) {
        await this.updateNode(project, "discover", "running", {
          input: {
            novelName: project.novelName,
            strategies: ["国内全网检索", "配置站点检索", "公版目录检索", "全球目录检索"],
            sourceConfigFile: this.config.search.sourceConfigFile
          }
        });
        const searchResult = await this.searchNovel(project.novelName, this.config.search);
        const sources = Array.isArray(searchResult) ? searchResult : searchResult.candidates;
        const searches = Array.isArray(searchResult) ? [] : searchResult.searches || [];
        const configuredSources = Array.isArray(searchResult) ? [] : searchResult.configuredSources || [];
        const suggested = sources.find((item) => item.rights === "public-domain") || sources[0];
        if (!suggested) {
          await this.updateNode(project, "discover", "failed", {
            output: { candidateCount: 0, candidates: [], searches, configuredSources },
            projectPatch: { sources: [], searchRuns: searches, configuredSources },
            error: "未找到可识别的小说来源"
          });
          throw new Error("未找到可识别的小说来源");
        }
        await this.updateNode(project, "discover", "completed", {
          output: {
            candidateCount: sources.length,
            suggestedSourceId: suggested.id,
            searchCount: searches.length,
            searches,
            configuredSources,
            candidates: sources.map(({ id: sourceId, title, authors, source, rights, score, year, languages, sourceUrl, contentUrl, description }) => ({
              id: sourceId, title, authors, source, rights, score, year, languages, sourceUrl,
              contentAvailable: Boolean(contentUrl),
              description
            }))
          },
          projectPatch: {
            sources,
            searchRuns: searches,
            configuredSources,
            source: null,
            sourceConfirmed: false,
            suggestedSourceId: suggested.id,
            status: "source-review",
            stage: "discover",
            progress: 15
          },
          message: `检索到 ${sources.length} 个候选来源，等待确认`
        });
        return false;
      }

      const source = project.source;
      await this.updateNode(project, "ingest", "running", {
        input: { sourceId: source.id, title: source.title, authors: source.authors, source: source.source, rights: source.rights }
      });

      if (!["public-domain", "public-domain-candidate", "user-provided"].includes(source.rights)) {
        await this.updateNode(project, "ingest", "paused", {
          input: { sourceId: source.id, title: source.title, rights: source.rights },
          error: "仅找到元数据或待授权网页，需获得作品授权后才能处理正文",
          projectPatch: {
            status: "rights-review",
            progress: 22,
            completedAt: now(),
            error: "仅找到元数据或待授权网页，需获得作品授权后才能处理正文"
          },
          message: "版权门禁已暂停正文处理"
        });
        return false;
      }

      const sourceText = await this.readSourceText(source).catch(() => "");
      const chapterInventory = extractChapterInventory(
        sourceText || source.description || "",
        project.novelName
      );
      const detectedChapterCount = chapterInventory.filter(
        (chapter) => !chapter.inferred
      ).length;
      const targetDurationSeconds = projectDurationSeconds(project, this.config);
      const episodeCount = Number(
        project.seasonSelection?.episodeCount
        || project.seasonEpisodeCount
        || project.productionSpec?.episodeCount
        || 0
      );
      const segmentDurationSeconds = Number(
        project.productionSpec?.segmentDurationSeconds
        || this.config.production.maxVideoSegmentSeconds
        || MAX_VIDEO_SEGMENT_SECONDS
      );
      const estimatedEpisodeCost = Number((
        targetDurationSeconds * this.config.production.videoCostPerSecondCny
      ).toFixed(2));
      const estimatedSeasonCost = Number((
        estimatedEpisodeCost * episodeCount
      ).toFixed(2));
      await this.updateNode(project, "ingest", "completed", {
        output: {
          sourceId: source.id,
          contentCharacters: sourceText.length,
          detectedChapterCount,
          contentPreview: (sourceText || source.description || "").slice(0, 1200),
          usedDescriptionFallback: sourceText.length === 0,
          rights: source.rights,
          contentSha256: project.authorizedContent?.sha256 || null,
          importedFileName: project.authorizedContent?.fileName || null
        },
        projectPatch: { stage: "adapt", progress: 34 },
        message: "正文与梗概已进入改编引擎"
      });
      const billableEnabled = this.config.production.billableGenerationEnabled === true;
      const budgetOverrunAllowed = this.config.production.budgetOverrunAllowed === true;
      const overBudget = estimatedSeasonCost > this.config.production.dailyBudgetCny;
      if (this.config.mode === "live" && !this.config.ark.apiKey) {
        const reason = "生产环境尚未配置 ARK_API_KEY；完成用户级配置后重试";
        await this.updateNode(project, "adapt", "paused", {
          input: {
            targetDurationSeconds,
            selectedEpisodeCount: episodeCount || null,
            estimatedSeasonCostCny: episodeCount ? estimatedSeasonCost : null
          },
          error: reason,
          projectPatch: {
            status: "configuration-gate",
            stage: "adapt",
            progress: 34,
            completedAt: now(),
            error: reason
          },
          message: "生产配置门禁在模型调用前暂停了任务"
        });
        return false;
      }
      if (
        this.config.mode === "live"
        && !billableEnabled
      ) {
        const reason = "生成模型未获计费授权；设置 ALLOW_BILLABLE_GENERATION=true 后重试";
        await this.updateNode(project, "adapt", "paused", {
          input: {
            model: this.config.ark.planningModel || this.config.ark.textModel,
            targetDurationSeconds,
            selectedEpisodeCount: episodeCount || null,
            estimatedSeasonCostCny: episodeCount ? estimatedSeasonCost : null,
            dailyBudgetCny: this.config.production.dailyBudgetCny
          },
          error: reason,
          projectPatch: {
            status: "budget-gate",
            stage: "adapt",
            progress: 34,
            completedAt: now(),
            error: reason
          },
          message: "预算门禁在任何生成模型调用前暂停了任务"
        });
        return false;
      }
      await this.updateNode(project, "adapt", "running", {
        input: {
          sourceCharacters: sourceText.length,
          mode: this.config.mode,
          selectedEpisodeCount: episodeCount || null,
          detectedChapterCount,
          targetDurationSeconds,
          segmentDurationSeconds,
          model: this.config.mode === "live"
            ? this.config.ark.planningModel || this.config.ark.textModel
            : "planning"
        }
      });
      const fallbackPlan = buildFallbackAdaptationPlan(
        project.novelName,
        sourceText,
        source
      );
      let adaptationPlan = project.adaptationPlan;
      if (!adaptationPlan) {
        let generatedPlan = fallbackPlan;
        if (this.config.mode === "live") {
          generatedPlan = await this.ark.generateJson(
            "你是长篇小说剧集策划。只输出 JSON，字段为 analysisBasis、recommendedEpisodeCount、suggestedSeasonSize、tone、seriesSynopsis、characters、weapons、locations、episodes。必须根据实际章节边界、章节长度、事件密度和五分钟叙事容量决定总集数，不得使用固定档位。episodes 必须按全书顺序列出，每项只包含 number、title、logline、sourceRange、sourceChapterStart、sourceChapterEnd、estimatedSourceCharacters。每集必须对应明确正文范围，不能先决定季集数，也不要生成分镜或视频。",
            `作品：${project.novelName}\n来源：${source.title} / ${source.authors}\n正文字符数：${sourceText.length}\n检测到的章节：${JSON.stringify(chapterInventory.slice(0, MAX_ADAPTATION_PLAN_EPISODES))}\n正文开篇：${(sourceText || source.description || "").slice(0, 60000)}\n正文结尾：${(sourceText || source.description || "").slice(-30000)}`
          );
        }
        adaptationPlan = normalizeAdaptationPlan(
          generatedPlan,
          fallbackPlan
        );
        await this.updateNode(project, "adapt", "paused", {
          output: {
            phase: "whole-book-plan",
            analysisBasis: adaptationPlan.analysisBasis,
            sourceCharacterCount: adaptationPlan.sourceCharacterCount,
            detectedChapterCount: adaptationPlan.detectedChapterCount,
            recommendedEpisodeCount: adaptationPlan.episodes.length,
            suggestedSeasonSize: adaptationPlan.suggestedSeasonSize,
            episodes: adaptationPlan.episodes
          },
          error: "全书分集规划已完成，等待选择本季范围",
          projectPatch: {
            adaptationPlan,
            status: "season-review",
            stage: "adapt",
            progress: 42,
            error: null,
            completedAt: null
          },
          message: `已根据 ${adaptationPlan.detectedChapterCount || "现有"} 个章节/内容单元生成 ${adaptationPlan.episodes.length} 集全书规划，等待选择本季`
        });
        return false;
      }
      if (!project.seasonSelection) {
        await this.update(project, {
          status: "season-review",
          stage: "adapt",
          progress: 42,
          error: null
        }, "全书分集规划已就绪，等待选择本季");
        return false;
      }
      const selection = project.seasonSelection;
      const selectedOutlines = adaptationPlan.episodes.slice(
        selection.startEpisode - 1,
        selection.endEpisode
      );
      if (!selectedOutlines.length || selectedOutlines.length !== episodeCount) {
        throw new Error("本季选择与全书分集规划不一致，请重新选择");
      }
      const fallbackBible = buildSeriesBible(
        project.novelName,
        source,
        this.config,
        episodeCount
      );
      const bible = {
        ...fallbackBible,
        seasonTitle: `${project.novelName} · 第 ${selection.seasonNumber} 季`,
        seasonSynopsis: adaptationPlan.seriesSynopsis
          || fallbackBible.synopsis,
        tone: adaptationPlan.tone || fallbackBible.tone,
        characters: Array.isArray(adaptationPlan.characters)
          && adaptationPlan.characters.length
          ? adaptationPlan.characters
          : fallbackBible.characters,
        weapons: Array.isArray(adaptationPlan.weapons)
          && adaptationPlan.weapons.length
          ? adaptationPlan.weapons
          : fallbackBible.weapons,
        locations: Array.isArray(adaptationPlan.locations)
          && adaptationPlan.locations.length
          ? adaptationPlan.locations
          : fallbackBible.locations
      };
      bible.characters = bible.characters.map((item, index) => ({
        ...item,
        continuityId: item.continuityId || `CHAR-${String(index + 1).padStart(3, "0")}`
      }));
      bible.weapons = bible.weapons.map((item, index) => ({
        ...item,
        continuityId: item.continuityId || `PROP-${String(index + 1).padStart(3, "0")}`
      }));
      bible.locations = bible.locations.map((item, index) => ({
        ...item,
        continuityId: item.continuityId || `LOC-${String(index + 1).padStart(3, "0")}`
      }));
      const outlines = selectedOutlines;
      const episodes = [];
      for (let index = 0; index < outlines.length; index += 1) {
        const outline = outlines[index];
        let script = outline;
        if (this.config.mode === "live") {
          script = await this.ark.generateJson(
            "你是分集编剧和分镜导演。只输出 JSON，字段为 title、logline、sourceRange、script、continuityIn、continuityOut、segmentBriefs。segmentBriefs 必须严格包含 10 项，每项包含 order、beat、dialogue、visual、camera、sound、prompt。每项对应连续的 30 秒视频，prompt 必须锁定角色身份、服装、道具、场景方位、光线、时间和屏幕运动方向，并自然承接上一段。整集必须形成完整 5 分钟叙事。",
            `作品：${project.novelName}\n本季：第 ${selection.seasonNumber} 季，全书规划第 ${selection.startEpisode}-${selection.endEpisode} 集\n本季梗概：${bible.seasonSynopsis || bible.synopsis}\n全季角色：${JSON.stringify(bible.characters)}\n当前分集：${JSON.stringify(outline)}\n上一集连续性：${episodes[index - 1]?.continuityOut || "本季开场"}`
          );
        }
        const fallbackEpisode = fallbackBible.episodes[index];
        const briefs = Array.from(
          { length: Math.ceil(targetDurationSeconds / segmentDurationSeconds) },
          (_, segmentIndex) => script.segmentBriefs?.[segmentIndex]
            || fallbackEpisode.segmentBriefs[segmentIndex]
        );
        const episode = {
          ...outline,
          ...script,
          number: Number(outline.number) || selection.startEpisode + index,
          seasonOrder: index + 1,
          durationSeconds: targetDurationSeconds,
          durationMinutes: targetDurationSeconds / 60,
          contentStatus: "ready",
          segmentBriefs: briefs
        };
        episode.shots = makeShotsForDuration(
          project.novelName,
          episode.number,
          targetDurationSeconds,
          segmentDurationSeconds,
          briefs
        );
        episodes.push(episode);
        await this.update(project, {
          episodes: [...episodes],
          progress: 34 + Math.round(((index + 1) / episodeCount) * 18)
        }, `第 ${index + 1}/${episodeCount} 集剧本已完成`);
      }
      bible.episodes = episodes;
      await this.updateNode(project, "adapt", "completed", {
        output: {
          seasonTitle: bible.seasonTitle || `${project.novelName} · 第一季`,
          seasonSynopsis: bible.seasonSynopsis || bible.synopsis,
          tone: bible.tone,
          synopsis: bible.synopsis,
          characters: bible.characters || [],
          weapons: bible.weapons || [],
          locations: bible.locations || [],
          episodes: episodes.map(({ shots, segmentBriefs, ...item }) => ({
            ...item,
            contentStatus: "ready",
            segmentCount: shots.length,
            segmentBriefs
          })),
          contentReadyEpisodes: episodes.length,
          totalSegments: episodes.reduce((sum, episode) => sum + episode.shots.length, 0),
          seasonSelection: selection
        },
        projectPatch: {
          bible,
          episodes,
          targetDurationSeconds,
          episodeDurationSeconds: targetDurationSeconds,
          seasonEpisodeCount: episodeCount,
          contentPlanCompletedAt: now(),
          stage: "design",
          progress: 55
        },
        message: `第 ${selection.seasonNumber} 季 ${episodeCount} 集详细剧本与连续性档案已全部生成`
      });

      await this.updateNode(project, "design", "running", {
        input: {
          characters: bible.characters?.map((item) => item.name) || [],
          weapons: bible.weapons?.map((item) => item.name) || [],
          locations: bible.locations?.map((item) => item.name) || []
        }
      });
      let assets = buildAssets(project.novelName, bible);
      if (this.config.mode === "live" && this.config.ark.imageModel) {
        const assetsDirectory = path.join(this.config.dataDirectory, "assets", project.id);
        await mkdir(assetsDirectory, { recursive: true });
        assets = await Promise.all(assets.map(async (asset) => {
          const remoteUrl = await this.ark.generateImage(`${asset.prompt}, production concept art, consistent visual identity, no text`);
          const file = path.join(assetsDirectory, `${asset.id}.jpg`);
          await downloadFile(remoteUrl, file);
          return {
            ...asset,
            status: "approved",
            imageUrl: `/media/assets/${project.id}/${asset.id}.jpg`
          };
        }));
      }
      await this.updateNode(project, "design", "completed", {
        output: {
          assetCount: assets.length,
          assets: assets.map(({ id: assetId, type, name, status, imageUrl, prompt }) => ({ id: assetId, type, name, status, imageUrl, prompt }))
        },
        projectPatch: { assets, stage: "render", progress: 72 },
        message: "角色、武器与场景视觉资产已就绪"
      });

      await this.updateNode(project, "render", "running", {
        input: {
          episodeCount: episodes.length,
          episodeDurationSeconds: targetDurationSeconds,
          totalSegmentCount: episodes.reduce((sum, item) => sum + item.shots.length, 0),
          segmentDurationSeconds,
          renderOrder: "episode-sequential",
          continuityMode: "previous-last-frame",
          model: this.config.mode === "live" ? this.config.ark.videoModel : "planning"
        }
      });
      if (
        this.config.mode === "live"
        && overBudget
        && !budgetOverrunAllowed
        && project.budgetApproved !== true
      ) {
        const reason = `全季 ${episodeCount} 集预估 ¥${estimatedSeasonCost.toFixed(2)}（单集约 ¥${estimatedEpisodeCost.toFixed(2)}），超过当前预算上限 ¥${this.config.production.dailyBudgetCny.toFixed(2)}`;
        await this.updateNode(project, "render", "paused", {
          input: {
            episodeCount,
            episodeDurationSeconds: targetDurationSeconds,
            estimatedEpisodeCostCny: estimatedEpisodeCost,
            estimatedSeasonCostCny: estimatedSeasonCost,
            dailyBudgetCny: this.config.production.dailyBudgetCny
          },
          error: reason,
          projectPatch: {
            status: "budget-gate",
            stage: "render",
            progress: 72,
            episodes,
            error: reason
          },
          message: "全季内容已完成，视频生产等待预算确认"
        });
        return false;
      }
      if (this.config.mode === "live") {
        await this.submitVideoBatch(project, episodes);
        retainSlot = true;
      } else {
        for (const episode of episodes) {
          for (const shot of episode.shots) {
            shot.status = "simulated";
            shot.progress = 0;
          }
          episode.status = "planning-ready";
          episode.renderedSeconds = 0;
        }
        const totalSegments = episodes.reduce((sum, item) => sum + item.shots.length, 0);
        await this.updateNode(project, "render", "paused", {
          output: {
            totalEpisodes: episodes.length,
            contentReadyEpisodes: episodes.length,
            totalShots: totalSegments,
            completedShots: 0,
            simulatedShots: totalSegments,
            failedShots: 0,
            mode: "planning"
          },
          error: "规划模式只生成镜头规划，不调用 Seedance，也不会产出 MP4",
          projectPatch: {
            status: "planning-ready",
            stage: "render",
            progress: 72,
            completedAt: now(),
            episodes,
            error: null
          },
          message: `全季 ${episodes.length} 集内容规划已完成；未调用 Seedance`
        });
      }
    } catch (error) {
      const failedNode = project.nodes?.[project.stage];
      if (failedNode && failedNode.status === "running") {
        failedNode.status = "failed";
        failedNode.completedAt = now();
        failedNode.error = error.message;
      }
      await this.update(project, { status: "failed", completedAt: now(), error: error.message }, `任务失败：${error.message}`);
    } finally {
      this.active.delete(id);
    }
    return retainSlot;
  }

  async submitVideoBatch(project, episodes) {
    for (const episode of episodes) {
      episode.status = "queued";
      for (const shot of episode.shots) {
        shot.status = "queued";
        shot.progress = 0;
        delete shot.remoteTaskId;
        delete shot.localFile;
        delete shot.videoUrl;
        delete shot.lastFrameUrl;
        delete shot.lastFrameFile;
      }
    }
    await this.update(project, {
      status: "rendering",
      stage: "render",
      progress: 72,
      episodes
    }, `全季内容已锁定，开始按集顺序生成 ${episodes.length} 集视频`);
    await this.submitNextSequentialShot(project);
  }

  async continuityFrame(project, episodeIndex, shotIndex) {
    const previousShot = shotIndex > 0
      ? project.episodes[episodeIndex].shots[shotIndex - 1]
      : project.episodes[episodeIndex - 1]?.shots?.at(-1);
    if (!previousShot) return null;
    if (previousShot.lastFrameFile) {
      const bytes = await readFile(previousShot.lastFrameFile);
      return `data:image/jpeg;base64,${bytes.toString("base64")}`;
    }
    return previousShot.lastFrameUrl || null;
  }

  async submitNextSequentialShot(project) {
    const active = project.episodes
      .flatMap((episode) => episode.shots || [])
      .find((shot) => shot.remoteTaskId && ["submitted", "queued", "running"].includes(shot.status));
    if (active) return;
    const episodeIndex = project.episodes.findIndex((episode) => episode.status !== "completed");
    if (episodeIndex < 0) return;
    const episode = project.episodes[episodeIndex];
    episode.status = "rendering";
    const shotIndex = episode.shots.findIndex((shot) => shot.status === "queued" && !shot.remoteTaskId);
    if (shotIndex < 0) return;
    const shot = episode.shots[shotIndex];
    const firstFrameUrl = await this.continuityFrame(project, episodeIndex, shotIndex);
    const continuity = [
      shot.prompt,
      `全季连续性：${project.bible?.tone || "统一电影质感"}`,
      `本集承接：${episode.continuityIn || "自然承接上一集"}`,
      firstFrameUrl
        ? "严格延续输入首帧中的角色外观、服装、道具位置、场景空间、光线、镜头方向和动作势能。"
        : "建立本集连续性的角色外观、服装、道具、场景空间和光线基准。"
    ].join("\n");
    const task = await this.ark.createVideo({
      prompt: continuity,
      duration: shot.duration,
      ratio: "16:9",
      firstFrameUrl
    });
    shot.remoteTaskId = task.id;
    shot.status = "submitted";
    shot.progress = 5;
    shot.usedPreviousLastFrame = Boolean(firstFrameUrl);
    await this.update(project, { episodes: project.episodes },
      `第 ${episode.number} 集片段 ${shot.order}/${episode.shots.length} 已提交${firstFrameUrl ? "，已接入上一片段尾帧" : ""}`);
  }

  async reconcile(id) {
    if (this.active.has(`reconcile:${id}`)) return;
    this.active.add(`reconcile:${id}`);
    try {
      const project = await this.store.get(id);
      if (!project || project.status !== "rendering") return;
      const episode = project.episodes.find((item) => item.status === "rendering")
        || project.episodes.find((item) => item.status !== "completed");
      const shot = episode?.shots?.find((item) =>
        item.remoteTaskId && !["succeeded", "failed", "expired"].includes(item.status)
      );
      if (shot) {
        const task = await this.ark.getVideoTask(shot.remoteTaskId);
        shot.status = task.status;
        shot.progress = task.status === "succeeded" ? 100 : task.status === "running" ? 55 : task.status === "queued" ? 10 : 0;
        if (task.status === "failed" || task.status === "expired") {
          await this.update(project, { episodes: project.episodes },
            `片段 ${shot.id} 返回 ${task.status}`);
          throw new Error(`片段 ${shot.id} 渲染失败: ${task.error?.message || task.status}`);
        }
        if (task.status === "succeeded" && task.content?.video_url && !shot.localFile) {
          const clipsDirectory = path.join(this.config.dataDirectory, "clips", project.id);
          const framesDirectory = path.join(this.config.dataDirectory, "frames", project.id);
          await Promise.all([
            mkdir(clipsDirectory, { recursive: true }),
            mkdir(framesDirectory, { recursive: true })
          ]);
          const file = path.join(clipsDirectory, `${shot.id}.mp4`);
          await downloadFile(task.content.video_url, file);
          shot.localFile = file;
          shot.videoUrl = `/media/clips/${project.id}/${shot.id}.mp4`;
          if (task.content?.last_frame_url) {
            const frameFile = path.join(framesDirectory, `${shot.id}.jpg`);
            await downloadFile(task.content.last_frame_url, frameFile);
            shot.lastFrameFile = frameFile;
            shot.lastFrameUrl = task.content.last_frame_url;
          }
        }
      }
      const allShots = project.episodes.flatMap((item) => item.shots || []);
      const completed = allShots.filter((item) => item.status === "succeeded").length;
      const progress = 72 + Math.round((completed / allShots.length) * 26);
      if (project.nodes?.render) {
        project.nodes.render.output = {
          totalEpisodes: project.episodes.length,
          completedEpisodes: project.episodes.filter((item) => item.status === "completed").length,
          activeEpisode: episode?.number || null,
          totalShots: allShots.length,
          completedShots: completed,
          activeShots: allShots.filter((item) => ["submitted", "running"].includes(item.status)).length,
          queuedShots: allShots.filter((item) => item.status === "queued").length,
          failedShots: allShots.filter((item) => ["failed", "expired"].includes(item.status)).length,
          continuityMode: "previous-last-frame"
        };
      }
      await this.update(project, { episodes: project.episodes, progress },
        `全季视频进度 ${completed}/${allShots.length}，当前第 ${episode?.number || "-"} 集`);
      if (episode && episode.shots.every((item) => item.status === "succeeded")) {
        await this.assembleEpisode(project, episode);
      } else {
        await this.submitNextSequentialShot(project);
      }
    } catch (error) {
      const project = await this.store.get(id);
      if (project) await this.update(project, { status: "failed", error: error.message }, `生产失败：${error.message}`);
    } finally {
      this.active.delete(`reconcile:${id}`);
      const finalProject = await this.store.get(id);
      if (finalProject && finalProject.status !== "rendering") await this.scheduler.release(id);
    }
  }

  async assembleEpisode(project, episode) {
    const outputDirectory = path.join(this.config.dataDirectory, "output", project.id);
    await mkdir(outputDirectory, { recursive: true });
    const episodeId = String(episode.number).padStart(3, "0");
    const listFile = path.join(outputDirectory, `episode-${episodeId}-clips.txt`);
    const outputFile = path.join(outputDirectory, `episode-${episodeId}.mp4`);
    const quote = (value) => value.replace(/'/g, "'\\''");
    await writeFile(listFile, episode.shots.map((shot) => `file '${quote(shot.localFile)}'`).join("\n"));
    const targetDurationSeconds = Number(episode.durationSeconds)
      || episode.shots.reduce((sum, shot) => sum + Number(shot.duration || 0), 0);
    episode.status = "assembling";
    await this.update(project, { episodes: project.episodes },
      `正在装配第 ${episode.number} 集：${episode.shots.length} 个连续片段`);
    await run(this.config.ffmpeg, [
      "-y", "-f", "concat", "-safe", "0", "-i", listFile,
      "-t", String(targetDurationSeconds),
      "-c:v", "libx264", "-preset", "fast", "-crf", "20",
      "-c:a", "aac", "-movflags", "+faststart", outputFile
    ]);
    episode.status = "completed";
    episode.renderedSeconds = targetDurationSeconds;
    episode.videoUrl = `/media/output/${project.id}/episode-${episodeId}.mp4`;
    episode.completedAt = now();
    const completedEpisodes = project.episodes.filter((item) => item.status === "completed").length;
    const allCompleted = completedEpisodes === project.episodes.length;
    if (allCompleted && project.nodes?.render) {
      project.nodes.render.status = "completed";
      project.nodes.render.completedAt = now();
    }
    await this.updateNode(project, "assemble", allCompleted ? "completed" : "running", {
      output: {
        episodeCount: project.episodes.length,
        completedEpisodes,
        outputs: project.episodes
          .filter((item) => item.videoUrl)
          .map((item) => ({
            number: item.number,
            title: item.title,
            durationSeconds: item.renderedSeconds,
            videoUrl: item.videoUrl
          }))
      },
      projectPatch: {
        status: allCompleted ? "completed" : "rendering",
        stage: allCompleted ? "assemble" : "render",
        progress: allCompleted ? 100 : 72 + Math.round((completedEpisodes / project.episodes.length) * 26),
        completedAt: allCompleted ? now() : null,
        episodes: project.episodes
      },
      message: `第 ${episode.number}/${project.episodes.length} 集五分钟成片已完成${allCompleted ? "，全季生产结束" : "，开始下一集"}`
    });
    if (!allCompleted) {
      await this.submitNextSequentialShot(project);
    }
  }

  async exportManifest(id) {
    const project = await this.store.get(id);
    if (!project) throw new Error("项目不存在");
    const directory = path.join(this.config.dataDirectory, "exports", id);
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, "production-manifest.json");
    await writeFile(file, `${JSON.stringify(project, null, 2)}\n`);
    return file;
  }

  enqueue(id, options) {
    return this.scheduler.enqueue(id, options);
  }

  resume() {
    return this.scheduler.resume();
  }

  queueSnapshot() {
    return this.scheduler.snapshot();
  }
}

export { STAGES, buildDemoBible, buildSeriesBible, makeShots, makeShotsForDuration };
