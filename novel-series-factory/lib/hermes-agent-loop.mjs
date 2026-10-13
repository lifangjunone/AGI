import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

const PROJECT_ID = /^[0-9a-f-]{36}$/;
const SESSION_ID = /^[0-9a-f-]{36}$/;
const ALLOWED_TOOLS = new Set([
  "get_project_state",
  "update_character",
  "update_voice",
  "update_continuity_policy",
  "update_episode",
  "update_episode_continuity",
  "prepare_production_assets",
  "regenerate_episode",
  "assemble_series",
  "apply_format_recommendation",
]);
const ASYNC_TOOLS = new Set(["regenerate_episode"]);

function text(value, limit = 800) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function parseJson(value) {
  const source = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(source);
  } catch {
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(source.slice(start, end + 1));
    throw new Error("导演 Agent 没有返回有效计划");
  }
}

function projectContext(project) {
  return {
    id: project.id,
    title: project.title,
    status: project.status,
    specification: project.specification,
    episodes: (project.seriesPlan?.episodes || []).map(item => ({
      number: item.number,
      title: item.title,
      summary: item.summary,
      status: project.episodeStates?.find(state => state.number === item.number)?.status || "not_started",
    })),
    characters: (project.productionBible?.characters || []).map(item => ({
      id: item.id, name: item.name, visualAnchor: item.visualAnchor,
      defaultWardrobe: item.defaultWardrobe, locked: item.locked,
    })),
    voices: (project.productionBible?.voices || []).map(item => ({
      id: item.id, characterId: item.characterId, characterName: item.characterName,
      speaker: item.speaker, direction: item.direction, locked: item.locked,
    })),
    props: (project.productionBible?.props || []).map(item => ({
      id: item.id, name: item.name, description: item.description, locked: item.locked,
    })),
    continuity: project.productionBible?.continuity,
    productionAssetReadiness: project.productionAssetReadiness,
    completedEpisodes: (project.assets?.episodes || []).map(item => item.number),
    assembly: project.assembly,
  };
}

function normalizeAction(raw) {
  const tool = text(raw?.tool, 80);
  if (!ALLOWED_TOOLS.has(tool)) throw new Error(`Agent 请求了未授权工具：${tool || "unknown"}`);
  return {
    id: randomUUID(),
    tool,
    arguments: raw?.arguments && typeof raw.arguments === "object" && !Array.isArray(raw.arguments)
      ? raw.arguments : {},
    reason: text(raw?.reason, 300),
  };
}

function findEpisodeNumbers(message) {
  const values = new Set();
  for (const match of String(message).matchAll(/第\s*(\d+)\s*集/g)) values.add(Number(match[1]));
  return [...values].filter(Number.isInteger);
}

function fallbackPlan(message, project) {
  const prompt = text(message, 4000);
  const episodes = findEpisodeNumbers(prompt);
  const completed = new Set((project.assets?.episodes || []).map(item => item.number));
  const actions = [];
  const character = (project.productionBible?.characters || [])
    .find(item => prompt.includes(item.name));
  if (character && /(换|穿|服装|衣服|造型)/.test(prompt)) {
    const wardrobe = text(prompt
      .replace(new RegExp(`^.*?${character.name}`), "")
      .replace(/从第\s*\d+\s*集开始/, "")
      .replace(/^(换成?|穿上?|的?服装改成?)/, ""), 500);
    for (const episodeNumber of episodes.length ? episodes : [1]) {
      actions.push(normalizeAction({
        tool: "update_episode_continuity",
        arguments: {
          episodeNumber,
          characters: [{ characterId: character.id, wardrobe: wardrobe || "按导演要求换装", reason: prompt }],
          note: prompt,
        },
        reason: `更新${character.name}在第 ${episodeNumber} 集的服装连续性`,
      }));
    }
  }
  if (episodes.length && /(重生成|重新生成|修复.*集)/.test(prompt)) {
    for (const episodeNumber of episodes) actions.push(normalizeAction({
      tool: "regenerate_episode", arguments: { episodeNumber },
      reason: `重新生成第 ${episodeNumber} 集`,
    }));
  }
  if (episodes.length && /(结尾|剧情|摘要|标题|更悬疑|脚本)/.test(prompt) &&
      !actions.some(item => item.tool === "regenerate_episode")) {
    for (const episodeNumber of episodes) actions.push(normalizeAction({
      tool: "update_episode",
      arguments: { episodeNumber, instruction: prompt },
      reason: `按要求调整第 ${episodeNumber} 集剧情`,
    }));
  }
  const asksForVisualChange = /(结尾|帧|画面|镜头|最后|ending|end frame|狗|猫|动物|特写)/i.test(prompt);
  const needsRegeneration = /(生成|改成|换成|变成|重做|重拍|呈现|出现)/.test(prompt) || asksForVisualChange;
  if (needsRegeneration) {
    for (const episodeNumber of episodes) {
      if (completed.has(episodeNumber) && actions.some(item =>
        item.tool === "update_episode" && Number(item.arguments.episodeNumber) === episodeNumber) &&
        !actions.some(item =>
          item.tool === "regenerate_episode" && Number(item.arguments.episodeNumber) === episodeNumber)) {
        actions.push(normalizeAction({
          tool: "regenerate_episode",
          arguments: { episodeNumber },
          reason: `让第 ${episodeNumber} 集按新结尾重新生成，避免继续播放旧成片`,
        }));
      }
    }
  }
  if (/检查.*连续性/.test(prompt)) actions.push(normalizeAction({
    tool: "get_project_state", arguments: {}, reason: "读取并检查当前连续性状态",
  }));
  if (!actions.length) throw new Error("我还不能可靠识别这项修改。请明确人物或分集，例如“把第 2 集结尾改得更悬疑”。");
  return { reply: "我已根据当前作品整理出修改计划。", actions };
}

function approvalFor(action, project) {
  const completed = new Set((project.assets?.episodes || []).map(item => item.number));
  if (action.tool === "prepare_production_assets") return { required: true, billable: true, destructive: false, reason: "会调用图像与语音模型生成资产" };
  if (action.tool === "regenerate_episode") return {
    required: true, billable: true, destructive: completed.has(Number(action.arguments.episodeNumber)),
    reason: completed.has(Number(action.arguments.episodeNumber)) ? "会产生模型费用并覆盖已有分集成片" : "会调用付费视频模型",
  };
  if (action.tool === "assemble_series") return { required: true, billable: false, destructive: Boolean(project.assembly?.video), reason: "会重新合并或覆盖全集文件" };
  if (action.tool === "apply_format_recommendation") return { required: true, billable: false, destructive: false, reason: "会重建分集方案" };
  if (action.tool === "update_voice") return { required: true, billable: false, destructive: completed.size > 0, reason: "更换角色固定音色会影响跨集一致性" };
  if (action.tool === "update_character" && completed.size > 0) return { required: true, billable: false, destructive: true, reason: "人物形象变更会使已有视觉资产和成片失效" };
  if (action.tool === "update_episode" && completed.has(Number(action.arguments.episodeNumber))) return { required: true, billable: false, destructive: true, reason: "修改已有成片对应剧本会使该集成片过期" };
  if (action.tool === "update_episode_continuity" && completed.has(Number(action.arguments.episodeNumber))) return { required: true, billable: false, destructive: true, reason: "修改已有成片的连续性会使该集成片过期" };
  return { required: false, billable: false, destructive: false, reason: "" };
}

async function requestModelPlan(env, message, project) {
  const hermesEnabled = String(env.HERMES_ENABLED || "").toLowerCase() === "true";
  const hermesMode = env.HERMES_MODE || "embedded";
  const baseUrl = hermesEnabled && hermesMode === "api" ? env.HERMES_API_URL : env.ARK_BASE_URL;
  const apiKey = hermesEnabled && hermesMode === "api" ? env.HERMES_API_KEY : env.ARK_API_KEY;
  const model = hermesEnabled && hermesMode === "api"
    ? (env.HERMES_MODEL || env.ARK_LLM_MODEL) : env.ARK_LLM_MODEL;
  if (!baseUrl || !model) return fallbackPlan(message, project);
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const endpoint = normalizedBaseUrl.endsWith("/chat/completions")
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: `你是故事片场的 Hermes 导演 Agent。把自然语言修改转换为严格 JSON 计划，不执行动作。
只可使用工具：${[...ALLOWED_TOOLS].join(", ")}。
返回格式：{"reply":"简短说明","actions":[{"tool":"工具名","arguments":{},"reason":"原因"}]}。
update_episode 参数：episodeNumber，以及 title、summary、instruction 中至少一个。
update_character 参数：characterId，以及 visualAnchor、description、defaultWardrobe 中至少一个。
update_voice 参数：voiceId，以及 speaker、direction 中至少一个。
update_episode_continuity 参数：episodeNumber、characters、props、note。
如果用户要求修改已完成分集的画面、结尾、最后一帧、镜头或具体可见物体，必须先 update_episode 写入明确 instruction，再追加 regenerate_episode 重新生成该集；否则只会让剧本过期但不会产生新视频。
不要编造 ID，必须使用上下文中的 ID。用户只要求分析时用 get_project_state。`,
        },
        { role: "user", content: `当前作品：${JSON.stringify(projectContext(project))}\n\n导演要求：${text(message, 4000)}` },
      ],
    }),
    signal: AbortSignal.timeout(Number(env.MODEL_REQUEST_TIMEOUT_MS || 120000)),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Hermes 规划失败（HTTP ${response.status}）：${body.slice(0, 300)}`);
  const payload = JSON.parse(body);
  const plan = parseJson(payload?.choices?.[0]?.message?.content);
  return {
    reply: text(plan.reply, 800) || "我已整理出修改计划。",
    actions: (Array.isArray(plan.actions) ? plan.actions : []).map(normalizeAction),
    model: payload.model || model,
    requestId: payload.id || null,
  };
}

export function createHermesAgentLoop({ pipeline, dataDir, env = {}, planner = requestModelPlan }) {
  const projectsDir = join(dataDir, "projects");
  const maxRounds = Math.max(1, Math.min(20, Number(env.HERMES_MAX_ROUNDS || 8)));

  function sessionPath(projectId, sessionId) {
    if (!PROJECT_ID.test(projectId) || !SESSION_ID.test(sessionId)) throw new Error("无效的 Agent 会话");
    return join(projectsDir, projectId, "agent-sessions", `${sessionId}.json`);
  }

  async function save(session) {
    const directory = join(projectsDir, session.projectId, "agent-sessions");
    await mkdir(directory, { recursive: true });
    const target = sessionPath(session.projectId, session.id);
    const temporary = `${target}.${randomUUID()}.tmp`;
    session.updatedAt = new Date().toISOString();
    await writeFile(temporary, JSON.stringify(session, null, 2), "utf8");
    await rename(temporary, target);
    return session;
  }

  async function readStored(projectId, sessionId) {
    return JSON.parse(await readFile(sessionPath(projectId, sessionId), "utf8"));
  }

  async function reconcile(session) {
    if (session.status !== "running") return session;
    const submitted = session.toolCalls.filter(call => call.status === "submitted");
    if (!submitted.length) {
      const executed = new Set(session.toolCalls
        .filter(call => ["completed", "failed"].includes(call.status))
        .map(call => call.actionId));
      const hasRemaining = session.plan.actions.some(action => !executed.has(action.id));
      if (!hasRemaining) {
        session.status = "completed";
        session.reply = "修改和视频重新生成均已完成，并已验证新成片状态。";
        session.result = projectContext(await pipeline.read(session.projectId));
        return save(session);
      }
      if (pipeline.isScheduled?.(session.projectId)) {
        session.reply = "前一集已完成验收，正在释放生产任务并准备下一集。";
        return save(session);
      }
      return execute(session);
    }
    const project = await pipeline.read(session.projectId);
    let changed = false;
    for (const call of submitted) {
      if (call.tool !== "regenerate_episode") continue;
      const episodeNumber = Number(call.arguments?.episodeNumber);
      const episode = project.episodeStates?.find(item => item.number === episodeNumber);
      const next = episode?.status || "queued";
      call.verification = {
        ...(call.verification || {}),
        projectUpdatedAt: project.updatedAt,
        projectStatus: project.status,
        episodeStatus: next,
        episodeStage: episode?.stage || "等待生成",
        episodeProgress: Number(episode?.progress || 0),
      };
      if (next === "completed") {
        call.status = "completed";
        call.completedAt = new Date().toISOString();
        changed = true;
      } else if (next === "failed" || project.status === "failed") {
        call.status = "failed";
        call.completedAt = new Date().toISOString();
        call.error = episode?.error || project.error || "分集生成失败";
        changed = true;
      }
    }
    const failed = session.toolCalls.find(call => call.status === "failed");
    const pending = session.toolCalls.some(call => call.status === "submitted");
    if (failed) {
      session.status = "failed";
      session.error = failed.error;
      session.reply = `视频生成失败：${failed.error}`;
      changed = true;
    } else if (!pending) {
      const executed = new Set(session.toolCalls
        .filter(call => ["completed", "failed", "submitted"].includes(call.status))
        .map(call => call.actionId));
      const hasRemaining = session.plan.actions.some(action => !executed.has(action.id));
      if (hasRemaining) {
        if (pipeline.isScheduled?.(session.projectId)) {
          session.reply = "前一集已完成验收，正在释放生产任务并准备下一集。";
          return save(session);
        }
        await save(session);
        return execute(session);
      }
      session.status = "completed";
      session.reply = "修改和视频重新生成均已完成，并已验证新成片状态。";
      session.result = projectContext(project);
      changed = true;
    } else {
      const active = session.toolCalls.find(call => call.status === "submitted");
      const verification = active?.verification || {};
      session.reply = `修改已应用，正在${verification.episodeStage || "重新生成分集"} · ${verification.episodeProgress || 0}%`;
      changed = true;
    }
    return changed ? save(session) : session;
  }

  async function read(projectId, sessionId) {
    return reconcile(await readStored(projectId, sessionId));
  }

  async function executeAction(action, projectId) {
    const args = action.arguments || {};
    switch (action.tool) {
      case "get_project_state": return projectContext(await pipeline.read(projectId));
      case "update_character": return pipeline.updateProductionBible(projectId, { ...args, characterId: args.characterId });
      case "update_voice": return pipeline.updateProductionBible(projectId, { ...args, voiceId: args.voiceId });
      case "update_continuity_policy": return pipeline.updateProductionBible(projectId, { continuity: args });
      case "update_episode": return pipeline.updateEpisodePlan(
        projectId, Number(args.episodeNumber), { ...args, allowCompleted: true },
      );
      case "update_episode_continuity": return pipeline.updateEpisodeContinuity(projectId, Number(args.episodeNumber), args, { allowCompleted: true });
      case "prepare_production_assets": return pipeline.prepareProductionAssets(projectId);
      case "regenerate_episode": return pipeline.startEpisode(projectId, Number(args.episodeNumber));
      case "assemble_series": return pipeline.assembleSeries(projectId);
      case "apply_format_recommendation": return pipeline.applyFormatRecommendation(projectId);
      default: throw new Error(`Agent 工具未授权：${action.tool}`);
    }
  }

  async function execute(session) {
    session.status = "running";
    session.rounds = Math.min(maxRounds, (session.rounds || 0) + 1);
    await save(session);
    try {
      for (const action of session.plan.actions) {
        const previous = session.toolCalls.find(call => call.actionId === action.id);
        if (previous && ["completed", "submitted"].includes(previous.status)) continue;
        const startedAt = new Date().toISOString();
        try {
          await executeAction(action, session.projectId);
          const verified = await pipeline.read(session.projectId);
          const asynchronous = ASYNC_TOOLS.has(action.tool) &&
            ["queued", "running"].includes(verified.episodeStates?.find(item =>
              item.number === Number(action.arguments.episodeNumber))?.status);
          session.toolCalls.push({
            actionId: action.id, tool: action.tool, arguments: action.arguments,
            status: asynchronous ? "submitted" : "completed", startedAt,
            ...(asynchronous ? { submittedAt: new Date().toISOString() } :
              { completedAt: new Date().toISOString() }),
            verification: {
              projectUpdatedAt: verified.updatedAt,
              projectStatus: verified.status,
              episodeStatus: verified.episodeStates?.find(item =>
                item.number === Number(action.arguments.episodeNumber))?.status || null,
              episodeStage: verified.episodeStates?.find(item =>
                item.number === Number(action.arguments.episodeNumber))?.stage || null,
              episodeProgress: verified.episodeStates?.find(item =>
                item.number === Number(action.arguments.episodeNumber))?.progress || 0,
            },
          });
        } catch (error) {
          session.toolCalls.push({
            actionId: action.id, tool: action.tool, arguments: action.arguments,
            status: "failed", startedAt, completedAt: new Date().toISOString(), error: error.message,
          });
          throw error;
        }
        await save(session);
        if (session.toolCalls.at(-1)?.status === "submitted") break;
      }
      const hasSubmitted = session.toolCalls.some(call => call.status === "submitted");
      const executed = new Set(session.toolCalls
        .filter(call => ["completed", "submitted"].includes(call.status))
        .map(call => call.actionId));
      const hasRemaining = session.plan.actions.some(action => !executed.has(action.id));
      session.status = hasSubmitted || hasRemaining ? "running" : "completed";
      session.reply = hasSubmitted
        ? "修改已应用，视频重新生成任务已提交；完成前会持续显示真实进度。"
        : hasRemaining
          ? "前序动作已完成，正在继续执行下一步。"
        : "修改已执行，并已重新读取作品状态完成验证。";
      if (!hasSubmitted && !hasRemaining) {
        session.result = projectContext(await pipeline.read(session.projectId));
      }
    } catch (error) {
      session.status = "failed";
      session.error = text(error.message, 1000);
      session.reply = `执行在“${session.toolCalls.at(-1)?.tool || "未知步骤"}”停止：${session.error}`;
    }
    return save(session);
  }

  return {
    async message(projectId, message) {
      const prompt = text(message, 4000);
      if (!prompt) throw new Error("请输入你想修改的内容");
      const project = await pipeline.read(projectId);
      if (["queued", "running"].includes(project.status)) throw new Error("作品正在生成，请完成后再让导演 Agent 修改");
      const planned = await planner(env, prompt, project);
      const actions = this.expandActionsForRegeneration(
        project,
        prompt,
        (Array.isArray(planned.actions) ? planned.actions : []).map(normalizeAction),
      );
      if (!actions.length) throw new Error("导演 Agent 没有提出可执行修改");
      if (actions.length > maxRounds) throw new Error(`单次最多执行 ${maxRounds} 个修改动作，请拆分要求`);
      const approvals = actions.map(action => ({ actionId: action.id, ...approvalFor(action, project) }));
      const needsApproval = approvals.some(item => item.required) || actions.length > 1;
      const now = new Date().toISOString();
      const session = {
        id: randomUUID(), projectId, status: needsApproval ? "needs_approval" : "planned",
        createdAt: now, updatedAt: now, prompt, reply: planned.reply,
        runtime: String(env.HERMES_ENABLED).toLowerCase() === "true" ? `hermes:${env.HERMES_MODE || "embedded"}` : "embedded-compatible",
        model: planned.model || env.ARK_LLM_MODEL || null,
        requestId: planned.requestId || null,
        rounds: 0,
        plan: { actions, approvals },
        approvalToken: needsApproval ? randomUUID() : null,
        toolCalls: [],
      };
      await save(session);
      return needsApproval ? session : execute(session);
    },
    read,
    async approve(projectId, sessionId, approvalToken) {
      const session = await readStored(projectId, sessionId);
      if (session.status !== "needs_approval") throw new Error("该计划不在等待确认状态");
      if (!approvalToken || approvalToken !== session.approvalToken) throw new Error("审批令牌无效或已过期");
      session.approvedAt = new Date().toISOString();
      session.approvalToken = null;
      return execute(session);
    },
    async cancel(projectId, sessionId) {
      const session = await readStored(projectId, sessionId);
      if (!["needs_approval", "planned"].includes(session.status)) throw new Error("该会话不能取消");
      session.status = "cancelled";
      session.approvalToken = null;
      session.reply = "修改计划已取消，作品没有发生变化。";
      return save(session);
    },
    expandActionsForRegeneration(project, prompt, actions) {
      const completed = new Set((project.assets?.episodes || []).map(item => item.number));
      const asksForVisualChange = /(结尾|帧|画面|镜头|最后|ending|end frame|狗|猫|动物|特写)/i.test(prompt);
      if (!asksForVisualChange) return actions;
      const expanded = [...actions];
      for (const action of actions) {
        const episodeNumber = Number(action.arguments?.episodeNumber);
        if (action.tool !== "update_episode" || !completed.has(episodeNumber)) continue;
        if (expanded.some(item => item.tool === "regenerate_episode" &&
            Number(item.arguments?.episodeNumber) === episodeNumber)) continue;
        expanded.push(normalizeAction({
          tool: "regenerate_episode",
          arguments: { episodeNumber },
          reason: `按新的画面/结尾要求重新生成第 ${episodeNumber} 集`,
        }));
      }
      return expanded;
    },
    allowedTools: [...ALLOWED_TOOLS],
  };
}
