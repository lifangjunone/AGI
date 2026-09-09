import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ArkClient } from "./ark-client.mjs";
import { loadAuthorizedText, searchNovel } from "./novel-search.mjs";
import { TaskScheduler } from "./task-scheduler.mjs";

const STAGES = ["discover", "ingest", "adapt", "design", "render", "assemble"];
const STAGE_LABELS = {
  discover: "全网检索",
  ingest: "内容核验",
  adapt: "剧本改编",
  design: "视觉设定",
  render: "镜头渲染",
  assemble: "成片装配"
};
const DEMO_IMAGE_ENDPOINT = "https://copilot-cn.bytedance.net/api/ide/v1/text_to_image";

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

function buildDemoBible(title, source, config) {
  const protagonist = title === "西游记" ? "孙悟空" : "主角";
  const companion = title === "西游记" ? "唐三藏" : "同行者";
  const episode = {
    number: 1,
    title: "风暴前夜",
    logline: `${protagonist}在旅程转折点发现异常征兆，被迫在使命与同伴安全之间做出选择。`,
    durationMinutes: config.production.episodeMinutes,
    sourceRange: "开篇核心事件",
    shots: makeShots(title, 1, config.production.shotsPerEpisode, config.production.shotSeconds)
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

  async create(novelName) {
    const title = String(novelName || "").trim();
    if (title.length < 2 || title.length > 100) throw new Error("小说名需为 2-100 个字符");
    const project = {
      id: randomUUID(),
      novelName: title,
      status: "queued",
      stage: "discover",
      progress: 2,
      mode: this.config.mode,
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
      assets: [],
      episodes: [],
      nodes: createPipelineNodes(title),
      activity: [{ at: now(), message: "生产任务已创建" }],
      error: null
    };
    await this.store.save(project);
    return this.scheduler.enqueue(project.id, { message: "任务已进入生产队列" });
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
      await this.updateNode(project, "ingest", "completed", {
        output: {
          sourceId: source.id,
          contentCharacters: sourceText.length,
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
      const estimatedCost = this.config.production.estimatedEpisodeVideoCostCny || 0;
      const overBudget = estimatedCost > this.config.production.dailyBudgetCny;
      if (
        this.config.mode === "live"
        && (!billableEnabled || (overBudget && !budgetOverrunAllowed))
      ) {
        const reason = !billableEnabled
          ? "真实生成未获计费授权；设置 ALLOW_BILLABLE_GENERATION=true 后重试"
          : `单集预估 ¥${estimatedCost.toFixed(2)}，超过日预算 ¥${this.config.production.dailyBudgetCny.toFixed(2)}；如确认超额，设置 ALLOW_BUDGET_OVERRUN=true`;
        await this.updateNode(project, "adapt", "paused", {
          input: {
            model: this.config.ark.planningModel || this.config.ark.textModel,
            estimatedEpisodeVideoCostCny: estimatedCost,
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
          targetMinutes: this.config.production.episodeMinutes,
          model: this.config.mode === "live"
            ? this.config.ark.planningModel || this.config.ark.textModel
            : "demo"
        }
      });
      let bible;
      if (this.config.mode === "live") {
        bible = await this.ark.generateJson(
          "你是影视制片统筹。只输出 JSON，字段为 tone、synopsis、characters、weapons、locations、episodes。角色/道具/地点必须带 continuityId。第一集严格15分钟并提供可拍摄剧情。",
          `作品：${project.novelName}\n来源：${source.title} / ${source.authors}\n内容：${(sourceText || source.description || "").slice(0, 120000)}`
        );
      } else {
        bible = buildDemoBible(project.novelName, source, this.config);
      }
      const episode = bible.episodes?.[0] || buildDemoBible(project.novelName, source, this.config).episodes[0];
      episode.shots = makeShots(
        project.novelName,
        episode.number || 1,
        this.config.production.shotsPerEpisode,
        this.config.production.shotSeconds
      );
      await this.updateNode(project, "adapt", "completed", {
        output: {
          tone: bible.tone,
          synopsis: bible.synopsis,
          characters: bible.characters || [],
          weapons: bible.weapons || [],
          locations: bible.locations || [],
          episodes: (bible.episodes || []).map(({ shots, ...item }) => ({ ...item, shotCount: shots?.length || 0 })),
          shotCount: episode.shots.length
        },
        projectPatch: { bible, episodes: [episode], stage: "design", progress: 55 },
        message: "剧本、角色与连续性档案已生成"
      });

      await this.updateNode(project, "design", "running", {
        input: {
          characters: bible.characters?.map((item) => item.name) || [],
          weapons: bible.weapons?.map((item) => item.name) || [],
          locations: bible.locations?.map((item) => item.name) || []
        }
      });
      let assets = buildAssets(project.novelName, bible);
      if (this.config.mode === "live") {
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
          shotCount: episode.shots.length,
          shotSeconds: this.config.production.shotSeconds,
          maxConcurrency: this.config.production.maxVideoConcurrency,
          model: this.config.mode === "live" ? this.config.ark.videoModel : "demo"
        }
      });
      if (this.config.mode === "live") {
        await this.submitVideoBatch(project, episode);
        retainSlot = true;
      } else {
        for (const shot of episode.shots) {
          shot.status = "simulated";
          shot.progress = 0;
        }
        episode.status = "demo-preview";
        episode.renderedSeconds = 0;
        await this.updateNode(project, "render", "paused", {
          output: {
            totalShots: episode.shots.length,
            completedShots: 0,
            simulatedShots: episode.shots.length,
            failedShots: 0,
            mode: "demo",
            shots: episode.shots.map(({ id: shotId, order, duration, status, progress, prompt, videoUrl }) => ({
              id: shotId, order, duration, status, progress, prompt, videoUrl
            }))
          },
          error: "演示模式只生成镜头规划，不调用 Seedance，也不会产出 MP4",
          projectPatch: {
            status: "demo-preview",
            stage: "render",
            progress: 72,
            completedAt: now(),
            episodes: [episode],
            error: null
          },
          message: "演示预览已完成；未调用 Seedance，未生成视频文件"
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

  async submitVideoBatch(project, episode) {
    episode.status = "rendering";
    for (const shot of episode.shots) {
      shot.status = "queued";
      shot.progress = 0;
      delete shot.remoteTaskId;
    }
    await this.submitAvailableShots(project, episode);
    await this.update(project, {
      status: "rendering",
      stage: "render",
      progress: 78,
      episodes: [episode]
    }, "首批镜头已提交，后续镜头将按并发槽自动接续");
  }

  async submitAvailableShots(project, episode) {
    const activeCount = episode.shots.filter((shot) =>
      shot.remoteTaskId && !["succeeded", "failed", "expired"].includes(shot.status)
    ).length;
    const available = Math.max(0, this.config.production.maxVideoConcurrency - activeCount);
    const nextShots = episode.shots
      .filter((shot) => shot.status === "queued" && !shot.remoteTaskId)
      .slice(0, available);
    if (!nextShots.length) return;
    const tasks = await Promise.all(nextShots.map(async (shot) => {
      const task = await this.ark.createVideo({
        prompt: shot.prompt,
        duration: this.config.production.shotSeconds,
        ratio: "16:9"
      });
      return [shot, task];
    }));
    for (const [shot, task] of tasks) {
      shot.remoteTaskId = task.id;
      shot.status = "submitted";
      shot.progress = 5;
    }
    await this.update(project, { episodes: [episode] }, `已补充提交 ${tasks.length} 个镜头任务`);
  }

  async reconcile(id) {
    if (this.active.has(`reconcile:${id}`)) return;
    this.active.add(`reconcile:${id}`);
    try {
      const project = await this.store.get(id);
      if (!project || project.status !== "rendering") return;
      const episode = project.episodes?.[0];
      const pending = (episode?.shots || [])
        .filter((shot) => shot.remoteTaskId && !["succeeded", "failed"].includes(shot.status))
        .slice(0, this.config.production.maxVideoConcurrency);
      const results = await Promise.all(pending.map(async (shot) => [shot, await this.ark.getVideoTask(shot.remoteTaskId)]));
      for (const [shot, task] of results) {
        shot.status = task.status;
        shot.progress = task.status === "succeeded" ? 100 : task.status === "running" ? 55 : task.status === "queued" ? 10 : 0;
        if (task.status === "failed" || task.status === "expired") {
          throw new Error(`镜头 ${shot.id} 渲染失败: ${task.error?.message || task.status}`);
        }
        if (task.status === "succeeded" && task.content?.video_url && !shot.localFile) {
          const clipsDirectory = path.join(this.config.dataDirectory, "clips", project.id);
          await mkdir(clipsDirectory, { recursive: true });
          const file = path.join(clipsDirectory, `${shot.id}.mp4`);
          await downloadFile(task.content.video_url, file);
          shot.localFile = file;
          shot.videoUrl = `/media/clips/${project.id}/${shot.id}.mp4`;
        }
      }
      await this.submitAvailableShots(project, episode);
      const completed = episode.shots.filter((shot) => shot.status === "succeeded").length;
      const progress = 78 + Math.round((completed / episode.shots.length) * 19);
      if (project.nodes?.render) {
        project.nodes.render.output = {
          totalShots: episode.shots.length,
          completedShots: completed,
          activeShots: episode.shots.filter((shot) => ["submitted", "running"].includes(shot.status)).length,
          queuedShots: episode.shots.filter((shot) => shot.status === "queued").length,
          failedShots: episode.shots.filter((shot) => ["failed", "expired"].includes(shot.status)).length,
          shots: episode.shots.map(({ id: shotId, order, duration, status, progress: shotProgress, prompt, videoUrl }) => ({
            id: shotId, order, duration, status, progress: shotProgress, prompt, videoUrl
          }))
        };
      }
      await this.update(project, { episodes: [episode], progress }, `镜头进度 ${completed}/${episode.shots.length}`);
      if (completed === episode.shots.length) await this.assemble(project, episode);
    } catch (error) {
      const project = await this.store.get(id);
      if (project) await this.update(project, { status: "failed", error: error.message }, `生产失败：${error.message}`);
    } finally {
      this.active.delete(`reconcile:${id}`);
      const finalProject = await this.store.get(id);
      if (finalProject && finalProject.status !== "rendering") await this.scheduler.release(id);
    }
  }

  async assemble(project, episode) {
    const outputDirectory = path.join(this.config.dataDirectory, "output", project.id);
    await mkdir(outputDirectory, { recursive: true });
    const listFile = path.join(outputDirectory, "clips.txt");
    const outputFile = path.join(outputDirectory, "episode-001.mp4");
    const quote = (value) => value.replace(/'/g, "'\\''");
    await writeFile(listFile, episode.shots.map((shot) => `file '${quote(shot.localFile)}'`).join("\n"));
    if (project.nodes?.render) {
      project.nodes.render.status = "completed";
      project.nodes.render.completedAt = now();
      project.nodes.render.output = {
        totalShots: episode.shots.length,
        completedShots: episode.shots.length,
        failedShots: 0,
        mode: "live",
        shots: episode.shots.map(({ id: shotId, order, duration, status, progress, prompt, videoUrl }) => ({
          id: shotId, order, duration, status, progress, prompt, videoUrl
        }))
      };
    }
    await this.updateNode(project, "assemble", "running", {
      input: {
        clipCount: episode.shots.length,
        targetDurationSeconds: this.config.production.episodeMinutes * 60,
        encoder: "libx264"
      },
      projectPatch: { stage: "assemble", progress: 98 },
      message: "正在使用 FFmpeg 装配 15 分钟成片"
    });
    await run(this.config.ffmpeg, [
      "-y", "-f", "concat", "-safe", "0", "-i", listFile,
      "-t", String(this.config.production.episodeMinutes * 60),
      "-c:v", "libx264", "-preset", "fast", "-crf", "20",
      "-c:a", "aac", "-movflags", "+faststart", outputFile
    ]);
    episode.status = "completed";
    episode.renderedSeconds = this.config.production.episodeMinutes * 60;
    episode.videoUrl = `/media/output/${project.id}/episode-001.mp4`;
    await this.updateNode(project, "assemble", "completed", {
      output: {
        episodeTitle: episode.title,
        durationSeconds: episode.renderedSeconds,
        videoUrl: episode.videoUrl,
        outputFile
      },
      projectPatch: { status: "completed", stage: "assemble", progress: 100, completedAt: now(), episodes: [episode] },
      message: "15 分钟成片已完成并归档"
    });
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

export { STAGES, buildDemoBible, makeShots };
