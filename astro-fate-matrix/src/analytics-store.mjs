import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const initialState = () => ({
  version: 1,
  visitors: {},
  records: []
});

const PROVINCE_ALIASES = [
  ["北京", ["北京"]],
  ["天津", ["天津"]],
  ["河北", ["河北", "石家庄"]],
  ["山西", ["山西", "太原"]],
  ["内蒙古", ["内蒙古", "呼和浩特"]],
  ["辽宁", ["辽宁", "沈阳"]],
  ["吉林", ["吉林", "长春"]],
  ["黑龙江", ["黑龙江", "哈尔滨"]],
  ["上海", ["上海"]],
  ["江苏", ["江苏", "南京", "苏州"]],
  ["浙江", ["浙江", "杭州", "宁波"]],
  ["安徽", ["安徽", "合肥"]],
  ["福建", ["福建", "福州", "厦门"]],
  ["江西", ["江西", "南昌"]],
  ["山东", ["山东", "济南", "青岛"]],
  ["河南", ["河南", "郑州"]],
  ["湖北", ["湖北", "武汉"]],
  ["湖南", ["湖南", "长沙"]],
  ["广东", ["广东", "广州", "深圳", "珠海"]],
  ["广西", ["广西", "南宁"]],
  ["海南", ["海南", "海口"]],
  ["重庆", ["重庆"]],
  ["四川", ["四川", "成都"]],
  ["贵州", ["贵州", "贵阳"]],
  ["云南", ["云南", "昆明"]],
  ["西藏", ["西藏", "拉萨"]],
  ["陕西", ["陕西", "西安"]],
  ["甘肃", ["甘肃", "兰州", "陇南", "天水", "酒泉", "嘉峪关", "张掖", "武威", "白银", "定西", "平凉", "庆阳", "临夏", "甘南"]],
  ["青海", ["青海", "西宁"]],
  ["宁夏", ["宁夏", "银川"]],
  ["新疆", ["新疆", "乌鲁木齐"]],
  ["香港", ["香港"]],
  ["澳门", ["澳门"]],
  ["台湾", ["台湾", "台北"]]
];

export function inferProvince(place = "") {
  const text = String(place || "");
  for (const [province, aliases] of PROVINCE_ALIASES) {
    if (aliases.some((alias) => text.includes(alias))) return province;
  }
  return "未知";
}

export function maskName(value) {
  const name = String(value || "匿名").trim() || "匿名";
  if (name === "匿名") return name;
  if (name.length <= 1) return `${name}*`;
  return `${name.slice(0, 1)}${"*".repeat(Math.min(2, name.length - 1))}`;
}

export function visitorHash(visitorId) {
  return createHash("sha256").update(String(visitorId || "")).digest("hex").slice(0, 12);
}

export class AnalyticsStore {
  constructor(path) {
    this.path = path;
    this.state = initialState();
    this.writeChain = Promise.resolve();
  }

  async load() {
    try {
      this.state = { ...initialState(), ...JSON.parse(await readFile(this.path, "utf8")) };
      this.state.visitors ||= {};
      this.state.records ||= [];
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.state = initialState();
    }
  }

  async save() {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(this.state, null, 2));
    await rename(tmp, this.path);
  }

  async mutate(fn) {
    this.writeChain = this.writeChain.then(async () => {
      await this.load();
      const result = fn(this.state);
      await this.save();
      return result;
    });
    return this.writeChain;
  }

  quotaFor(visitorId, freeLimit = 3) {
    const visitor = this.state.visitors[visitorId] || { used: 0 };
    return { used: visitor.used || 0, remaining: Math.max(0, freeLimit - (visitor.used || 0)), limit: freeLimit };
  }

  async recordAnalysis({ visitorId, userId, input, fortune, source, model }) {
    const createdAt = new Date().toISOString();
    const province = inferProvince(input.birthPlace || fortune?.subject?.birthPlace || "");
    return this.mutate((state) => {
      const visitor = state.visitors[visitorId] || { used: 0, firstSeenAt: createdAt };
      visitor.used = (visitor.used || 0) + 1;
      visitor.lastSeenAt = createdAt;
      state.visitors[visitorId] = visitor;
      const record = {
        id: randomUUID(),
        createdAt,
        visitorId,
        visitorHash: visitorHash(visitorId),
        userId: userId || "",
        province,
        input,
        summary: {
          name: fortune.subject.name,
          birthDate: fortune.subject.birthDate,
          birthTime: fortune.subject.birthTime,
          birthPlace: fortune.subject.birthPlace,
          sunSign: fortune.astrology.sunSign.name,
          ascendant: fortune.astrology.ascendant.name,
          zodiac: fortune.bazi.yearAnimal,
          peachDirection: fortune.romance.direction,
          peachProvinces: fortune.romance.provinces
        },
        source,
        modelUsed: Boolean(model?.used),
        modelId: model?.modelId || "lym-chat-quality"
      };
      state.records.push(record);
      if (state.records.length > 5000) state.records = state.records.slice(-5000);
      return { record, quota: { used: visitor.used, remaining: Math.max(0, 3 - visitor.used), limit: 3 } };
    });
  }

  publicStats() {
    const provinceMap = new Map();
    for (const record of this.state.records) {
      const province = record.province || "未知";
      provinceMap.set(province, (provinceMap.get(province) || 0) + 1);
    }
    const provinceStats = [...provinceMap.entries()]
      .map(([province, count]) => ({ province, count }))
      .sort((a, b) => b.count - a.count || a.province.localeCompare(b.province, "zh-Hans-CN"));
    const recent = this.state.records.slice(-12).reverse().map((record) => ({
      at: record.createdAt,
      name: maskName(record.summary?.name),
      place: record.summary?.birthPlace || record.input?.birthPlace || "未知地点",
      province: record.province || "未知",
      sunSign: record.summary?.sunSign || "",
      peachDirection: record.summary?.peachDirection || ""
    }));
    return {
      total: this.state.records.length,
      provinceStats,
      recent,
      updatedAt: new Date().toISOString()
    };
  }

  adminStats() {
    const today = new Date().toISOString().slice(0, 10);
    const publicStats = this.publicStats();
    const todayCount = this.state.records.filter((record) => record.createdAt.startsWith(today)).length;
    return {
      ...publicStats,
      todayCount,
      visitorCount: Object.keys(this.state.visitors).length,
      modelUsedCount: this.state.records.filter((record) => record.modelUsed).length,
      records: this.state.records.slice(-200).reverse()
    };
  }
}
