const STOP = new Set(['the','and','for','with','that','this','from','were','was','are','has','have','into','than','last','next','your','about','which','show','find','what','how','why','when','where','brand','brands','sales','units'])

function tokens(value: string) {
  return new Set(value.toLowerCase().replace(/[^a-z0-9.%$-]+/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t)))
}

function numbers(value: string) {
  return [...value.matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?%?/g)].map((m) => m[0].replace(/,/g, ''))
}

/**
 * Measures the share of model claims that can be verified against the independently
 * calculated dataset evidence supplied to the model. It is recalculated for every
 * answer and is intentionally labelled dataset-verified accuracy, not benchmark
 * accuracy across an external labelled corpus.
 */
export function calculateGroundingScore(answer: string, evidence: string) {
  const answerTokens = tokens(answer)
  const evidenceTokens = tokens(evidence)
  const supportedTokens = [...answerTokens].filter((token) => evidenceTokens.has(token))
  const tokenPrecision = answerTokens.size ? supportedTokens.length / answerTokens.size : 1

  const answerNumbers = numbers(answer)
  const evidenceNumbers = new Set(numbers(evidence))
  const matchedNumbers = answerNumbers.filter((number) => evidenceNumbers.has(number))
  const numericPrecision = answerNumbers.length ? matchedNumbers.length / answerNumbers.length : 1

  // Numeric claims are independently verifiable facts, so they carry the larger weight.
  const score = (tokenPrecision * 0.35 + numericPrecision * 0.65) * 100
  return {
    score: Math.max(0, Math.min(100, Math.round(score * 10) / 10)),
    method: 'Dataset-verified claim accuracy: every answer is scored against independently computed dataset evidence. Numeric claims receive higher weight; unsupported claims reduce the score. This is not an external benchmark accuracy score.',
    claimCount: answerTokens.size + answerNumbers.length,
    supportedClaims: supportedTokens.length + matchedNumbers.length,
    numericClaims: answerNumbers.length,
    matchedNumericClaims: matchedNumbers.length,
  }
}
