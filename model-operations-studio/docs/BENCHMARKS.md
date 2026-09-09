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

Verified 2026-09-09 with ComfyUI 0.35.0, PyTorch 2.14.0 and MPS:

| Metric | Cold run | Warm verified run |
| --- | ---: | ---: |
| Resolution | 832x480 | 832x480 |
| Frames / FPS | 49 / 16 | 49 / 16 |
| Sampler / steps / CFG | Euler / 20 / 5 | Euler / 20 / 5 |
| End-to-end time | 217.49 s | 154.57 s |
| Output duration | 3.063 s | 3.063 s |
| Highest observed process RSS | 15.93 GiB | 1.28 GiB after model caching/offload |
| Black frames | None | None |
| Decode errors | None | None |
| Progressive vertical banding | None observed | Heuristic passed |
| Progressive saturation | None observed | Heuristic passed |

The fixed-seed warm run passed automated frame decoding, black-frame detection, progressive column-edge analysis, and saturation-growth analysis. Manual review of frames 0/16/32/48 found coherent tram motion, stable wet-road reflections and no visible stripe corruption. Prompt adherence was good for rainy street, tram, lighting and camera continuity; Shanghai-specific visual identity was only moderate.

The same deployment also passed an image-to-video API smoke test using a PNG reference: 512x288, 9 frames, 4 steps, Euler, CFG 4 completed in 41.44 seconds and produced a decodable 0.563-second WebM.

## Duration Orchestration

Verified 2026-09-09:

| Requested duration | Plan | Result |
| --- | --- | --- |
| 5 seconds | 1 x 81-frame segment | 5.063-second WebM |
| 10 seconds | 2 x 81-frame continuation segments | 10.000-second merged WebM |
| 30 seconds | 6 x 81-frame continuation segments | Planner and validation passed |
| 60 seconds | 12 x 81-frame continuation segments | Planner and validation passed |

The 10-second run completed both segments, extracted the first segment's final frame for continuity, and concatenated the two VP9 outputs. Full 30/60-second renders were not run because they scale to approximately 6/12 times the five-second generation cost.

Evidence:

- Machine-readable report: `runtime/outputs/wan22-benchmark-1788948655012.json`
- Output: `runtime/ComfyUI/output/ModelOps/wan22-mps_00005_.webm`
- Contact sheet: `runtime/outputs/wan22-mps_00005_-contact-sheet.png`

Re-run with:

```bash
npm run benchmark:wan -- "雨后的上海街道，一辆复古电车缓慢驶过，电影级光影，镜头平稳向前推进"
```

The JSON evidence is stored under `runtime/outputs/` and is intentionally excluded from Git because it contains machine-specific paths and generated media metadata.
