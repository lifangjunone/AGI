export interface SentenceFrame {
  frame: string;
  example: string;
  translation: string;
  slot: string;
  usage: string;
}

const sentenceFrames: SentenceFrame[] = [
  {
    frame: "I work in ...",
    example: "I work in product design for a technology company.",
    translation: "我在一家科技公司从事产品设计工作。",
    slot: "行业 / 职能 / 工作领域",
    usage: "自我介绍时说明职业领域"
  },
  {
    frame: "Most of my time goes into ...",
    example: "Most of my time goes into researching user needs.",
    translation: "我的大部分时间都用于研究用户需求。",
    slot: "主要职责 / 经常投入的事情",
    usage: "补充说明日常工作的重点"
  },
  {
    frame: "What I mean is ...",
    example: "What I mean is that we need more time to test the product.",
    translation: "我的意思是，我们需要更多时间测试产品。",
    slot: "需要澄清的完整观点",
    usage: "纠正误解或换一种方式解释"
  },
  {
    frame: "The main reason is ...",
    example: "The main reason is that this option is easier to maintain.",
    translation: "主要原因是这个方案更容易维护。",
    slot: "原因或依据",
    usage: "表达观点后补充核心原因"
  },
  {
    frame: "Could I get ...?",
    example: "Could I get a medium latte with oat milk?",
    translation: "我可以要一杯中杯燕麦奶拿铁吗？",
    slot: "商品 / 饮品 / 服务",
    usage: "点单或礼貌提出需求"
  },
  {
    frame: "Can I have that without ...?",
    example: "Can I have that without sugar, please?",
    translation: "那个可以不加糖吗？",
    slot: "不需要的配料或选项",
    usage: "修改订单中的具体要求"
  },
  {
    frame: "I have a reservation under ...",
    example: "I have a reservation under the name Li Fangjun.",
    translation: "我用李芳军这个名字预订了房间。",
    slot: "预订人姓名",
    usage: "酒店或餐厅办理预订确认"
  },
  {
    frame: "Could you help me with ...?",
    example: "Could you help me with the air conditioner in my room?",
    translation: "你能帮我处理一下房间里的空调问题吗？",
    slot: "需要协助的问题",
    usage: "礼貌请求工作人员提供帮助"
  },
  {
    frame: "So far, we've ...",
    example: "So far, we've completed the design and started testing.",
    translation: "到目前为止，我们已经完成设计并开始测试。",
    slot: "已经完成的进展",
    usage: "工作汇报中概括当前进度"
  },
  {
    frame: "The main blocker is ...",
    example: "The main blocker is that we are still waiting for customer data.",
    translation: "目前最主要的阻碍是我们仍在等待客户数据。",
    slot: "阻碍进展的问题",
    usage: "同步风险并说明延误原因"
  },
  {
    frame: "I see your point, but ...",
    example: "I see your point, but we should also consider the long-term cost.",
    translation: "我理解你的观点，但我们也应该考虑长期成本。",
    slot: "保留意见或补充观点",
    usage: "会议中礼貌表达不同意见"
  },
  {
    frame: "A good example would be ...",
    example: "A good example would be the launch project I led last year.",
    translation: "一个很好的例子是我去年负责的发布项目。",
    slot: "支持观点的具体案例",
    usage: "面试或汇报中用案例支撑结论"
  },
  {
    frame: "What I learned from that was ...",
    example: "What I learned from that was how to communicate under pressure.",
    translation: "我从那件事中学会了如何在压力下沟通。",
    slot: "经验带来的收获",
    usage: "复盘经历并说明成长"
  }
];

function normalizeFrame(value: string) {
  return value
    .trim()
    .replace(/…+/g, "...")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

const frameIndex = new Map(
  sentenceFrames.map((frame) => [normalizeFrame(frame.frame), frame])
);

export function getSentenceFrame(text: string): SentenceFrame | undefined {
  return frameIndex.get(normalizeFrame(text));
}

export function isSentenceFrame(text: string): boolean {
  return /\.{3}|…/.test(text);
}
