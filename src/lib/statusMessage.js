export function buildStatusMessage(text, tone = "success") {
  const normalizedTone = tone === "error" || tone === "pending" || tone === "neutral" ? tone : "success";
  return {
    text: String(text || "").trim(),
    tone: normalizedTone,
  };
}
