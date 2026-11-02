# MapProof 图证

MapProof 是 LifeYouMe 的图表发布验收子项目。它不负责替代 Figma 或生成更多图，
而是检查 Mermaid / AI 生成图是否保住了语义、关键路径与可读性，并输出可交付的
验收报告。

## 当前能力

- Mermaid flowchart / graph 浏览器内渲染；
- 布局方向、分支标签、孤立节点、循环、枢纽密度和认知负荷检查；
- 发布可信度、结论、关键路径与指标；
- Markdown 验收报告下载；
- 全程浏览器本地分析，不上传或保存图稿；
- 桌面、平板与手机响应式界面。

## 本地运行

```bash
npm install
npm test
npm start
```

打开 `http://127.0.0.1:45210/mapproof/`，健康检查为
`http://127.0.0.1:45210/health`。

## 生产拓扑

```text
公网 / https://lifeyoume.icu/mapproof/
  -> 阿里云共享 Nginx
  -> 127.0.0.1:45210（反向 SSH 隧道）
  -> 腾讯云 127.0.0.1:45210
  -> mapproof.service
```

部署时只能向共享 Nginx 更新 `# BEGIN/END mapproof` 范围，必须遵守工作区
`deployments/runbooks/SHARED_NGINX.md` 的备份、路由盘点、并发检测、原 inode
写入、`nginx -t`、只 reload 和无关产品回归规则。

商机证据和定价假设见 [docs/RESEARCH.md](docs/RESEARCH.md)。
