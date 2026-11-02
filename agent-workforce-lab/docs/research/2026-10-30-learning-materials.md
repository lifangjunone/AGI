# 已有工作资料进入数字分身学习

## 调研来源

本轮读取以下公开来源，均返回 200；是公开机制核查，非完整安装验证，也不等于六轮深入研究。

| 来源 | 参考点 | 边界 |
|---|---|---|
| [Notion AI Connectors](https://www.notion.com/help/notion-ai-connectors) | 复用已有来源、权限映射、来源引用、断开后停止检索 | 本轮没有接入 Notion 或飞书同步 |
| [Lindy Watch and Learn](https://www.lindy.ai/product/watch-and-learn) | 示范或已有步骤进入学习，模糊判断再询问 | 本轮没有录屏学习或自主判断 |
| [StaffDeck](https://github.com/OpenBMB/StaffDeck) | 经验、知识与执行轨迹分开，保留可追踪依据 | 未复用其后端或执行运行时 |
| [Second Me](https://github.com/mindverse/Second-Me) | 个人记忆与持续身份，本地数据控制 | 本轮不做微调，不把导入视为模型成长 |
| [OWASP 文件上传](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) | 文件类型、体积、权限、存储位置与内容安全 | 仅接收 UTF-8 文本，原始文件不落盘、不执行 |
| [OWASP 提示注入](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) | 来源是数据而非命令，明确隔离与权限 | 本轮规则摘录不执行资料指令；后续模型仍需专门防御测试 |

## 产品判断

人工导入只降低“重新录入工作”的成本，并未满足长期“不增加真人工作量”的目标。
它是冷启动与已有资料迁移入口，不替代授权后的飞书持续同步、工具事件接入。
没有证据证明通用上传能提炼完整员工能力，考试和真实交付仍不可省略。

## 本轮已实现

- 学习空间提供“导入已有资料”：选分身、选 Markdown/TXT、明确授权。
- 限制 UTF-8、256KB、10–20000 字符；拒绝二进制和无效编码。
- 常见 APIKey、uToken、访问令牌和私钥遮盖为 `**`；不是完整 DLP，仍要求使用脱敏资料。
- 保存资料名称、内容摘要、体积和授权时间；不保存原始文件。
- 相同内容与同一分身重复导入返回已有记录，不重复创建。
- 界面明确“规则草稿、非模型学习”，不显示“学会了”。
- 本人可以撤回授权：正文停止展示，关联能力暂停，相关在途任务阻塞；历史审计保留。
- 认领时重算当前资格，撤回后旧考核、更新、邀请、提交与验收不能绕过门禁。

## 验证

- `backend/test_studio_v2.py`：6 passed，覆盖导入限制、未授权、脱敏、去重、撤回资格失效。
- `tests/learning-inbox.cjs`：UI 选择文件→授权→导入→选中记录→检查脱敏→撤回→正文不可见，通过。
- 生产构建通过；实际截图 `design/review/workspace-inbox/material-import-desktop.png` 已复查。

## 未完成项

自动采集、来源连接状态、细粒度引用、模型提炼与自主考核未实现。
任务产物的来源依赖尚粗粒度，撤回后恢复流程与历史内容权限仍需完善。
本轮不构成整体产品级完成证据。
