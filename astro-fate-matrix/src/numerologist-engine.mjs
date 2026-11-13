import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const vendorRoot = join(root, "vendor", "Numerologist_skills");
const ziweiCli = join(vendorRoot, "ziwei-doushu", "scripts", "ziwei_cli.py");
const qimenCli = join(vendorRoot, "qimen-dunjia", "scripts", "qimen_cli.py");
function defaultPython() {
  return process.env.NUMEROLOGIST_PYTHON || "python3";
}

function defaultTimeoutMs() {
  return Number(process.env.NUMEROLOGIST_TIMEOUT_MS || 12000);
}

const SHICHEN_MIDPOINT = {
  子: "00:00",
  丑: "01:00",
  寅: "03:00",
  卯: "05:00",
  辰: "07:00",
  巳: "09:00",
  午: "11:00",
  未: "13:00",
  申: "15:00",
  酉: "17:00",
  戌: "19:00",
  亥: "21:00"
};

const PALACE_DIRECTION_PROVINCES = {
  北: ["北京", "天津", "河北", "内蒙古"],
  东北: ["辽宁", "吉林", "黑龙江"],
  东: ["上海", "江苏", "浙江", "山东"],
  东南: ["福建", "广东", "海南", "台湾"],
  南: ["广东", "广西", "海南"],
  西南: ["四川", "重庆", "云南", "贵州"],
  西: ["陕西", "甘肃", "宁夏", "青海"],
  西北: ["新疆", "青海", "内蒙古", "甘肃"],
  中: ["出生地周边", "常驻城市", "熟人网络"]
};

export function normalizeProfessionalGender(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["男", "男生", "男性", "male", "m"].includes(raw)) return "男";
  if (["女", "女生", "女性", "female", "f"].includes(raw)) return "女";
  return null;
}

function exactBirthTime(subject) {
  const branch = String(subject?.birthTime || "").match(/^([子丑寅卯辰巳午未申酉戌亥])时/)?.[1];
  if (branch && SHICHEN_MIDPOINT[branch]) return SHICHEN_MIDPOINT[branch];
  const match = String(subject?.birthTime || "").match(/^(\d{2}:\d{2})/);
  return match?.[1] || "12:00";
}

export function buildZiweiPayload(fortune, queryYear = new Date().getFullYear()) {
  const gender = normalizeProfessionalGender(fortune?.subject?.gender);
  if (!gender) {
    return { skipped: true, reason: "gender_required_for_ziwei" };
  }
  return {
    calendar_type: "solar",
    birth_time: `${fortune.subject.birthDate} ${exactBirthTime(fortune.subject)}`,
    gender,
    late_zi_rule: "next_day",
    leap_month_rule: "split_15",
    query_year: queryYear,
    ruleset: "ziwei-sanhe-v1"
  };
}

export function buildQimenPayload(fortune, now = new Date()) {
  const city = fortune?.subject?.birthPlace && fortune.subject.birthPlace !== "未填写"
    ? fortune.subject.birthPlace
    : "中国";
  const timeInput = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(now).replace("T", " ");
  return {
    question_type: "感情桃花",
    question_goal: "近期更容易出现缘分信号的行动方位、省份和时机",
    time_input: timeInput,
    calendar_type: "solar",
    location: {
      country: "中国",
      city,
      timezone: "Asia/Shanghai"
    },
    ruleset: "mainline-cn-v1"
  };
}

async function runJsonCli(scriptPath, payload, { python = defaultPython(), timeoutMs = defaultTimeoutMs() } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "astro-fate-numerologist-"));
  const inputPath = join(directory, "input.json");
  const outputPath = join(directory, "output.json");
  await writeFile(inputPath, JSON.stringify(payload), "utf8");
  const result = await new Promise((resolve) => {
    const child = spawn(python, [scriptPath, "--input", inputPath, "--output", outputPath], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, signal: null, stdout, stderr: error.message });
    });
  });
  let output = null;
  try {
    output = JSON.parse(await readFile(outputPath, "utf8"));
  } catch {
    output = null;
  }
  if (result.code !== 0 || output?.error || !output) {
    throw new Error(output?.error || result.stderr || `cli_failed:${result.code || result.signal}`);
  }
  return output;
}

function directionByPalace(qimen, palaceNumber) {
  const palace = qimen?.chart?.palaces?.find((item) => item.palace === palaceNumber);
  if (!palace) return null;
  const direction = String(palace.direction || "中");
  return {
    palace: palace.palace,
    name: palace.name,
    direction,
    provinces: PALACE_DIRECTION_PROVINCES[direction] || PALACE_DIRECTION_PROVINCES.中,
    door: palace.door,
    star: palace.star,
    god: palace.god
  };
}

function summarizeZiwei(output) {
  const chart = output.chart || {};
  const palaces = chart.palaces || [];
  const byName = (name) => palaces.find((item) => item.name === name);
  const keyPalaces = ["命宫", "夫妻", "官禄", "财帛", "福德"].map((name) => {
    const palace = byName(name);
    if (!palace) return null;
    return {
      name,
      branch: palace.branch,
      ganzhi: palace.ganzhi,
      majorStars: (palace.major_stars || []).map((star) => star.name || star).slice(0, 4),
      sihua: (palace.sihua || []).slice(0, 4),
      decadal: palace.decadal
    };
  }).filter(Boolean);
  return {
    available: true,
    ruleset: output.ruleset?.id || "ziwei-sanhe-v1",
    mouthfeel: "紫微斗数用于观察人生宫位结构、关系课题与阶段主题。",
    mingGong: chart.ming_gong,
    shenGong: chart.shen_gong,
    wuxingJu: chart.wuxing_ju,
    mingZhu: chart.ming_zhu,
    shenZhu: chart.shen_zhu,
    decadalDirection: chart.decadal_direction,
    yearSihua: chart.year_sihua,
    currentHoroscope: output.horoscope || null,
    keyPalaces,
    warnings: output.warnings || []
  };
}

function summarizeQimen(output) {
  const chart = output.chart || {};
  const hourYima = chart.hour_yima || {};
  const dayYima = chart.day_yima || {};
  const hourDirection = directionByPalace(output, hourYima.palace);
  const dayDirection = directionByPalace(output, dayYima.palace);
  const zhishiDirection = directionByPalace(output, chart.zhishi?.palace);
  const positivePatterns = (chart.detected_patterns || []).filter((item) => item.nature === "吉").slice(0, 4);
  const riskPatterns = (chart.detected_patterns || []).filter((item) => item.nature === "凶").slice(0, 4);
  const preferred = hourDirection || dayDirection || zhishiDirection;
  return {
    available: true,
    ruleset: output.ruleset?.id || "mainline-cn-v1",
    mouthfeel: "奇门遁甲用于观察当下行动方位、时机和外部场域。",
    questionGoal: output.normalized_input?.question_goal,
    ganzhi: output.ganzhi,
    chart: {
      dunType: chart.dun_type,
      yuan: chart.yuan,
      juNumber: chart.ju_number,
      activeJie: output.calendar?.jieqi?.active_jie,
      timeStemVisible: chart.time_stem_visible,
      zhifu: chart.zhifu,
      zhishi: chart.zhishi
    },
    actionDirection: preferred,
    hourYima: { ...hourYima, direction: hourDirection },
    dayYima: { ...dayYima, direction: dayDirection },
    zhishiDirection,
    positivePatterns,
    riskPatterns,
    warnings: output.warnings || []
  };
}

function buildSynthesis(fortune, ziwei, qimen) {
  const systems = ["星座", "轻量八字"];
  if (ziwei?.available) systems.push("紫微斗数");
  if (qimen?.available) systems.push("奇门遁甲");
  const highlights = [];
  if (ziwei?.mingGong) {
    highlights.push(`紫微命宫在${ziwei.mingGong.branch || "-"}，身宫落${ziwei.shenGong?.palace || ziwei.shenGong?.branch || "-"}，适合把人生结构拆成宫位主题看。`);
  }
  if (qimen?.actionDirection) {
    highlights.push(`奇门行动方位偏${qimen.actionDirection.direction}，可关注${qimen.actionDirection.provinces.join("、")}相关的人脉和出行场景。`);
  }
  highlights.push(`基础桃花位仍以${fortune.romance.direction}为底色，专业引擎用于补充“何时动、往哪边动”。`);
  return {
    available: Boolean(ziwei?.available || qimen?.available),
    systems,
    label: systems.length >= 4 ? "四维合参" : "专业增强",
    highlights
  };
}

export async function buildProfessionalReading(fortune, { now = new Date() } = {}) {
  const errors = [];
  let ziwei = { available: false, reason: "not_run" };
  let qimen = { available: false, reason: "not_run" };

  const ziweiPayload = buildZiweiPayload(fortune, now.getFullYear());
  if (ziweiPayload.skipped) {
    ziwei = { available: false, reason: ziweiPayload.reason };
  } else {
    try {
      ziwei = summarizeZiwei(await runJsonCli(ziweiCli, ziweiPayload));
    } catch (error) {
      ziwei = { available: false, reason: "ziwei_unavailable" };
      errors.push({ engine: "ziwei", message: error.message });
    }
  }

  try {
    qimen = summarizeQimen(await runJsonCli(qimenCli, buildQimenPayload(fortune, now)));
  } catch (error) {
    qimen = { available: false, reason: "qimen_unavailable" };
    errors.push({ engine: "qimen", message: error.message });
  }

  return {
    enabled: true,
    source: "Numerologist_skills",
    available: Boolean(ziwei.available || qimen.available),
    ziwei,
    qimen,
    synthesis: buildSynthesis(fortune, ziwei, qimen),
    errors
  };
}
