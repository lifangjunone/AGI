import { useEffect, useState } from "react";

export const LOCALE_KEY = "duix-ui-locale";

const zh = {
  "Docs": "文档",
  "Capabilities": "核心能力",
  "Developer": "开发者",
  "About": "关于",
  "My avatars": "我的头像",
  "Create locally": "本地创建",
  "Use cases": "应用场景",
  "Close menu": "关闭菜单",
  "Open menu": "打开菜单",
  "Duix home": "Duix 首页",
  "Primary navigation": "主导航",
  "#1 Conversational AI": "领先的对话式 AI",
  "with real face and voice": "拥有真实面孔与声音",
  "Customize appearance and voice, support multiple languages, seamlessly integrate with knowledge bases, and significantly boost your business revenue.": "自定义形象与声音，支持多语言，无缝接入知识库，显著提升业务效率与价值。",
  "Start locally": "立即本地体验",
  "Plan a project": "规划项目",
  "No payment required": "无需付费",
  "Pause hero video": "暂停首屏视频",
  "Play hero video": "播放首屏视频",
  "Pause": "暂停",
  "Play": "播放",
  "Start local preview": "开启本地预览",
  "Conversational AI for every role in your business": "让对话式 AI 胜任每一种业务角色",
  "One platform, countless roles — conversational AI agents can work, teach, guide, and care.": "一个平台，无数角色——对话式 AI 智能体可以工作、教学、引导与陪伴。",
  "AI use cases": "AI 应用场景",
  "AI doctor": "AI 医生",
  "AI customer service": "AI 客服",
  "AI interview": "AI 面试官",
  "AI girlfriend": "AI 女友",
  "AI boyfriend": "AI 男友",
  "School AI": "校园 AI",
  "AI companion": "AI 陪伴",
  "Accessible, compassionate, and always on call — your AI doctor offers 24/7 health advice and virtual consultations.": "随时在线、耐心贴心，AI 医生全天候提供健康建议与虚拟咨询。",
  "Transform how your business supports customers with faster, more personal conversations at any hour.": "通过全天候、更快速、更个性化的对话，重塑客户服务体验。",
  "Real-time interviews. Instant analysis. Smarter hiring, anywhere.": "实时面试、即时分析，让招聘随时随地更智能。",
  "She listens, cares, and remembers — an AI companion built for natural, thoughtful conversation.": "她会倾听、关心并记住你，带来自然且有温度的陪伴。",
  "Share thoughts, laughter, and comfort with an AI companion designed for emotional presence.": "与懂得情绪陪伴的 AI 分享想法、欢笑与慰藉。",
  "Support educators and captivate students with an AI assistant that brings interactive lessons to life.": "用生动互动的 AI 助手支持教师、吸引学生。",
  "Available 24/7": "全天候在线",
  "Scale your business with visual AI agent": "用可视化 AI 智能体拓展业务",
  "Real expressions": "真实表情",
  "Real voice": "真实声音",
  "Real connection": "真实连接",
  "200ms TTFB latency, expressive voice, and true-to-life avatars deliver real-time two-way interactions that can improve engagement and service quality.": "200ms 首字节延迟、富有表现力的声音与逼真头像，共同带来实时双向互动，提升参与度与服务质量。",
  "Create your AI avatar": "创建你的 AI 头像",
  "Built for real teams": "为真实团队而生",
  "Human presence, without the operational limits": "保留真人临场感，突破运营限制",
  "Full accessibility support": "全时段无障碍服务",
  "Offer a consistent, face-to-face experience across time zones and devices.": "跨时区、跨设备提供一致的面对面体验。",
  "White-label customization": "品牌级定制",
  "Match appearance, voice, knowledge, and personality to your brand.": "让形象、声音、知识与个性完全契合品牌。",
  "Languages supported": "支持多种语言",
  "Serve multilingual audiences with natural voice and localized content.": "用自然声音和本地化内容服务全球用户。",
  "Seamlessly integrate with our API": "通过 API 无缝集成",
  "Connect your product to real-time interactive digital humans with a focused API and platform SDKs.": "使用简洁的 API 和平台 SDK，为产品接入实时互动数字人。",
  "Read the local guide": "阅读本地指南",
  "Quick start": "快速开始",
  "Copied": "已复制",
  "Select code to copy": "请选择代码复制",
  "Copy code": "复制代码",
  "Advanced capabilities": "高级能力",
  "More than a chatbot": "不只是聊天机器人",
  "Duix avatars can understand context, reflect emotion, and bring knowledge to a natural face-to-face experience.": "Duix 头像能够理解上下文、表达情绪，并将知识融入自然的面对面体验。",
  "Vision": "视觉",
  "Understand images and the world around your users.": "理解图像与用户周围的世界。",
  "Memory": "记忆",
  "Carry context forward for personal, continuous conversations.": "延续上下文，创造个性化连续对话。",
  "Knowledge": "知识",
  "Connect private documents and business data securely.": "安全连接私有文档与业务数据。",
  "Emotion": "情感",
  "Respond with expressive voice, timing, and natural presence.": "以富有表现力的声音、节奏和自然临场感回应。",
  "Make every conversation feel present.": "让每一次对话都如同面对面。",
  "Build an AI avatar with a face, a voice, and knowledge that is uniquely yours.": "打造拥有专属面孔、声音与知识的 AI 头像。",
  "Interactive AI avatar": "互动 AI 头像",
  "Local project": "本地项目",
  "Developer guide": "开发者指南",
  "Privacy & licenses": "隐私与许可",
  "Saved avatars": "已保存头像",
  "Workspace": "工作空间",
  "Project inquiry": "项目咨询",
  "No external submission": "不会对外提交",
  "Back to top": "返回顶部",
  "100% local workspace": "100% 本地工作空间",
  "Create an AI avatar": "创建 AI 头像",
  "Video studio": "视频工作室",
  "My works": "我的作品",
  "Local developer guide": "本地开发指南",
  "Local project information": "本地项目信息",
  "Local workspace": "本地工作空间",
  "Close local workspace": "关闭本地工作空间",
  "Local product navigation": "本地产品导航",
  "Create avatar": "创建头像",
  "Avatar creation progress": "头像创建进度",
  "Appearance": "形象",
  "Voice": "声音",
  "Persona": "角色",
  "Review": "确认",
  "Complete this step to continue.": "请完成当前步骤后继续。",
  "Choose an example or upload your media.": "请选择示例或上传媒体。",
  "Enter an avatar name.": "请输入头像名称。",
  "Add a greeting.": "请输入欢迎语。",
  "Confirm that you have permission to use this likeness.": "请确认你有权使用该人物形象。",
  "Training videos must be at least 8 seconds long.": "训练视频必须至少 8 秒。",
  "Choose an image, MP4, MOV, or WebM file.": "请选择图片、MP4、MOV 或 WebM 文件。",
  "The selected video could not be read.": "无法读取所选视频。",
  "A poster frame could not be extracted.": "无法从视频中提取封面。",
  "Step 1 of 4": "第 1 步，共 4 步",
  "Choose an appearance": "选择形象",
  "Use an included example, or upload a photo or training video. Files never leave this browser.": "使用内置示例，或上传照片、训练视频。文件不会离开当前浏览器。",
  "Professional": "专业人士",
  "Clinician": "医疗专家",
  "Interviewer": "面试官",
  "Educator": "教育工作者",
  "Selected": "已选择",
  "Choose": "选择",
  "Upload your own": "上传你的素材",
  "Image or video · video must be at least 8 seconds": "图片或视频 · 视频必须至少 8 秒",
  "Ready:": "已就绪：",
  "Step 2 of 4": "第 2 步，共 4 步",
  "Set the voice": "设置声音",
  "Choose how previews are spoken. The browser uses an installed system voice.": "选择预览的发音方式。浏览器将使用系统已安装的声音。",
  "Speaking language": "说话语言",
  "Voice preset": "声音预设",
  "English (US)": "英语（美国）",
  "Female": "女声",
  "Male": "男声",
  "Neutral": "中性",
  "Preview voice": "试听声音",
  "Playing a system voice preview.": "正在播放系统语音预览。",
  "Step 3 of 4": "第 3 步，共 4 步",
  "Define the persona": "定义角色",
  "This metadata is saved locally and used in the video studio.": "这些信息会保存在本地，并用于视频工作室。",
  "Avatar name": "头像名称",
  "Role": "角色",
  "Greeting": "欢迎语",
  "Personality and knowledge": "性格与知识",
  "Step 4 of 4": "第 4 步，共 4 步",
  "Review and create": "确认并创建",
  "Your source and metadata remain on this device.": "你的源文件和信息仅保留在当前设备。",
  "Name": "名称",
  "Source": "来源",
  "Included example": "内置示例",
  "Capability boundary:": "能力边界：",
  "this local app stores your avatar and renders real WebM video. Neural likeness training and lip-sync require the included official Duix-Avatar NVIDIA/Docker runtime.": "此本地应用会保存头像并真实渲染 WebM 视频。神经形象训练和口型同步需要使用项目内官方 Duix-Avatar 的 NVIDIA/Docker 运行环境。",
  "I own or have permission to use this person's likeness and media.": "我拥有或已获准使用该人物的形象与媒体素材。",
  "Processing locally…": "正在本地处理…",
  "Back": "返回",
  "Continue": "继续",
  "Creating…": "创建中…",
  "Create local avatar": "创建本地头像",
  "Avatar created and stored in this browser.": "头像已创建并保存在当前浏览器。",
  "Avatar deleted.": "头像已删除。",
  "No avatars yet": "暂无头像",
  "Create an avatar first, then use it to make a local video.": "请先创建头像，然后用它制作本地视频。",
  "Ready": "可用",
  "Create video": "制作视频",
  "Delete": "删除",
  "Select an avatar.": "请选择头像。",
  "Enter a video name.": "请输入视频名称。",
  "Enter the words to show in the video.": "请输入要在视频中展示的文案。",
  "Choose an audio file.": "请选择音频文件。",
  "Uploaded audio": "已上传音频",
  "Local WebM rendered successfully.": "本地 WebM 渲染成功。",
  "Create an avatar first": "请先创建头像",
  "The studio needs a local avatar before it can render a video.": "视频工作室需要本地头像才能渲染视频。",
  "1. Choose avatar": "1. 选择头像",
  "Untitled video": "未命名视频",
  "Your script will appear here.": "你的文案会显示在这里。",
  "2. Add content": "2. 添加内容",
  "Video name": "视频名称",
  "Text to video": "文本生成视频",
  "Audio to video": "音频生成视频",
  "Script": "文案",
  "Preview speech": "试听语音",
  "Playing speech preview.": "正在播放语音预览。",
  "Upload audio": "上传音频",
  "MP3, WAV, M4A, or WebM · local demo renders up to 60 seconds": "支持 MP3、WAV、M4A 或 WebM · 本地演示最多渲染 60 秒",
  "Rendering locally…": "正在本地渲染…",
  "Rendering…": "渲染中…",
  "Render local video": "渲染本地视频",
  "The rendered file is missing.": "渲染文件不存在。",
  "Render failed": "渲染失败",
  "Loading local video…": "正在加载本地视频…",
  "Deleted avatar": "已删除的头像",
  "Download WebM": "下载 WebM",
  "Work deleted.": "作品已删除。",
  "No works yet": "暂无作品",
  "Render a text or audio video in the local studio. It will appear here as a real WebM file.": "在本地工作室渲染文本或音频视频，真实的 WebM 文件会显示在这里。",
  "success": "成功",
  "failed": "失败",
  "rendering": "渲染中",
  "This replica makes the browser-safe core flow real: media stays in IndexedDB, metadata stays in localStorage, and videos are rendered by Canvas + MediaRecorder.": "此复刻已实现浏览器端完整主线：媒体保存在 IndexedDB，元数据保存在 localStorage，视频通过 Canvas 和 MediaRecorder 真实渲染。",
  "Full neural runtime": "完整神经网络运行环境",
  "The included upstream/Duix-Avatar source provides the official NVIDIA/Docker path for neural avatar inference and lip-sync. The browser studio does not falsely claim to run that GPU model.": "项目内的 upstream/Duix-Avatar 源码提供官方 NVIDIA/Docker 神经头像推理和口型同步方案。浏览器工作室不会虚假宣称已运行该 GPU 模型。",
  "Local-only project mode": "纯本地项目模式",
  "This build deliberately contains no external lead form or redirect. Use the Create avatar and Video studio tabs to evaluate the complete local path.": "此版本不包含任何外部表单或跳转。请通过“创建头像”和“视频工作室”体验完整本地主线。",
  "This local product replica does not collect accounts, payment, or cloud-generation data. Uploaded media and rendered works remain in this browser profile.": "此本地产品复刻不会收集账号、支付或云端生成数据。上传媒体与渲染作品仅保留在当前浏览器配置中。",
  "Official Duix source and public assets remain subject to their original licenses and rights notices.": "Duix 官方源码和公开素材仍受其原始许可证与权利声明约束。",
};

const replacements = Object.entries(zh).sort((a, b) => b[0].length - a[0].length);
const nodeState = new WeakMap();
const attributeState = new WeakMap();

export function translateText(text, locale) {
  if (locale !== "zh-CN") return text;
  return replacements.reduce((value, [english, chinese]) => value.replaceAll(english, chinese), text);
}

function localizeNode(node, locale) {
  if (node.nodeType === Node.TEXT_NODE) {
    const state = nodeState.get(node);
    const current = node.data;
    const original = state && current === state.rendered ? state.original : current;
    const rendered = translateText(original, locale);
    nodeState.set(node, { original, rendered });
    if (current !== rendered) node.data = rendered;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node;
  const saved = attributeState.get(element) || {};
  ["aria-label", "placeholder", "title"].forEach((name) => {
    if (!element.hasAttribute(name)) return;
    const current = element.getAttribute(name);
    const previous = saved[name];
    const original = previous && current === previous.rendered ? previous.original : current;
    const rendered = translateText(original, locale);
    saved[name] = { original, rendered };
    if (current !== rendered) element.setAttribute(name, rendered);
  });
  attributeState.set(element, saved);
  element.childNodes.forEach((child) => localizeNode(child, locale));
}

export function useLocale() {
  const [locale, setLocaleState] = useState(() => localStorage.getItem(LOCALE_KEY) || "zh-CN");
  const setLocale = (next) => {
    localStorage.setItem(LOCALE_KEY, next);
    setLocaleState(next);
  };
  return [locale, setLocale];
}

export function useDomI18n(root, locale) {
  useEffect(() => {
    if (!root.current) return undefined;
    document.documentElement.lang = locale;
    localizeNode(root.current, locale);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") localizeNode(mutation.target, locale);
        mutation.addedNodes.forEach((node) => localizeNode(node, locale));
      });
    });
    observer.observe(root.current, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [root, locale]);
}
