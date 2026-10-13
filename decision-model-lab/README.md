# Decision Model Lab

面向“校准决策模型探索”的可复现工程：连接 CLM，将复杂 State 转成 Choice、Score、
Yes/No 或候选排序，并用准确率、ECE、Brier、NLL 和延迟评估模型是否适合进入 Agent Loop。

## 为什么做这个项目

领导在飞书群“校准决策模型探索”提出：

- 从 Jev 和 CLM 开始探索应用与调优；
- 在内网提供可验证部署；
- 研究 CLM 论文和开源项目；
- 研究清楚后再按需要调优与推广。

群里已有一套临时 CLM Server。本项目不重复做一个只能手工点选的 Playground，而是在它之上补齐
“可复现部署 → 业务评测 → 概率校准 → 微调准入”的闭环。

## 已实现

- CLM `POST /v1/systemone` 与 `POST /v1/rank` 适配；
- Choice、Noul（Yes/No）、Score 三类结构化决策；
- 无 GPU 可运行的确定性 Mock Provider（只用于联调，UI 有明确标识）；
- Accuracy、Top-label ECE、Multiclass Brier、NLL、平均延迟；
- Web 决策台、可靠性图、逐样本评测结果与研究路线；
- Docker/Compose 内网部署；
- JSONL 评测数据契约与测试。

## 5 分钟启动

要求 Python 3.11+。

```bash
cd /Users/bytedance/Desktop/agi/decision-model-lab
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
decision-lab
```

访问 <http://127.0.0.1:8800>。默认是 Mock 联调模式，不下载模型、不需要 GPU。

连接群内已有 CLM：

```bash
export DECISION_LAB_PROVIDER=clm
export CLM_BASE_URL=http://101.126.70.68:8700
decision-lab
```

生产或共享环境建议设置 `DECISION_LAB_API_KEY`，并让调用方发送
`Authorization: Bearer <key>`。

## 自部署真实 CLM

CLM 官方架构由两个服务组成：

```text
Decision Model Lab :8800
        │
        ▼
clm-serve :8700         projection heads + typed decision API + vector cache
        │
        ▼
vLLM :8090              Qwen3-8B, --runner pooling, GPU
```

在 GPU 机器上：

```bash
python3 -m venv .venv-clm
source .venv-clm/bin/activate
pip install contrastive-lm vllm

vllm serve Qwen/Qwen3-8B \
  --served-model-name qwen3-8b \
  --runner pooling \
  --enable-prefix-caching \
  --max-model-len 2048 \
  --port 8090
```

另一个终端：

```bash
source .venv-clm/bin/activate
CLM_EMB_URL=http://127.0.0.1:8090/v1/embeddings clm-serve --port 8700
```

再启动本项目：

```bash
DECISION_LAB_PROVIDER=clm \
CLM_BASE_URL=http://127.0.0.1:8700 \
decision-lab
```

CLM 首次启动会下载官方约 75 MB projection head；Qwen3-8B 权重和 GPU 显存需要由部署环境准备。
如需更长 State，vLLM 的 `--max-model-len` 与 `clm-serve --max-tokens` 必须一起调整。

## Docker 部署

Mock 联调：

```bash
docker compose up --build -d
```

连接已有 CLM：

```bash
DECISION_LAB_PROVIDER=clm \
CLM_BASE_URL=http://host.docker.internal:8700 \
docker compose up --build -d
```

## API

决策：

```bash
curl http://127.0.0.1:8800/api/decide \
  -H 'content-type: application/json' \
  -d '{
    "state": "客户被重复扣款，订单中有两笔相同支付",
    "questions": {
      "route": {
        "type": "choice",
        "instructions": "下一步由哪个团队处理？",
        "criteria": {
          "billing": "处理扣款、发票和退款",
          "technical": "处理程序故障"
        }
      }
    }
  }'
```

批量校准评测：

```bash
curl http://127.0.0.1:8800/api/evaluate \
  -H 'content-type: application/json' \
  --data-binary @<(jq -s '{examples: ., model: "clm-latest"}' data/example-eval.jsonl)
```

`/docs` 提供 OpenAPI 调试页面。

## 评测数据契约

一行一个 JSON：

```json
{
  "id": "coding-001",
  "split": "test",
  "state": "当前 Agent 状态",
  "question": {
    "type": "choice",
    "instructions": "下一步动作？",
    "criteria": {"edit": "修改代码", "test": "运行测试"}
  },
  "label": "edit",
  "metadata": {"workflow": "coding_agent", "source": "trajectory"}
}
```

业务实验必须做到：

1. 按任务、会话或 workflow 切分 train/dev/test，避免同一轨迹泄漏；
2. 在任何微调前固化 CLM 官方 head、`clm-raw` 和生成式 LLM 三条基线；
3. 同时报告 Accuracy、ECE、Brier/NLL、P50/P95 延迟、缓存命中条件和成本；
4. Hard negative 必须“都合理但只有一个是当前最佳动作”，不能只放无关选项；
5. 调温度只能用 dev 集，test 集只运行一次最终评估。

## 微调路线

CLM 的核心是 Frozen Qwen3-8B + State/Action Projection Heads + 双向 InfoNCE。
建议按以下顺序推进：

1. 从真实 Agent trajectory 拆 `(state_t, action_t)`；
2. 建立同 workflow 的 hard negatives；
3. 先跑官方 head 的零样本基线；
4. 冻结 backbone，仅微调 projection heads；
5. 用任务隔离的 held-out 集评估，失败则保留通用模型；
6. 只有在业务收益稳定且校准不过度恶化后，才进入在线灰度。

官方微调入口：

```bash
git clone https://github.com/Contrastive-LM/CLM.git
cd CLM
python train/finetune.py --help
```

请遵循官方要求：先固定数据、checkpoint、fold 和评测命令，再跑不可变 baseline；不要在 test split
上调参。

## 验证

```bash
ruff check .
pytest
```

## 研究依据

- [Contrastive-LM/CLM](https://github.com/Contrastive-LM/CLM)
- [CLM 官方项目页](https://contrastive-lm.notion.site/)
- 群内材料：《从 Jev 到 CLM：System One Model 的兴起与 Contrastive Language Model 技术解析》

本仓库代码可按 Apache-2.0 使用；模型和上游代码的许可仍以各自发布页为准。
