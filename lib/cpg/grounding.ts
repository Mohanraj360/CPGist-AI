function numbers(value: string) { return [...value.matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?%?/g)].map((m) => m[0].replace(/,/g, '')) }
function entities(value: string) { return [...value.matchAll(/\b[A-Z][A-Za-z0-9&.-]{2,}\b/g)].map((m) => m[0].toLowerCase()) }

export function calculateGroundingScore(answer: string, evidence: string) {
  const answerNumbers = numbers(answer)
  const evidenceNumbers = new Set(numbers(evidence))
  const matchedNumbers = answerNumbers.filter((number) => evidenceNumbers.has(number))
  const answerEntities = entities(answer)
  const evidenceEntities = new Set(entities(evidence))
  const matchedEntities = answerEntities.filter((entity) => evidenceEntities.has(entity))
  const numericAccuracy = answerNumbers.length ? matchedNumbers.length / answerNumbers.length : 1
  const entityAccuracy = answerEntities.length ? matchedEntities.length / answerEntities.length : 1
  const supportedClaimRate = (numericAccuracy + entityAccuracy) / 2
  const unsupportedClaimRate = 1 - supportedClaimRate
  const score = Math.round(supportedClaimRate * 1000) / 10
  return { score, numericAccuracy, entityAccuracy, supportedClaimRate, unsupportedClaimRate, sampleCount: Math.max(answerNumbers.length, answerEntities.length), method: 'Deterministic dataset evaluation: numerical and named-entity claims are compared with independently calculated evidence. This is not token overlap or an external benchmark accuracy score.', claimCount: answerNumbers.length + answerEntities.length, supportedClaims: matchedNumbers.length + matchedEntities.length, numericClaims: answerNumbers.length, matchedNumericClaims: matchedNumbers.length }
}
