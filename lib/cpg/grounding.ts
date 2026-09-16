const STOP = new Set(['the','and','for','with','that','this','from','were','was','are','has','have','into','than','last','next','your','about','which','show','find','what','how','why','when','where','brand','brands','sales','units'])

function tokens(value: string) {
  return new Set(value.toLowerCase().replace(/[^a-z0-9.%$-]+/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t)))
}

function numbers(value: string) {
  return [...value.matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?%?/g)].map((m) => m[0].replace(/,/g, ''))
}

export function calculateGroundingScore(answer: string, evidence: string) {
  const answerTokens = tokens(answer)
  const evidenceTokens = tokens(evidence)
  const tokenCoverage = answerTokens.size
    ? [...answerTokens].filter((token) => evidenceTokens.has(token)).length / answerTokens.size
    : 0

  const answerNumbers = numbers(answer)
  const evidenceNumbers = new Set(numbers(evidence))
  const numericCoverage = answerNumbers.length
    ? answerNumbers.filter((number) => evidenceNumbers.has(number)).length / answerNumbers.length
    : null

  const score = answerNumbers.length
    ? (tokenCoverage * 0.4 + (numericCoverage ?? 0) * 0.6) * 100
    : tokenCoverage * 100

  return {
    score: Math.max(0, Math.min(100, Math.round(score * 10) / 10)),
    method: 'Deterministic evidence coverage: entity/term overlap plus exact numeric-claim matches. This is grounding confidence, not a benchmarked model accuracy percentage.',
    numericClaims: answerNumbers.length,
    matchedNumericClaims: answerNumbers.filter((number) => evidenceNumbers.has(number)).length,
  }
}
