export const templates = [
  {
    id: "workday-box",
    kind: "set",
    title: "今天，你是哪一包？",
    shortTitle: "状态盲盒",
    badge: "6 款常规 · 1 款隐藏",
    accent: "#d9ecf8",
    gradient: "linear-gradient(135deg, #eef8ff 0%, #f7fbff 48%, #e7f1ff 100%)",
    aspect: "16:10",
    preview: "把打工人的日常，装进一只小盲盒。",
    prompt: [
      "Create a high-quality 3D cute collectible figurine set inspired by a user's uploaded portrait.",
      "Keep the same face identity, hairstyle, approximate age, skin tone, and personal vibe from the reference photo, but render as a polished soft vinyl chibi figurine.",
      "Scene: a clean pale blue product poster with seven small pedestal dioramas, each depicting a different workday mood: slacking with phone, overtime at desk, lunch box, leaving work at 18:00, empty wallet moonlight, lying flat on sofa, payday hidden rare with money bag.",
      "Outfit should be a simple black top, white wide-leg pants, and white sneakers unless the reference strongly suggests another signature style.",
      "Add Chinese labels on pedestals: 摸鱼包, 加班包, 干饭包, 下班包, 月光包, 躺平包, 发薪包.",
      "Cute, premium toy photography, soft studio lighting, rounded forms, shallow shadows, no watermark."
    ].join(" ")
  },
  {
    id: "aqua-run-card",
    kind: "card",
    title: "No.002 · 风速上班卡",
    shortTitle: "跑步收藏卡",
    badge: "流光镭射边框",
    accent: "#36d2ff",
    gradient: "radial-gradient(circle at 20% 0%, #d5fff5 0%, #48d7e9 28%, #0e5a79 100%)",
    aspect: "3:4",
    preview: "把你变成正在穿过流光通道的五星收藏卡。",
    prompt: [
      "Transform the uploaded portrait into a premium 3D cartoon character collectible card.",
      "Preserve the person's identity, hairstyle, face shape, and expression cues from the reference photo.",
      "Full-body running pose, black turtleneck or black top, white wide-leg pants, white sneakers, simple lanyard badge.",
      "Background: aqua teal sci-fi light tunnel, sparkling speed lines, iridescent holographic frame, glossy trading card texture.",
      "Bottom of card: five gold stars and large text 'No.002'.",
      "Pixar-like soft 3D, luxury collectible toy, sharp details, cinematic highlights, no watermark."
    ].join(" ")
  },
  {
    id: "galaxy-wave-card",
    kind: "card",
    title: "No.005 · 银河回头卡",
    shortTitle: "银河收藏卡",
    badge: "紫色星云背景",
    accent: "#8b6dff",
    gradient: "radial-gradient(circle at 50% 10%, #cfc3ff 0%, #55408f 42%, #201946 100%)",
    aspect: "3:4",
    preview: "一张回头挥手的宇宙感五星角色卡。",
    prompt: [
      "Transform the uploaded portrait into a premium 3D cartoon character collectible card.",
      "Keep the same identity, face, hairstyle, and temperament from the reference photo.",
      "Full-body character turned slightly back and waving, gentle confident smile, black top, white wide-leg pants, white sneakers, lanyard badge.",
      "Background: deep purple galaxy nebula with stars, glossy purple holographic frame, premium trading card finish.",
      "Bottom of card: five gold stars and large text 'No.005'.",
      "Soft 3D toy character, elegant lighting, detailed fabric, no watermark."
    ].join(" ")
  },
  {
    id: "idea-card",
    kind: "card",
    title: "No.009 · 灵感加载卡",
    shortTitle: "灵感收藏卡",
    badge: "问号与灯泡",
    accent: "#f2be4b",
    gradient: "radial-gradient(circle at 50% 20%, #d9f1ff 0%, #1c3d78 52%, #101932 100%)",
    aspect: "3:4",
    preview: "把你变成正在思考下一步的灵感角色卡。",
    prompt: [
      "Transform the uploaded portrait into a polished 3D cartoon collectible card.",
      "Preserve recognizable facial identity, hairstyle, expression style, and personal energy from the input portrait.",
      "Full-body standing pose, one hand on chin, thoughtful expression, black top, white wide-leg pants, white sneakers, lanyard badge.",
      "Floating question marks and a glowing light bulb around the character, dark blue dreamy background with subtle constellation lines and iridescent ribbon trails.",
      "Card has glossy navy holographic border, bottom panel with five gold stars and text 'No.009'.",
      "High-end toy render, cinematic soft lighting, no watermark."
    ].join(" ")
  },
  {
    id: "mbti-grid",
    kind: "poster",
    title: "MBTI 16 型人格注解卡片",
    shortTitle: "MBTI 注解卡",
    badge: "四大阵营 × 十六型",
    accent: "#6d7fb8",
    gradient: "linear-gradient(180deg, #f8f6ef 0%, #f5f4ef 100%)",
    aspect: "9:16",
    preview: "用你的统一形象生成一整张 16 型人格小卡海报。",
    prompt: [
      "Create a vertical Chinese MBTI 16 personality annotation poster using the uploaded portrait as the identity reference.",
      "Render the person as a consistent cute 3D character across 16 small cards, preserving identity and hairstyle while changing poses, props, and environments.",
      "Four horizontal sections: NT 分析师阵营, NF 外交官阵营, SJ 守护者阵营, SP 探索者阵营.",
      "Each section contains four rounded cards with a 3D character image, MBTI type title, Chinese role name, and short Chinese description.",
      "Clean editorial layout, cream background, navy/purple/olive/green section bars, readable Chinese typography, premium poster design.",
      "No watermark, avoid gibberish text as much as possible."
    ].join(" ")
  },
  {
    id: "starry-oil",
    kind: "portrait",
    title: "星夜油画头像",
    shortTitle: "星夜油画",
    badge: "厚涂笔触",
    accent: "#f6c647",
    gradient: "radial-gradient(circle at 70% 15%, #ffd94e 0%, #123c75 35%, #081d3d 100%)",
    aspect: "4:3",
    preview: "把照片变成梵高星夜氛围的厚涂肖像。",
    prompt: [
      "Transform the uploaded portrait into a joyful stylized oil painting portrait under a swirling starry night sky.",
      "Preserve the person's facial identity, hairstyle, and warmth from the reference photo, but render in expressive thick impasto brush strokes.",
      "Background: Van Gogh inspired swirling night sky, golden stars, blue vortex strokes, wheat field in the foreground, dramatic painterly texture.",
      "Character wears a simple black turtleneck, eyes sparkling with golden reflections, smiling with wonder.",
      "Rich oil paint texture, visible brush strokes, hand-painted feel, no watermark."
    ].join(" ")
  }
];

export function getTemplate(id) {
  return templates.find((template) => template.id === id) || templates[0];
}
