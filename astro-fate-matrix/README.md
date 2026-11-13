# 星命矩阵 Astro Fate Matrix

一个多维度算命 Web 网站：根据出生日期、出生时间、地点与个人信息生成星座、上升星座、生肖、八字概要、匹配星座/属相、姻缘、桃花年与桃花方向省份报告。

项目默认可本地离线运行；配置 LifeYouMe MaaS 服务 Key 后，会使用基座模型 `lym-chat-quality` 对结构化命理结果进行更自然的中文解读。

## 本地运行

```bash
cd /Users/bytedance/Desktop/agi/astro-fate-matrix
cp .env.example .env
npm run dev
```

打开 <http://127.0.0.1:43330>。

## 基座模型

服务端调用 OpenAI-compatible MaaS 网关：

- `MAAS_BASE_URL`：默认 `http://127.0.0.1:43280/v1`
- `MAAS_MODEL_ID`：默认 `lym-chat-quality`
- `MAAS_SERVICE_KEY`：MaaS 应用服务 Key，只放服务端环境变量

如果没有配置 `MAAS_SERVICE_KEY`，网站仍会返回规则计算报告，并在结果中提示当前为本地规则版。

## 说明

本产品用于娱乐、情绪陪伴和自我观察，不构成医学、法律、投资或婚恋决策建议。上升星座与八字使用轻量算法近似计算，正式商用前应接入权威历法/天文库进一步校准。
