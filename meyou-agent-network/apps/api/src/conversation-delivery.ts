/** Safe, public status: never expose provider responses or connection details. */
export function agentReplyFailureReason(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "model_not_configured") return "model_disabled";
  if (message === "model_configuration_changed") return "model_changed";
  if (message === "model_empty_response") return "empty_response";
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "timeout";
  return "reply_unavailable";
}

/** Run only after the human message has been durably accepted. */
export async function settleAgentReply<T>(
  run: () => Promise<T>,
  onFailure: (reason: string) => Promise<void>
): Promise<T | { status: "unavailable"; reason: string }> {
  try {
    return await run();
  } catch (error) {
    const reason = agentReplyFailureReason(error);
    // An audit outage must not misrepresent a successfully delivered message.
    try { await onFailure(reason); } catch { /* Delivery remains successful. */ }
    return { status: "unavailable", reason };
  }
}
