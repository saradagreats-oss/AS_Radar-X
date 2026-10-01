export interface RiskFilterResult {
  rejected: boolean;
  matchedConstraint?: string;
  reason?: string;
}

export function evaluateRiskAndRejections(
  textToCheck: string,
  userRejectedItems: string[]
): RiskFilterResult {
  const normalizedText = (textToCheck || '').toLowerCase();

  // Check against user's custom exclusion history / Adobe Not Accepted list
  for (const item of userRejectedItems) {
    const itemNorm = item.trim().toLowerCase();
    if (!itemNorm) continue;
    if (normalizedText.includes(itemNorm)) {
      return {
        rejected: true,
        matchedConstraint: item,
        reason: `Exclusion match: User marked '${item}' as not accepted content.`
      };
    }
  }

  // Stock marketplace baseline rejection filters
  const genericCliches = [
    'handshake in front of globe',
    'seedling in hands',
    'puzzle pieces coming together',
    'businessman touching glowing virtual screen with index finger'
  ];

  for (const cliche of genericCliches) {
    if (normalizedText.includes(cliche)) {
      return {
        rejected: true,
        matchedConstraint: cliche,
        reason: `Commercial quality filter: concept matches saturated stock cliché '${cliche}'.`
      };
    }
  }

  return { rejected: false };
}
