# Debug Session: iphone-asr-transcription
- **Status**: [OPEN]
- **Issue**: iPhone 语音输入结束后显示“本地模型未完成转写”，预期返回有效转写文本。
- **Debug Server**: http://10.3.223.139:7777/event
- **Log File**: .dbg/trae-debug-log-iphone-asr-transcription.ndjson

## Reproduction Steps
1. 解锁并打开 iPhone 上的 EasySay。
2. 进入首次建档或口语练习。
3. 点击录音，说一段清晰英语后停止。
4. 等待本地 ASR 返回，页面显示“本地模型未完成转写”。

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | iPhone 录音 MIME/容器与服务端解码不兼容 | High | Low | Pending |
| B | App 请求未到达 8785 网关或鉴权失败 | Medium | Low | Pending |
| C | 网关 body 解析或转发错误 | Medium | Low | Pending |
| D | ASR 模型加载、内存或推理失败 | High | Medium | Pending |
| E | 录音过短或静音被质量校验拒绝 | Medium | Low | Pending |

## Log Evidence
Instrumentation points:
- A/E: iPhone Blob size, MIME type, decoded duration and RMS.
- B: Resolved gateway URL, access-code presence and client response.
- C: Express raw-body shape and upstream response.
- D: Python model result length and latency.

Pre-fix:
- Line 1/6: iPhone prepared authenticated requests to the correct
  `http://10.3.223.139:8785/api/speech/asr` endpoint.
- Line 2/4: iOS produced valid non-empty `audio/mp4; codecs=mp4a.40.2` blobs
  around 55 KB.
- Line 3/5: Capacitor rejected the Blob before an HTTP response with
  `CapacitorUrlRequestError error 0`.
- Gateway and Python instrumentation emitted no events; ASR request metrics
  remained zero.

Hypothesis A rejected at the recording boundary. Hypotheses B/C/D/E rejected.
Confirmed root cause: Capacitor's patched native fetch cannot serialize the
iOS MediaRecorder Blob and aborts before the request leaves the phone.

Post-fix iteration 1:
- The iPhone request reached `/v1/asr`, proving the Capacitor HTTP change fixed
  the original transport failure.
- The temporary Python debug reporter then raised `ConnectionRefusedError`
  because the debug server had exited, causing a 500 before audio decoding.
- The reporter is now guarded so debug infrastructure cannot affect ASR.
- With the debug server intentionally unavailable, the guarded service
  successfully transcribed the same test sentence in 18.5 seconds. This proves
  ASR no longer depends on debug infrastructure.

## Verification Conclusion
Pending post-fix comparison.
