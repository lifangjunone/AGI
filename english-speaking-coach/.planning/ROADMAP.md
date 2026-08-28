# EasySay Roadmap

## Phase 1: Foundation and Personal Plan

**Goal:** 用户完成入门测评并获得当天即可执行的个性化 24 周计划。
**Mode:** mvp
**Requirements:** ONBD-01..03, PLAN-01..03

**Success Criteria:**
1. 新用户能在五分钟内完成资料设置和两项基线录音。
2. 应用展示明确的基线结果、训练重点和 24 周计划。
3. Ark 不可用时仍能生成符合用户目标的本地计划。

## Phase 2: Daily Speaking Loop

**Goal:** 用户完成输入、模仿、脱稿输出、反馈、重说和角色扮演闭环。
**Mode:** mvp
**Requirements:** TRAI-01..06, COACH-01..04

**Success Criteria:**
1. 用户能按顺序完成当天全部口语任务。
2. 每次录音都能保存，并在反馈后进入重练。
3. AI 或内置脚本能完成十轮场景对话并给出聚焦反馈。
4. 表达块会在正确的间隔日期重新出现。

## Phase 3: Progress and Installability

**Goal:** 用户能长期保存训练成果、复盘进步并将应用安装到手机。
**Mode:** mvp
**Requirements:** PROG-01..03, PLAT-01..04

**Success Criteria:**
1. 首页准确展示连续学习、完成率和开口时长。
2. 周复盘展示可理解度、流利度、表达和互动变化。
3. 刷新、关闭浏览器和离线打开不会丢失已有学习数据。
4. API key 仅存在服务端，ASR/TTS 有清晰的后续适配边界。

## Phase 4: Local Speech Models

**Goal:** Apple Silicon 本机提供默认可用的高质量英语 ASR/TTS，并能在应用内配置、诊断和降级。
**Mode:** standard
**Requirements:** SPCH-01..05

**Success Criteria:**
1. 录音结束后由本地 Qwen3-ASR 自动生成英语转写，并可继续手动修正。
2. 训练示范和教练消息默认由本地 Qwen3-TTS 朗读，美音和英音偏好映射到可用音色。
3. 模型配置页预填可运行默认值，能保存、应用并执行服务与 TTS 测试。
4. 仓库维护安装、下载、启动、诊断脚本和配置模板，模型权重及本地覆盖配置不进入 Git。
5. 本地语音服务异常时训练流程自动降级，不阻断录音、转写编辑和系统朗读。

---
*Created: 2026-08-13*
*Updated: 2026-08-14 for local speech models*
