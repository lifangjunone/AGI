import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ArkClient } from "./ark-client.mjs";
import { loadAuthorizedText, searchNovel } from "./novel-search.mjs";

const STAGES = ["discover", "ingest", "adapt", "design", "render", "assemble"];
const DEMO_IMAGE_ENDPOINT = "https://copilot-cn.bytedance.net/api/ide/v1/text_to_image";

function now() {
  return new Date().toISOString();
}

function imageUrl(prompt, imageSize = "landscape_16_9") {
  return `${DEMO_IMAGE_ENDPOINT}?prompt=${encodeURIComponent(prompt)}&image_size=${imageSize}`;
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
  constructor(config, store) {
    this.config = config;
    this.store = store;
    this.ark = new ArkClient(config.ark);
    this.active = new Set();
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
      source: null,
      sources: [],
      bible: null,
      assets: [],
      episodes: [],
      activity: [{ at: now(), message: "生产任务已创建" }],
      error: null
    };
    await this.store.save(project);
    queueMicrotask(() => this.run(project.id));
    return project;
  }

  async update(project, patch, message) {
    Object.assign(project, patch, { updatedAt: now() });
    if (message) project.activity.unshift({ at: now(), message });
    project.activity = project.activity.slice(0, 30);
    await this.store.save(project);
  }

  async run(id) {
    if (this.active.has(id)) return;
    this.active.add(id);
    const project = await this.store.get(id);
    if (!project) return;

    try {
      await this.update(project, { status: "running", stage: "discover", progress: 8 }, "正在检索可信内容源");
      const sources = await searchNovel(project.novelName, this.config.search);
      const source = sources.find((item) => item.rights === "public-domain") || sources[0];
      if (!source) throw new Error("未找到可识别的小说来源");
      await this.update(project, { sources, source, stage: "ingest", progress: 20 }, `已匹配 ${source.source}`);

      if (!["public-domain", "public-domain-candidate"].includes(source.rights)) {
        await this.update(project, {
          status: "rights-review",
          progress: 22,
          error: "仅找到元数据或待授权网页，需获得作品授权后才能处理正文"
        }, "版权门禁已暂停正文处理");
        return;
      }

      const sourceText = await loadAuthorizedText(source).catch(() => "");
      await this.update(project, { stage: "adapt", progress: 34 }, "正文与梗概已进入改编引擎");
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
      await this.update(project, { bible, episodes: [episode], stage: "design", progress: 55 }, "剧本、角色与连续性档案已生成");

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
      await this.update(project, { assets, stage: "render", progress: 72 }, "角色、武器与场景视觉资产已就绪");

      const billableEnabled = process.env.ALLOW_BILLABLE_GENERATION === "true";
      if (this.config.mode === "live" && !billableEnabled) {
        await this.update(project, {
          status: "budget-gate",
          progress: 72,
          error: "真实视频生成已停在预算门禁；设置 ALLOW_BILLABLE_GENERATION=true 后重启任务"
        }, "预算门禁阻止了批量付费调用");
        return;
      }

      if (this.config.mode === "live") {
        await this.submitVideoBatch(project, episode);
      } else {
        for (const shot of episode.shots) {
          shot.status = "succeeded";
          shot.progress = 100;
        }
        episode.status = "preview-ready";
        episode.renderedSeconds = this.config.production.episodeMinutes * 60;
        await this.update(project, {
          status: "completed",
          stage: "assemble",
          progress: 100,
          episodes: [episode]
        }, "演示生产链路已完成，切换 live 可提交真实镜头");
      }
    } catch (error) {
      await this.update(project, { status: "failed", error: error.message }, `任务失败：${error.message}`);
    } finally {
      this.active.delete(id);
    }
  }

  async submitVideoBatch(project, episode) {
    episode.status = "rendering";
    for (const shot of episode.shots) {
      const task = await this.ark.createVideo({
        prompt: shot.prompt,
        duration: this.config.production.shotSeconds,
        ratio: "16:9"
      });
      shot.remoteTaskId = task.id;
      shot.status = "submitted";
      shot.progress = 5;
      await this.update(project, { episodes: [episode], progress: 75 }, `已提交镜头 ${shot.id}`);
    }
    await this.update(project, {
      status: "rendering",
      stage: "render",
      progress: 78,
      episodes: [episode]
    }, "本集镜头已全部提交，等待方舟异步渲染");
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
      const completed = episode.shots.filter((shot) => shot.status === "succeeded").length;
      const progress = 78 + Math.round((completed / episode.shots.length) * 19);
      await this.update(project, { episodes: [episode], progress }, `镜头进度 ${completed}/${episode.shots.length}`);
      if (completed === episode.shots.length) await this.assemble(project, episode);
    } catch (error) {
      const project = await this.store.get(id);
      if (project) await this.update(project, { status: "failed", error: error.message }, `生产失败：${error.message}`);
    } finally {
      this.active.delete(`reconcile:${id}`);
    }
  }

  async assemble(project, episode) {
    const outputDirectory = path.join(this.config.dataDirectory, "output", project.id);
    await mkdir(outputDirectory, { recursive: true });
    const listFile = path.join(outputDirectory, "clips.txt");
    const outputFile = path.join(outputDirectory, "episode-001.mp4");
    const quote = (value) => value.replace(/'/g, "'\\''");
    await writeFile(listFile, episode.shots.map((shot) => `file '${quote(shot.localFile)}'`).join("\n"));
    await this.update(project, { stage: "assemble", progress: 98 }, "正在使用 FFmpeg 装配 15 分钟成片");
    await run(this.config.ffmpeg, [
      "-y", "-f", "concat", "-safe", "0", "-i", listFile,
      "-t", String(this.config.production.episodeMinutes * 60),
      "-c:v", "libx264", "-preset", "fast", "-crf", "20",
      "-c:a", "aac", "-movflags", "+faststart", outputFile
    ]);
    episode.status = "completed";
    episode.renderedSeconds = this.config.production.episodeMinutes * 60;
    episode.videoUrl = `/media/output/${project.id}/episode-001.mp4`;
    await this.update(project, {
      status: "completed",
      stage: "assemble",
      progress: 100,
      episodes: [episode]
    }, "15 分钟成片已完成并归档");
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
}

export { STAGES, buildDemoBible, makeShots };
