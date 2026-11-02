# Oncall 问题处理案例：从群聊数据到可学习经验

> 验证目标：不增加专家整理负担，把一次真实 Oncall 处理过程自动沉淀为数字员工可学习、可验证、可追溯的经验。

## 案例流程

```text
真实群聊与关联资料
        ↓
自动脱敏、提取事实与经验
        ↓
读取复测、变更、回滚等工作结果
        ↓
为每条经验计算可信等级和使用边界
        ↓
生成数字员工可使用的经验可信度卡片
        ↓
考试与沙箱任务验证是否真正掌握
```

## 验证步骤

### [步骤 01：获取 Oncall 群聊与关联资料](https://bytedance.larkoffice.com/wiki/DztVwTRrRiFv2LkeTlYcC0Svnbe)

自动定位真实飞书群，获取群聊、图片、文件、交互卡片和关联文档。

**结果：✅ 已验证**

### [步骤 02：整理成数字员工可学习的问题处理经验](https://bytedance.larkoffice.com/wiki/ByDKwPnJ2i65Cnk9GYQcosOWnvc)

从原始过程提取事实、推断、动作、结果、未确认项和原始证据。

**结果：✅ 已完成**

### [步骤 03：通过工作结果自动验证经验](https://bytedance.larkoffice.com/wiki/BOCrwLf4ti2sRBkaSUKcO2fbn8e)

不用专家逐条确认，优先用复测、变更、回滚、复发和验收结果验证经验；仅在冲突、高风险或证据不足时找人。

**结果：✅ 机制已确定**

### [步骤 04：自动读取结果并计算经验可信度](https://bytedance.larkoffice.com/wiki/FCBEweEfQiPZW6kITOhc8Pd4n8e)

把结果绑定到具体经验，避免用局部成功证明整个问题已经解决。

**结果：✅ 首轮实测完成；1400 并发持续 48 小时目标仍未验证**

### [步骤 05：经验可信度卡片](https://bytedance.larkoffice.com/wiki/StXiwkXHtiWGadkY9X7c2anJnVO)

把长篇经验转成数字员工可直接使用的产品对象，展示结论、适用条件、证据、反例、可信等级与执行边界。

**结果：✅ 已形成 7 张真实经验卡片**

### [步骤 06：历史 Oncall 自动生成可重演考试案例](https://bytedance.larkoffice.com/wiki/ENHZwdP9LiCwpvkdBy1cRJnqnYc)

采用“案例编译器 + 逐步揭示的桌面推演”，避免真实压测沙箱的高成本，也避免完整群聊泄漏答案。

**结果：✅ 方案已确定**

### [步骤 07：首个压测问题重演案例实测](https://bytedance.larkoffice.com/wiki/M4Y0w2opFiRAlykbItqc7VPBn2g)

使用真实 Oncall 时间线生成首套可运行考试：按查询动作揭示证据，以硬规则检查时序泄漏、错误归因、越权操作和虚构验收，并用三类回答完成评分回归。

**结果：✅ 首套真实案例已生成，评分可区分正确判断、漂亮废话和危险回答**

## 当前结论

| 验证目标 | 状态 |
|---|---|
| 自动获取真实工作数据 | ✅ 已完成 |
| 敏感凭据前置脱敏 | ✅ 已完成 |
| 自动提炼问题处理经验 | ✅ 已完成 |
| 通过工作结果自动验真 | ✅ 首轮完成 |
| 生成可追溯的经验卡片 | ✅ 已完成 |
| 数字员工考试与重演任务 | ✅ 首套真实案例已生成并完成规则回归 |

## 下一步

先阅读[步骤 06 前置调研：数字员工如何考试与沙箱验证](https://bytedance.larkoffice.com/wiki/EL3swjPNGi3FczkJMhXcldM1n2b)。

由于真实压测沙箱需要生产镜像、依赖和环境权限，投入过高，已调整为[步骤 06：历史 Oncall 自动生成可重演考试案例](https://bytedance.larkoffice.com/wiki/ENHZwdP9LiCwpvkdBy1cRJnqnYc)。

调研结论：采用“案例编译器 + 逐步揭示的桌面推演”，验证数字员工的诊断判断、经验迁移、证据意识和安全边界；真实任务操作能力由后续影子试岗验证。

下一步：把步骤 07 的规则实现成可交互的 **Oncall 试岗室**，接入数字员工真实作答轨迹；暂不连接生产环境，也不授予线上操作权限。
