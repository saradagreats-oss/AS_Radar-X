import fs from 'node:fs';
import { analyzeCommercialUse } from '../analysis/commercialUse.js';
import { checkHistoryProtection } from '../analysis/historyProtection.js';
import { analyzeLongevity } from '../analysis/longevity.js';
import { computeInternalPriorityScore } from '../analysis/opportunityScore.js';
import { analyzeRecurrence } from '../analysis/recurrence.js';
import { evaluateRiskAndRejections } from '../analysis/riskFilter.js';
import { analyzeSupplyAndGaps } from '../analysis/supply.js';
import { calculateOpportunityScore } from '../analysis/evidenceScore.js';
import { clusterEvidence } from '../normalization/clustering.js';
import { calculateJaccardSimilarity, deduplicateEvidence } from '../normalization/dedupe.js';
import { cleanText, extractTokens, normalizeEvidence } from '../normalization/textNormalizer.js';
import { storage } from '../storage/database.js';
import type { RawEvidence } from '../types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log('  ✓ ' + message);
    passed += 1;
  } else {
    console.error('  ✗ FAIL: ' + message);
    failed += 1;
  }
}

async function runTests() {
  console.log('--- TEST 1: Browser evidence normalization ---');
  const rawText = 'Sustainable Agriculture <script>alert(1)</script> Drone Monitoring & Sensors!!';
  const cleaned = cleanText(rawText);
  assert(!cleaned.includes('<script>'), 'cleanText strips HTML tags');
  const tokens = extractTokens(cleaned);
  assert(tokens.includes('sustainable') && tokens.includes('agriculture'), 'extractTokens finds meaningful terms');
  assert(!tokens.includes('and') && !tokens.includes('the'), 'stop words are filtered');

  const evidence: RawEvidence = {
    source: 'Browser Research',
    url: 'https://example.com/market/healthcare-monitoring',
    collected_at: new Date().toISOString(),
    evidence_type: 'search_observation',
    raw_title: 'Healthcare technology and patient monitoring systems',
    raw_description: 'Commercial page describing clinical monitoring products and workflow applications.',
    raw_keywords: ['healthcare', 'patient', 'monitoring', 'technology']
  };
  const normalized = normalizeEvidence(evidence);
  assert(normalized.normalized_keywords.length > 0, 'browser evidence receives normalized keywords');

  console.log('\n--- TEST 2: Deduplication and clustering ---');
  const similarity = calculateJaccardSimilarity(['solar', 'energy', 'panel'], ['solar', 'energy', 'array']);
  assert(similarity >= 0.5, 'Jaccard detects related keyword sets');
  assert(calculateJaccardSimilarity(['doctor'], ['warehouse']) === 0, 'Jaccard handles unrelated terms');
  assert(deduplicateEvidence([normalized, { ...normalized, normalized_keywords: [...normalized.normalized_keywords] }]).length === 1, 'duplicate observations collapse');
  const cluster = clusterEvidence([normalized])[0];
  assert(!!cluster, 'concept cluster is created');

  console.log('\n--- TEST 3: Existing deterministic analysis layers ---');
  const recurrence = analyzeRecurrence(cluster);
  const supply = analyzeSupplyAndGaps(cluster);
  const commercial = analyzeCommercialUse(cluster);
  const longevity = analyzeLongevity(cluster);
  const priority = computeInternalPriorityScore(cluster, supply, commercial, longevity);
  assert(recurrence.recurrenceScore >= 1 && recurrence.recurrenceScore <= 5, 'recurrence score is bounded');
  assert(supply.sampleSize === 1, 'supply analysis reports the observed sample size');
  assert(supply.differentiationPotential >= 0 && supply.differentiationPotential <= 100, 'gap potential is bounded');
  assert(commercial.confidence === 'Inferred', 'inferred buyer uses are labelled as inference');
  assert(!!longevity.reasoning, 'longevity has a written reason');
  assert(priority.score >= 0 && priority.score <= 100, 'legacy deterministic score remains bounded');

  console.log('\n--- TEST 4: Evidence-backed final scoring ---');
  const ids = [1, 2, 3, 4, 5, 6];
  const scoreInput = {
    recurring_demand: { score: 80, reason: 'Repeated in more than one dated source.', evidence_ids: [1] },
    commercial_use: { score: 60, reason: 'A public product page documents a buyer workflow.', evidence_ids: [2] },
    marketplace_evidence: { score: 50, reason: 'Visible marketplace listings were inspected.', evidence_ids: [3] },
    supply_gap: { score: 40, reason: 'Observed listings repeat one angle.', evidence_ids: [4] },
    longevity: { score: 70, reason: 'The commercial workflow is recurring.', evidence_ids: [5] },
    production_feasibility: { score: 90, reason: 'The visual can be produced clearly.', evidence_ids: [6] }
  };
  const score = calculateOpportunityScore(scoreInput, new Set(ids));
  assert(score.score === 64, 'weighted total is calculated deterministically');
  assert(score.confidence === 'HIGH', 'six independently referenced components create high evidence confidence');
  const invalid = calculateOpportunityScore(scoreInput, new Set([99]));
  assert(invalid.score === 0, 'unmatched or absent source references receive no component credit');
  assert(invalid.breakdown.recurring_demand.evidence_ids.length === 0, 'invalid IDs are filtered from score breakdown');

  console.log('\n--- TEST 5: Rejection and repeat protection ---');
  assert(evaluateRiskAndRejections('Corporate business handshake in front of globe', ['generic office']).rejected, 'user exclusion rules block a matching cliché');
  assert(!evaluateRiskAndRejections('Authentic pediatric physical therapist assisting young patient', ['generic office']).rejected, 'valid distinct concepts are not over-filtered');
  const past = [{ title: 'Autonomous Drone Precision Agriculture', concept: 'Crop monitoring drone' }];
  assert(checkHistoryProtection('Autonomous Drone Precision Agriculture Monitoring', 'Crop drone sensing', past).isRepetitive, 'near-duplicate concepts are detected');
  assert(!checkHistoryProtection('Organic Greenhouse Soil Moisture Sensor Calibration', 'Handheld soil testing', past).isRepetitive, 'materially different angles remain eligible');

  console.log('\n--- TEST 6: Research workflow integration ---');
  const researcherSource = fs.readFileSync(new URL('../researcher.ts', import.meta.url), 'utf8');
  const analystSource = fs.readFileSync(new URL('../gemini/analyst.ts', import.meta.url), 'utf8');
  const agentSource = fs.readFileSync(new URL('../agent/computerUseResearch.ts', import.meta.url), 'utf8');
  assert(researcherSource.includes('runComputerUseResearch'), 'coordinator starts the computer-use agent');
  assert(researcherSource.includes('runGeminiStrategicAnalyst'), 'browser observations flow into final analysis');
  assert(researcherSource.includes('getResearchEvents'), 'research history is reused as durable evidence');
  assert(agentSource.includes('resumeComputerUse') && agentSource.includes('human_handoff'), 'verification pauses can be resumed by the user');
  assert(agentSource.includes('portfolio_synced') && agentSource.includes('upsertPortfolioAssets'), 'visible portfolio data is stored automatically');
  assert(!researcherSource.includes('RedditCollector') && !researcherSource.includes('DiscordCollector'), 'the research pipeline has no social collector dependency');
  assert(!analystSource.includes('site:reddit.com') && !analystSource.includes('discord.com'), 'the final analyst has no Reddit/Discord source prompts');

  console.log('\n--- TEST 7: Local persistence ---');
  const eventJob = 'test_event_' + Date.now();
  storage.appendResearchEvent({
    id: 'event_' + Date.now(),
    jobId: eventJob,
    at: new Date().toISOString(),
    type: 'test',
    message: 'Persistence verification',
    details: { count: 3 }
  });
  const storedEvents = storage.getResearchEvents(eventJob);
  assert(storedEvents.length === 1 && storedEvents[0].details.count === 3, 'research audit events persist in SQLite');

  const gitignore = fs.readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8');
  assert(gitignore.includes('/data/') && gitignore.includes('*.sqlite'), 'private local runtime data is excluded from Git');

  console.log('\nTEST SUMMARY: ' + passed + ' PASSED, ' + failed + ' FAILED');
  if (failed) process.exitCode = 1;
}

runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
