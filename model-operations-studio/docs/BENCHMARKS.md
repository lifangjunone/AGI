# Local Benchmarks

Machine: MacBook Pro, Apple M5 Pro, 18 CPU cores, 20 GPU cores, 48 GB unified memory, macOS 26.6.2.

## Qwen3.5-9B Q4_K_M

Verified 2026-09-09 with `llama.cpp` 0.4.0:

| Metric | Result |
| --- | ---: |
| Model checksum | Passed |
| Health endpoint | `200 {"status":"ok"}` |
| Prompt processing | 115.53 token/s |
| Generation | 42.71 token/s |
| Generated answer | 37 tokens |
| Generation time | 0.84 s |
| Server RSS after load | 5,682,576 KiB |
| Thinking mode | Disabled |

Test prompt: `只用一句中文回答：什么是模型即服务？`

The model returned a complete one-sentence Chinese definition through the control plane's OpenAI-compatible adapter.

## Wan2.2-TI2V-5B FP16

The benchmark result is written only after all three artifacts pass SHA-256 verification and ComfyUI completes a real render. Use:

```bash
npm run benchmark:wan -- "雨后的上海街道，一辆复古电车缓慢驶过，电影级光影，镜头平稳向前推进"
```

The JSON evidence is stored under `runtime/outputs/` and is intentionally excluded from Git because it contains machine-specific paths and generated media metadata.
