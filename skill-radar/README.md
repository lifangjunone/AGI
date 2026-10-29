# Skill Radar · 技能雷达

每天聚合公开 AI Agent Skill 数据，按领域展示热门、增长快、官方发布和可直接安装的 Skill。

“主理人原创”是 LifeYouMe 主理人的独立策展入口。原创条目会稳定合并进每日数据，但不参与公开安装热度排名，避免把作者推荐与第三方采用证据混为一谈。

公网入口：`https://lifeyoume.icu/skills/`

## 数据与评分

- `skills.sh`：覆盖公开 Skill 生态的安装量、近 8 周安装趋势、官方标识与原始仓库链接。
- 页面不会把评分包装成绝对质量结论。综合分只用于排序，并公开展示安装量、周趋势、来源和更新时间。
- 分类由 Skill 名称、仓库、主题与简介的关键词规则生成；无法可靠判断时进入“通用与效率”。

## 本地运行

```bash
npm run collect
npm run serve
```

然后访问 `http://127.0.0.1:4178/skills/`。

## 每日更新

采集并部署：

```bash
npm run deploy
```

服务器静态服务与定时器安装：

```bash
sudo bash deploy/install-timer.sh /data/app/skill-radar/current
```

默认每天北京时间 08:15 执行。独立静态服务监听 `127.0.0.1:4398`，
定时任务只更新本产品数据文件，不修改 Nginx。

## 安全部署

`deploy/push-static.sh` 只上传本产品文件并原子切换发布目录，不触碰共享 Nginx。

首次接入共享 Nginx 使用：

```bash
ssh aliyun 'sudo bash /tmp/install-skill-radar-route.sh'
```

路由安装脚本会：

1. 锁定并备份服务器最新共享配置；
2. 记录全部既有 `location`；
3. 只在根域名 HTTPS `server` 中插入 `/skills` 路由；
4. 验证任何既有路由都没有消失；
5. 执行容器内 `nginx -t`；
6. 只执行 `nginx -s reload`，不重启或重建容器；
7. 探测新产品与既有代表产品，失败时自动恢复备份。
