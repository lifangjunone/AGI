import type { Persona, Scenario } from "./data";
import type { Difficulty } from "./language";

export type DialogueReply = {
  english: string;
  chinese: string;
  coachCue: string;
  suggestions: Array<{ english: string; chinese: string }>;
};

const defaultSuggestions = [
  { english: "Could you tell me more about that?", chinese: "您可以再多说一点吗？" },
  { english: "The most important detail is...", chinese: "最重要的细节是……" }
];

function reply(
  english: string,
  chinese: string,
  coachCue: string,
  suggestions = defaultSuggestions
): DialogueReply {
  return { english, chinese, coachCue, suggestions };
}

function firstPhrase(input: string) {
  const normalized = input.replace(/\s+/g, " ").trim().replace(/[.!?]+$/u, "");
  return normalized.length > 68 ? `${normalized.slice(0, 65)}...` : normalized;
}

function contextualFallback(input: string, persona: Persona): DialogueReply {
  const phrase = firstPhrase(input);
  return reply(
    `I heard you say, "${phrase}." That helps me understand your point. What happened next, and what was the result?`,
    `我听到你说：“${phrase}”。这让我更理解你的意思了。接下来发生了什么，结果如何？`,
    "用一个结果或具体例子把回答说完整",
    [
      { english: "The result was...", chinese: "结果是……" },
      { english: "One specific example is...", chinese: "一个具体例子是……" }
    ]
  );
}

function interviewReply(input: string, persona: Persona): DialogueReply | null {
  const text = input.toLowerCase();
  if (/\b(project|product|campaign|launch|team)\b/.test(text)) {
    return reply(
      `You mentioned a project. What decision did you personally make, ${persona.name.split(" ")[0]}, and how did you measure its impact?`,
      "你提到了一个项目。你亲自做了什么决策，又如何衡量它的影响？",
      "用“我的决策 + 可量化结果”回答",
      [
        { english: "I decided to..., which resulted in...", chinese: "我决定……，结果……" },
        { english: "We measured success by...", chinese: "我们通过……衡量成功。" }
      ]
    );
  }
  if (/\b(year|experience|worked|career|role)\b/.test(text)) {
    return reply(
      "That gives me a sense of your background. Which part of that experience best prepares you for this role?",
      "这让我了解了你的背景。其中哪段经历最能证明你适合这个岗位？",
      "把经历与当前岗位要求直接关联",
      [
        { english: "It prepared me because...", chinese: "它让我胜任这个岗位，因为……" },
        { english: "The most relevant skill is...", chinese: "最相关的能力是……" }
      ]
    );
  }
  if (/\b(strength|weakness|challenge|difficult)\b/.test(text)) {
    return reply(
      "Thank you for being specific. Can you give me one situation where that strength or challenge changed the outcome?",
      "谢谢你说得这么具体。能给我一个例子，说明这个优势或挑战如何改变结果吗？",
      "用 STAR：情境、任务、行动、结果",
      [
        { english: "In that situation, I...", chinese: "在那个情境中，我……" },
        { english: "The outcome was...", chinese: "结果是……" }
      ]
    );
  }
  return null;
}

function restaurantReply(input: string): DialogueReply | null {
  const text = input.toLowerCase();
  if (/\b(recommend|recommendation|suggest)\b/.test(text)) {
    return reply(
      "The sea bass is light and fresh, while the mushroom risotto is richer. Would you prefer something lighter or more filling?",
      "海鲈鱼清爽鲜美，蘑菇烩饭更浓郁饱腹。你想吃清淡一些还是更有饱足感的？",
      "在两个选择中表达偏好",
      [
        { english: "I'd prefer something light, so...", chinese: "我想吃清淡一点，所以……" },
        { english: "I'd like the more filling option.", chinese: "我想要更有饱足感的选择。" }
      ]
    );
  }
  if (/\b(allerg|dairy|vegetarian|vegan|gluten)\b/.test(text)) {
    return reply(
      "Thank you for letting me know. I will check that carefully. Is this an allergy we should avoid completely, or a dietary preference?",
      "谢谢你告诉我。我会认真确认。这是必须完全避免的过敏原，还是饮食偏好？",
      "说明限制的严重程度",
      [
        { english: "It's an allergy, so please avoid it completely.", chinese: "这是过敏原，请完全避免。" },
        { english: "It's a preference, if possible.", chinese: "这是偏好，可以的话请尽量避免。" }
      ]
    );
  }
  if (/\b(order|have|take|would like|i'll|get)\b/.test(text)) {
    return reply(
      "Excellent choice. Would you like anything to drink while the kitchen prepares that?",
      "很好的选择。厨房准备餐点时，你想喝点什么吗？",
      "完成点单后自然追加一项需求",
      [
        { english: "Could I have sparkling water, please?", chinese: "请给我一杯气泡水。" },
        { english: "I'd like a glass of red wine.", chinese: "我想要一杯红酒。" }
      ]
    );
  }
  return null;
}

function hotelReply(input: string): DialogueReply | null {
  const text = input.toLowerCase();
  if (/\b(quiet|room|elevator|floor|view)\b/.test(text)) {
    return reply(
      "I can arrange a quiet room away from the elevators. Would you prefer a city view or a garden view?",
      "我可以安排一间远离电梯的安静房间。你更喜欢城市景观还是花园景观？",
      "确认需求后补充一个偏好",
      [
        { english: "A city view would be great.", chinese: "城市景观就很好。" },
        { english: "I'd prefer the garden view.", chinese: "我更喜欢花园景观。" }
      ]
    );
  }
  if (/\b(reservation|booking|under|name)\b/.test(text)) {
    return reply(
      "Thank you. I have located the reservation. Could you confirm your arrival date and how many nights you will be staying?",
      "谢谢。我已找到预订。请确认抵达日期以及入住几晚。",
      "用日期和数量完整确认信息",
      [
        { english: "I'm arriving on... and staying for... nights.", chinese: "我将在……抵达，入住……晚。" },
        { english: "The booking is for... nights.", chinese: "预订是……晚。" }
      ]
    );
  }
  if (/\b(breakfast|gym|pool|wifi|facility|facilities)\b/.test(text)) {
    return reply(
      "Breakfast is served from seven to ten thirty on the second floor. Would you also like me to explain the other hotel facilities?",
      "早餐在二楼供应，时间是七点到十点半。你还需要我介绍其他酒店设施吗？",
      "听到信息后继续提出一个相关问题",
      [
        { english: "Yes, where is the gym?", chinese: "好的，健身房在哪里？" },
        { english: "No, that's all for now. Thank you.", chinese: "不用了，目前这些就够了，谢谢。" }
      ]
    );
  }
  return null;
}

function clinicReply(input: string): DialogueReply | null {
  const text = input.toLowerCase();
  if (/\b(headache|pain|hurt|ache|sore|dizzy|fever)\b/.test(text)) {
    return reply(
      "I understand. On a scale from one to ten, how strong is it, and when did you first notice it?",
      "我明白了。按一到十分计算，症状有多强？你最早是什么时候发现的？",
      "说清程度和开始时间",
      [
        { english: "It's about a... and it started...", chinese: "大约是……分，开始于……" },
        { english: "I first noticed it when...", chinese: "我最早在……时注意到它。" }
      ]
    );
  }
  if (/\b(yesterday|today|morning|evening|week|since)\b/.test(text)) {
    return reply(
      "Thank you. Has it been getting better, worse, or staying about the same since then?",
      "谢谢。从那以后，症状是在好转、加重，还是基本没有变化？",
      "使用比较级描述变化",
      [
        { english: "It has been getting worse in the evening.", chinese: "它在晚上会越来越严重。" },
        { english: "It has stayed about the same.", chinese: "它基本没有变化。" }
      ]
    );
  }
  return null;
}

function airportReply(input: string): DialogueReply | null {
  const text = input.toLowerCase();
  if (/\b(water|drink|blanket|jacket|bag)\b/.test(text)) {
    return reply(
      "I can bring that for you right away. Is there anything else you need before takeoff?",
      "我马上为你拿来。起飞前还有其他需要吗？",
      "用礼貌方式追加或结束请求",
      [
        { english: "That's all for now, thank you.", chinese: "暂时就这些，谢谢。" },
        { english: "Could I also have...", chinese: "我还可以要……吗？" }
      ]
    );
  }
  if (/\b(seat|change|window|aisle)\b/.test(text)) {
    return reply(
      "Let me check the available seats for you. Would you prefer an aisle seat or a window seat if we can make the change?",
      "让我为你查看可用座位。如果可以调整，你更希望靠过道还是靠窗？",
      "明确表达座位偏好",
      [
        { english: "I'd prefer an aisle seat, please.", chinese: "我想要靠过道的座位。" },
        { english: "A window seat would be ideal.", chinese: "靠窗座位最好。" }
      ]
    );
  }
  return null;
}

function smallTalkReply(input: string): DialogueReply | null {
  const text = input.toLowerCase();
  if (/\b(first time|first|new|visit)\b/.test(text)) {
    return reply(
      "It is my first time too. What made you choose this place today?",
      "我也是第一次来。今天是什么让你选择来这里？",
      "把共同点延展成一个开放问题",
      [
        { english: "A friend recommended it to me.", chinese: "朋友推荐我来的。" },
        { english: "I was curious about the coffee.", chinese: "我对这里的咖啡很好奇。" }
      ]
    );
  }
  if (/\b(neighborhood|area|live|work)\b/.test(text)) {
    return reply(
      "I know this area a little. Do you come here often, or are you exploring somewhere new today?",
      "我对这个区域略有了解。你经常来这里，还是今天第一次探索新地方？",
      "用频率或新体验回应",
      [
        { english: "I come here quite often because...", chinese: "我常来这里，因为……" },
        { english: "I'm exploring it for the first time.", chinese: "我是第一次来探索。" }
      ]
    );
  }
  return null;
}

export function createScenarioDialogueReply(
  input: string,
  scenario: Scenario,
  persona: Persona,
  difficulty: Difficulty
): DialogueReply {
  const specific =
    (scenario.id === "interview" ? interviewReply(input, persona) : null) ??
    (scenario.id === "restaurant" ? restaurantReply(input) : null) ??
    (scenario.id === "hotel" ? hotelReply(input) : null) ??
    (scenario.id === "clinic" ? clinicReply(input) : null) ??
    (scenario.id === "airport" ? airportReply(input) : null) ??
    (scenario.id === "small-talk" ? smallTalkReply(input) : null) ??
    contextualFallback(input, persona);

  if (difficulty === "A1") {
    return reply(
      "Good. Please tell me one more detail.",
      "很好。请再告诉我一个细节。",
      "用一个完整短句补充信息",
      [{ english: "One more detail is...", chinese: "还有一个细节是……" }]
    );
  }

  if (difficulty === "C1" || difficulty === "C2") {
    return {
      ...specific,
      english: `That is clear. ${specific.english}`,
      chinese: `你的表达很清楚。${specific.chinese}`
    };
  }

  return specific;
}
