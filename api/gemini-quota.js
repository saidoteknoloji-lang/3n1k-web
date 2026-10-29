export function getGeminiQuotaRetryAfterSeconds(response, detail) {
  const isQuotaError = response.status === 429
    || /quota exceeded|current quota|requests per day limit exceeded|rate.?limit/i.test(detail);
  if (!isQuotaError) return null;

  const retryAfterHeader = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfterHeader) && retryAfterHeader > 0) {
    return Math.ceil(retryAfterHeader);
  }

  const retryMatch = detail.match(/retry in\s+(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?/i);
  if (!retryMatch) return null;

  const seconds = Number(retryMatch[1] || 0) * 3600
    + Number(retryMatch[2] || 0) * 60
    + Number(retryMatch[3] || 0);
  return seconds > 0 ? Math.ceil(seconds) : null;
}
