# Requirements: EasySay

**Defined:** 2026-08-13
**Core Value:** 用户每天能立即完成真正需要开口、获得反馈并重说的个性化任务。

## v1 Requirements

### Onboarding

- [ ] **ONBD-01**: 用户能选择当前水平、学习目标、每日时间和偏好口音
- [ ] **ONBD-02**: 用户能完成自我介绍与经历描述两项基线录音
- [ ] **ONBD-03**: 用户能查看基线能力结果和当前训练重点

### Planning

- [ ] **PLAN-01**: 用户能获得包含阶段目标与每周主题的 24 周学习计划
- [ ] **PLAN-02**: 计划能根据用户水平、目标和每日时间调整任务量
- [ ] **PLAN-03**: 模型不可用时应用能生成规则驱动的可执行计划

### Daily Training

- [ ] **TRAI-01**: 用户能查看当天按顺序排列的训练任务
- [ ] **TRAI-02**: 用户能学习场景表达块并听取系统朗读
- [ ] **TRAI-03**: 用户能录制跟读、脱稿表达和重练音频
- [ ] **TRAI-04**: 用户能获得可理解度、流利度、表达和改进建议反馈
- [ ] **TRAI-05**: 用户能在反馈后重新录制同一任务
- [ ] **TRAI-06**: 应用按 1、3、7、14 天安排表达块复习

### AI Practice

- [ ] **COACH-01**: 用户能完成至少 10 轮结构化 AI 场景角色扮演
- [ ] **COACH-02**: AI 每次只给出短回应，不替用户完成回答
- [ ] **COACH-03**: 对话结束后用户能获得三个优先级明确的改进建议
- [ ] **COACH-04**: Ark 不可用时用户仍能使用内置场景脚本完成训练

### Progress

- [ ] **PROG-01**: 用户能查看今日完成率、连续学习天数和本周开口分钟数
- [ ] **PROG-02**: 用户能完成每周复盘并查看能力维度变化
- [ ] **PROG-03**: 用户学习档案、进度与录音在刷新后仍然保留

### Platform

- [ ] **PLAT-01**: 用户能将应用安装到手机桌面
- [ ] **PLAT-02**: 弱网或离线时用户仍能打开应用和查看已有任务
- [ ] **PLAT-03**: Ark API key 不出现在浏览器资源和前端存储中
- [ ] **PLAT-04**: 服务端提供可替换的 ASR 与 TTS 接口并返回未配置状态

### Local Speech

- [x] **SPCH-01**: 用户录音能通过本机 Qwen3-ASR 自动转写英语
- [x] **SPCH-02**: 训练材料和教练回复能通过本机 Qwen3-TTS 生成自然英语语音
- [x] **SPCH-03**: 用户能在配置页查看、修改、应用并测试 ASR/TTS 模型配置
- [x] **SPCH-04**: 仓库包含模型下载、环境安装、启动和诊断脚本，但不提交模型权重
- [x] **SPCH-05**: 本地语音服务不可用时自动降级到浏览器识别和系统朗读

## v2 Requirements

### Cloud

- **CLOUD-01**: 用户能注册账号并跨设备同步进度
- **CLOUD-02**: 用户录音能加密保存到云端

### Pronunciation

- **PRON-01**: 用户能获得音素和韵律级可视化反馈

## Out of Scope

| Feature | Reason |
|---------|--------|
| 真人语伴市场 | 需要社区运营、审核与安全机制 |
| 付费订阅 | 先验证训练闭环 |
| 应用商店发布 | PWA 可满足首版安装和验证 |
| 消除中国口音 | 产品目标是可理解、流利和有效互动 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ONBD-01..03 | Phase 1 | Pending |
| PLAN-01..03 | Phase 1 | Pending |
| TRAI-01..06 | Phase 2 | Pending |
| COACH-01..04 | Phase 2 | Pending |
| PROG-01..03 | Phase 3 | Pending |
| PLAT-01..04 | Phase 3 | Pending |
| SPCH-01..05 | Phase 4 | Complete |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0

---
*Requirements defined: 2026-08-13*
*Last updated: 2026-08-14 for local speech models*
