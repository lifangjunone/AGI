import type { ScenarioId } from "./data";
import type { LocalizedLine, SubtitleMode } from "./language";

export type ListeningSpeaker = "host" | "guest";

export type ListeningLine = LocalizedLine & {
  speaker: ListeningSpeaker;
};

export type ListeningRound = {
  label: string;
  shortLabel: string;
  subtitleMode: SubtitleMode;
};

export const listeningRounds: ListeningRound[] = [
  { label: "第一遍 · 盲听", shortLabel: "盲听", subtitleMode: "none" },
  { label: "第二遍 · 英文字幕", shortLabel: "英文", subtitleMode: "english" },
  { label: "第三遍 · 中英字幕", shortLabel: "双语", subtitleMode: "en-zh" },
  { label: "第四遍 · 盲听复测", shortLabel: "复测", subtitleMode: "none" }
];

const scripts: Record<
  ScenarioId,
  Array<readonly [ListeningSpeaker, string, string]>
> = {
  interview: [
    ["host", "Good morning, Daniel. Thank you for coming in today.", "早上好，Daniel。谢谢你今天来参加面试。"],
    ["guest", "Good morning. Thank you for giving me the opportunity.", "早上好。谢谢您给我这次机会。"],
    ["host", "Could you begin by telling me about your current role?", "可以先介绍一下你目前的工作吗？"],
    ["guest", "I lead a small product team that builds tools for retail businesses.", "我带领一个小型产品团队，为零售企业开发工具。"],
    ["host", "What project from the past year are you most proud of?", "过去一年里，你最自豪的是哪个项目？"],
    ["guest", "We redesigned the ordering process and reduced customer waiting time by thirty percent.", "我们重新设计了订购流程，将顾客等待时间减少了百分之三十。"],
    ["host", "What was your personal contribution to that result?", "你个人为这个结果做了什么贡献？"],
    ["guest", "I interviewed users, set priorities, and helped the engineers test the new workflow.", "我访谈了用户、确定优先级，并协助工程师测试新流程。"],
    ["host", "Tell me about a difficult decision you had to make.", "说说你曾经必须做出的一个困难决定。"],
    ["guest", "I delayed one feature so we could fix a reliability problem before launch.", "我推迟了一项功能，以便在发布前解决可靠性问题。"],
    ["host", "How did you explain that decision to your stakeholders?", "你是如何向利益相关者解释这个决定的？"],
    ["guest", "I showed them the risk, the customer impact, and a revised delivery plan.", "我向他们说明了风险、客户影响和调整后的交付计划。"],
    ["host", "What did you learn from the experience?", "你从这次经历中学到了什么？"],
    ["guest", "I learned that early transparency creates trust, even when the news is difficult.", "我明白了，即使消息不理想，尽早坦诚也能建立信任。"],
    ["host", "How would your teammates describe your leadership style?", "你的同事会如何描述你的领导风格？"],
    ["guest", "They would probably say I am calm, direct, and willing to listen.", "他们可能会说我冷静、直接并且愿意倾听。"],
    ["host", "Why are you interested in joining our company now?", "你为什么现在想加入我们公司？"],
    ["guest", "I want to solve larger problems and work with a more international team.", "我想解决更大的问题，并与更国际化的团队合作。"],
    ["host", "That makes sense. What questions do you have for me?", "很合理。你有什么问题想问我？"],
    ["guest", "How will success in this role be measured during the first six months?", "这个岗位前六个月的成功标准是什么？"],
    ["host", "We look at customer outcomes, team collaboration, and the quality of your decisions.", "我们会看客户成果、团队协作以及决策质量。"],
    ["guest", "That is helpful. Those priorities match the way I like to work.", "这很有帮助。这些重点与我的工作方式很契合。"],
    ["host", "Excellent. We will contact you after the final interviews.", "很好。最终面试结束后我们会联系你。"],
    ["guest", "Thank you for your time. I enjoyed our conversation.", "感谢您的时间。我很享受这次交流。"]
  ],
  restaurant: [
    ["host", "Good evening. Welcome to Hudson Table.", "晚上好。欢迎来到 Hudson Table。"],
    ["guest", "Thank you. We have a reservation for two under Chen.", "谢谢。我们以 Chen 的名字预订了两位。"],
    ["host", "I found it. Your table by the window is ready.", "找到了。您的窗边座位已经准备好了。"],
    ["guest", "That is perfect. Could we see the menu, please?", "太好了。可以给我们看看菜单吗？"],
    ["host", "Of course. Our seasonal menu is on the first page.", "当然。我们的时令菜单在第一页。"],
    ["guest", "What would you recommend for someone who prefers lighter food?", "如果喜欢清淡一些的食物，您推荐什么？"],
    ["host", "The grilled sea bass is fresh, and it comes with lemon vegetables.", "烤海鲈鱼很新鲜，搭配柠檬蔬菜。"],
    ["guest", "That sounds good. Does the sauce contain any dairy?", "听起来不错。酱汁里含乳制品吗？"],
    ["host", "The standard sauce contains butter, but we can prepare it with olive oil.", "标准酱汁含黄油，但我们可以改用橄榄油。"],
    ["guest", "Please use olive oil. I have a mild dairy allergy.", "请使用橄榄油。我对乳制品有轻微过敏。"],
    ["host", "Thank you for telling me. I will mark the allergy on your order.", "谢谢您告诉我。我会在订单上标注过敏信息。"],
    ["guest", "Could we also have sparkling water for the table?", "可以再给我们一瓶气泡水吗？"],
    ["host", "Certainly. Would you like to order a starter to share?", "当然。你们想点一份前菜分享吗？"],
    ["guest", "We will share the tomato salad without cheese.", "我们分享一份不加奶酪的番茄沙拉。"],
    ["host", "Great choice. I will bring the water and send your order to the kitchen.", "很好的选择。我会送来水并把订单交给厨房。"],
    ["guest", "Excuse me, could we have another plate for the salad?", "打扰一下，可以再给我们一个装沙拉的盘子吗？"],
    ["host", "Absolutely. How is the sea bass so far?", "当然可以。海鲈鱼味道怎么样？"],
    ["guest", "It is excellent, especially with the lemon vegetables.", "非常好吃，尤其是搭配柠檬蔬菜。"],
    ["host", "I am glad you like it. Would you care for dessert?", "很高兴您喜欢。想要甜点吗？"],
    ["guest", "Could you recommend something without dairy?", "您能推荐一款不含乳制品的甜点吗？"],
    ["host", "The mango sorbet is dairy-free and not too sweet.", "芒果雪葩不含乳制品，而且不会太甜。"],
    ["guest", "We will share one, please, and then we would like the bill.", "请给我们一份分享，然后我们想结账。"],
    ["host", "Certainly. I will bring the sorbet and prepare the bill.", "好的。我会送来雪葩并准备账单。"],
    ["guest", "Thank you. The service has been wonderful.", "谢谢。服务非常好。"]
  ],
  hotel: [
    ["host", "Welcome to the Meridian Hotel. How may I help you?", "欢迎来到 Meridian 酒店。有什么可以帮您？"],
    ["guest", "Hello. I have a reservation under the name Li.", "您好。我以 Li 的名字预订了房间。"],
    ["host", "I found your booking for three nights in a deluxe room.", "我找到了您三晚豪华房的预订。"],
    ["guest", "That is correct. Is a quiet room available?", "没错。有安静的房间吗？"],
    ["host", "Yes. I can place you away from the elevators on the tenth floor.", "有。我可以为您安排十楼远离电梯的房间。"],
    ["guest", "That would be great. Does the room have a city view?", "那太好了。房间有城市景观吗？"],
    ["host", "It does, and it faces the river as well.", "有，而且也朝向河流。"],
    ["guest", "Wonderful. What time is breakfast served?", "太好了。早餐几点供应？"],
    ["host", "Breakfast is available from seven until ten thirty on the second floor.", "早餐在二楼供应，时间是七点到十点半。"],
    ["guest", "Do I need to make a reservation for breakfast?", "早餐需要预约吗？"],
    ["host", "No reservation is needed. Please bring your room key.", "不需要预约。请携带房卡。"],
    ["guest", "Could you also tell me where the gym is?", "您还能告诉我健身房在哪里吗？"],
    ["host", "The gym is on level three and remains open all day.", "健身房在三楼，全天开放。"],
    ["guest", "I may need a late checkout on Friday.", "我周五可能需要延迟退房。"],
    ["host", "We can offer checkout at two o'clock for a small fee.", "支付少量费用后，可以延迟到两点退房。"],
    ["guest", "That works for me. Please add it to the booking.", "可以。请把它加到预订中。"],
    ["host", "Done. May I see your passport and a payment card?", "已添加。可以看一下您的护照和付款卡吗？"],
    ["guest", "Here you are. Is the deposit refundable?", "给您。押金可以退还吗？"],
    ["host", "Yes. It will be released after we inspect the room at checkout.", "可以。退房检查房间后会解除冻结。"],
    ["guest", "How do I connect to the hotel Wi-Fi?", "酒店无线网络如何连接？"],
    ["host", "Choose Meridian Guest and enter your room number and surname.", "选择 Meridian Guest，然后输入房号和姓氏。"],
    ["guest", "Thank you. Could someone help me with my luggage?", "谢谢。可以请人帮我拿行李吗？"],
    ["host", "Certainly. A porter will meet you beside the elevators.", "当然。行李员会在电梯旁等您。"],
    ["guest", "Perfect. Thank you for explaining everything so clearly.", "太好了。谢谢您解释得这么清楚。"]
  ],
  "small-talk": [
    ["host", "That coffee smells great. Is this your first time here?", "那杯咖啡闻起来很香。你第一次来这里吗？"],
    ["guest", "Yes, it is. A friend recommended this place to me.", "是的。朋友向我推荐了这里。"],
    ["host", "Your friend has good taste. Their coffee is excellent.", "你的朋友很有品味。这里的咖啡很棒。"],
    ["guest", "Do you come here often?", "你经常来这里吗？"],
    ["host", "Usually twice a week. I sometimes work here in the afternoon.", "通常一周两次。我有时下午在这里工作。"],
    ["guest", "It does seem quiet enough to concentrate.", "这里看起来确实很安静，适合专注。"],
    ["host", "It is, except during the weekend brunch rush.", "是的，周末早午餐高峰除外。"],
    ["guest", "I am still learning my way around this neighborhood.", "我还在熟悉这个街区。"],
    ["host", "Did you move here recently?", "你最近才搬来这里吗？"],
    ["guest", "About three months ago. I moved here for a new job.", "大约三个月前。我因为新工作搬到这里。"],
    ["host", "How are you finding the city so far?", "到目前为止，你觉得这座城市怎么样？"],
    ["guest", "I like the energy, but I am still getting used to the weather.", "我喜欢这里的活力，但还在适应天气。"],
    ["host", "The weather changes quickly, so carrying a jacket always helps.", "天气变化很快，所以随身带件外套总有帮助。"],
    ["guest", "I learned that lesson yesterday when it started raining suddenly.", "昨天突然下雨时，我学到了这一点。"],
    ["host", "Have you discovered any favorite places yet?", "你已经发现什么喜欢的地方了吗？"],
    ["guest", "There is a small bookstore near the station that I really enjoy.", "车站附近有一家小书店，我很喜欢。"],
    ["host", "I know that one. They host readings on Thursday evenings.", "我知道那家。他们周四晚上会举办朗读活动。"],
    ["guest", "That sounds interesting. I might go this week.", "听起来很有意思。我这周可能会去。"],
    ["host", "You should. It is also a good way to meet people locally.", "你应该去。这也是认识当地人的好方法。"],
    ["guest", "That would be helpful because I do not know many people yet.", "那会很有帮助，因为我认识的人还不多。"],
    ["host", "We could go together if you would like some company.", "如果你想有人陪，我们可以一起去。"],
    ["guest", "I would like that. Shall we meet here before the event?", "我很乐意。活动前在这里见面好吗？"],
    ["host", "Perfect. Let us meet here at six thirty on Thursday.", "好。周四六点半在这里见。"],
    ["guest", "Great. It was really nice meeting you.", "太好了。很高兴认识你。"]
  ],
  clinic: [
    ["host", "Hello, I am Dr. Morgan. What brings you in today?", "你好，我是 Morgan 医生。今天哪里不舒服？"],
    ["guest", "I have had a headache since yesterday afternoon.", "从昨天下午开始我一直头痛。"],
    ["host", "Where exactly do you feel the pain?", "具体是哪里疼？"],
    ["guest", "Mostly behind my eyes and across my forehead.", "主要在眼睛后面和额头一带。"],
    ["host", "How strong is it on a scale from one to ten?", "按一到十分计算，疼痛有多强？"],
    ["guest", "It is usually a five, but it reached seven last night.", "通常是五分，但昨晚达到了七分。"],
    ["host", "Have you noticed anything that makes it better or worse?", "你注意到什么会让它减轻或加重吗？"],
    ["guest", "Bright light makes it worse, and resting in a dark room helps.", "强光会让它更严重，在暗房间休息会有所缓解。"],
    ["host", "Have you had any fever, nausea, or changes in vision?", "你有发烧、恶心或视力变化吗？"],
    ["guest", "I felt slightly nauseous this morning, but my vision is normal.", "今天早上有点恶心，但视力正常。"],
    ["host", "How much water have you been drinking recently?", "你最近喝了多少水？"],
    ["guest", "Probably not enough. Work has been unusually busy.", "可能不够。最近工作特别忙。"],
    ["host", "And how many hours did you sleep last night?", "昨晚睡了多少小时？"],
    ["guest", "Only about five hours, and I woke up several times.", "只有大约五个小时，而且醒了好几次。"],
    ["host", "Have you taken any medicine for the headache?", "你为头痛服用过什么药吗？"],
    ["guest", "I took one painkiller this morning, which helped for two hours.", "今早服了一片止痛药，缓解了两个小时。"],
    ["host", "Your symptoms may be related to stress, dehydration, and poor sleep.", "你的症状可能与压力、脱水和睡眠不足有关。"],
    ["guest", "Is there anything specific I should do today?", "今天有什么具体需要做的吗？"],
    ["host", "Drink plenty of water, rest, and avoid bright screens if possible.", "多喝水、休息，并尽量避免明亮屏幕。"],
    ["guest", "When should I seek further medical help?", "什么情况下需要进一步就医？"],
    ["host", "Seek urgent help if the pain becomes sudden or extremely severe.", "如果疼痛突然发生或极其严重，请立即就医。"],
    ["guest", "I understand. I will monitor the symptoms carefully.", "明白了。我会仔细观察症状。"],
    ["host", "Please contact us tomorrow if you are not improving.", "如果明天没有好转，请联系我们。"],
    ["guest", "Thank you, doctor. I appreciate the clear advice.", "谢谢医生。我很感谢这些清楚的建议。"]
  ],
  airport: [
    ["host", "Good evening. May I see your boarding pass, please?", "晚上好。可以看一下您的登机牌吗？"],
    ["guest", "Of course. I am in seat fourteen B.", "当然。我是十四 B 座。"],
    ["host", "Thank you. Your seat is on the left, just past the exit row.", "谢谢。您的座位在左侧，经过紧急出口排之后。"],
    ["guest", "Could you help me find space for this suitcase?", "可以帮我找个地方放这个行李箱吗？"],
    ["host", "The compartment above row sixteen still has some room.", "十六排上方的行李舱还有空间。"],
    ["guest", "Thank you. Can I keep my small bag under the seat?", "谢谢。我的小包可以放在座位下面吗？"],
    ["host", "Yes, as long as it is completely under the seat for takeoff.", "可以，只要起飞时完全放在座位下方。"],
    ["guest", "Would it be possible to change to an aisle seat?", "可以换到靠过道的座位吗？"],
    ["host", "Let me check. There may be one available near the back.", "让我查一下。后排可能有一个空位。"],
    ["guest", "That would be helpful because I need to stretch my leg.", "那会很有帮助，因为我需要活动一下腿。"],
    ["host", "I found seat twenty-two C. Would that work for you?", "我找到了二十二 C 座。可以吗？"],
    ["guest", "Yes, thank you very much.", "可以，非常感谢。"],
    ["host", "We will be taking off shortly, so please fasten your seat belt.", "我们很快起飞，请系好安全带。"],
    ["guest", "How long is the flight expected to be?", "预计飞行多长时间？"],
    ["host", "The flight should take approximately seven hours and forty minutes.", "飞行时间大约是七小时四十分钟。"],
    ["guest", "Will dinner be served soon after takeoff?", "起飞后不久会供应晚餐吗？"],
    ["host", "Yes. We will begin service about forty minutes after departure.", "会。起飞约四十分钟后开始供餐。"],
    ["guest", "Do you have a vegetarian meal available?", "有素食餐吗？"],
    ["host", "I will check your booking and confirm that for you.", "我会查看您的预订并为您确认。"],
    ["guest", "Could I also have a glass of water before takeoff?", "起飞前还可以给我一杯水吗？"],
    ["host", "Certainly. I will bring it as soon as everyone is seated.", "当然。所有人就座后我会马上送来。"],
    ["guest", "Thank you. Is there anything else I need to do?", "谢谢。我还需要做什么吗？"],
    ["host", "Please switch your phone to airplane mode and keep the aisle clear.", "请将手机调至飞行模式，并保持过道畅通。"],
    ["guest", "Understood. Thank you for your help.", "明白了。谢谢您的帮助。"]
  ]
};

export function getListeningDialogue(scenarioId: ScenarioId) {
  return scripts[scenarioId].map(([speaker, english, chinese]) => ({
    speaker,
    english,
    chinese
  }));
}

export function getListeningProgress(
  roundIndex: number,
  lineIndex: number,
  lineCount: number
) {
  const completed = roundIndex * lineCount + lineIndex;
  return Math.round((completed / Math.max(1, listeningRounds.length * lineCount)) * 100);
}
