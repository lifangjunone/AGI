# 牛马嘴替

面向中文打工人的“电子牛马解压所”MVP：输入今天的职场破事，生成怨气诊断、阴阳怪气嘴替、文明反击嘴替、点击粉碎小游戏和可分享牛马报告。

## 产品边界

- 定位：娱乐解压、黑色幽默、职场情绪表达。
- 非定位：心理治疗、法律建议、真实攻击或骚扰工具。
- 隐私：用户输入会提交到本产品后端生成模型嘴替；服务端不持久化输入。页面提醒用户不要输入真实姓名、公司机密和联系方式，后端会对常见手机号、邮箱和身份证号做打码。
- 模型：生产环境优先调用 LifeYouMe MaaS `lym-chat-quality`，模型不可用或超时时自动降级到本地规则。

## 本地开发

```bash
npm test
npm run dev
```

打开：

```text
http://127.0.0.1:45410/niuma/
```

健康检查：

```text
http://127.0.0.1:45410/health
```

## 部署目标

- 公网路径：`https://lifeyoume.icu/niuma/`
- 腾讯云监听：`127.0.0.1:45410`
- 运行方式：Docker + systemd
- 阿里云入口：共享 Nginx 只追加 `# BEGIN/END niuma-mouthpiece` 产品块，禁止覆盖整份配置。

## 目录

```text
src/
  index.html       H5 页面
  styles.css       移动优先视觉与响应式
  app.mjs          页面交互、报告复制和 PNG 生成
  diagnosis.mjs    本地怨气分类和嘴替规则
  maas-client.mjs  LifeYouMe MaaS OpenAI-compatible 调用
  model-diagnosis.mjs  模型提示词、JSON 解析、输出归一化和规则兜底
deploy/
  niuma-mouthpiece.service
  niuma-mouthpiece-aliyun-tunnel.service
  provision-maas-key.mjs
tests/
  diagnosis.test.mjs
  model-diagnosis.test.mjs
```

## MaaS 输出结构

`src/model-diagnosis.mjs` 要求 MaaS 返回严格 JSON，并归一化为：

```json
{
  "angerType": "临下班投喂型",
  "angerScore": 91,
  "title": "需求火葬场守夜人",
  "monster": "加急需求兽",
  "comfort": "你不是效率低，是对方把时间当可再生资源。",
  "roast": "明早要可以，建议今晚先把地球自转调慢一点。",
  "civilized": "我理解这个需求很急，但当前排期需要重新确认优先级和交付风险。",
  "shareText": "今天的我不是在加班，是在给时间管理学做尸检。"
}
```

生产环境服务 Key 存放在腾讯云 `/etc/niuma-mouthpiece/app.env`，root-only，不进入仓库。
