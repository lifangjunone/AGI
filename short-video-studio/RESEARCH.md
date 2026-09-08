# AI 短视频生成产品调研

调研日期：2026-09-08

## 结论

当前主流产品已从单一“文生视频”输入框，演进为围绕镜头控制、参考素材、原生音频、主体一致性和多镜头叙事的创作工作台。单次原生生成仍普遍偏短，较长成片通常依赖续写、多镜头生成或后期合成。

FRAME/60 首版因此不复制复杂剪辑器，而聚焦三个可验证目标：

1. 一个界面完成提示词、时长和比例设置。
2. 服务端直接消费兼容 Chat Completions 的 Base64 MP4 响应。
3. 无论模型原始片长如何，交付文件严格落在 5、10、20、30 或 60 秒。

## 产品矩阵

| 产品 | 值得参考的能力 | 首版取舍 |
| --- | --- | --- |
| 即梦 AI / Seedance | 文生视频、图生视频、首尾帧、运镜控制、Agent 化创作入口 | 首版采用参数紧凑的单工作台；参考图与首尾帧留作下一阶段 |
| Google Veo / Flow | 提示词遵循、原生音频、物理真实感、跨镜头叙事 | 在服务端提示词中补充时长、比例、运动稳定和连续性要求 |
| Runway | 面向创作者的镜头控制、参考驱动和项目式工作流 | 首版保留创作台与作品库双视图，不引入复杂时间线编辑 |
| 可灵 AI | 多镜头、主体参考、动作与运镜控制 | 20 秒以上自动向模型声明多镜头叙事要求 |
| 海螺 AI | 人物动作、表情和快速短片生成 | 以提示词模板帮助用户表达主体、动作、环境和镜头 |
| Pika | 快速生成、社交媒体效果与低门槛交互 | 预设 9:16，并提供 16:9、1:1 快速切换 |

## 关键设计决策

### 精确时长

模型输出时长可能与指令不完全一致。服务端先用 `ffprobe` 读取原片长度，再用 FFmpeg 统一输出：

- 原片长于目标：裁剪至目标时长。
- 原片短于目标：循环画面与音频后截取至目标时长。
- 原片接近目标：重新封装并校验，消除容器时间轴偏差。

这种方式保证文件时长，但短片补长时会产生循环。后续可升级为分镜拆分、多次生成、视觉连续性评估和无缝拼接。

### 安全边界

- API Key 仅由 Node.js 服务读取。
- 浏览器状态接口只返回“是否已配置”，不返回地址或凭据。
- `.env` 与 `.env.local` 均被 Git 忽略。
- 视频和任务元数据默认保存在被忽略的 `data/` 目录。

## 参考资料

### 官方资料

- [即梦 AI 视频生成 3.0 产品介绍](https://docs.volcengine.com/docs/85621/1792707)
- [即梦 AI 创作平台](https://jimeng.jianying.com/ai-tool/home?activeTab=short_video)
- [Google DeepMind Veo](https://deepmind.google/models/veo/)
- [Google DeepMind Veo 3.1 Lite Model Card](https://deepmind.google/models/model-cards/veo-3-1-lite/)
- [Runway Research](https://runwayml.com/research/)

### 行业对比资料

- [2026 AI 视频工具横评](https://blog.csdn.net/m0_73190071/article/details/162006346)
- [AI Video Generation Tools Compared by Use Case](https://www.avocadoai.co/blog/best-ai-video-generation-tools-2026-refresh)

行业资料中的价格、版本和最长时长变化较快，只用于识别产品模式，不作为本项目的接口承诺。
