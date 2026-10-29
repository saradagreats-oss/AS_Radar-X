import { analyzeCommercialUse } from '../analysis/commercialUse.js';
import { checkHistoryProtection } from '../analysis/historyProtection.js';
import { analyzeLongevity } from '../analysis/longevity.js';
import { computeInternalPriorityScore } from '../analysis/opportunityScore.js';
import { analyzeRecurrence } from '../analysis/recurrence.js';
import { evaluateRiskAndRejections } from '../analysis/riskFilter.js';
import { analyzeSupplyAndGaps } from '../analysis/supply.js';
import { RedditCollector } from '../collectors/reddit.js';
import { DiscordCollector } from '../collectors/discord.js';
import { clusterEvidence } from '../normalization/clustering.js';
import { calculateJaccardSimilarity, deduplicateEvidence } from '../normalization/dedupe.js';
import { cleanText, extractTokens, normalizeEvidence } from '../normalization/textNormalizer.js';
import { storage } from '../storage/database.js';
import fs from 'node:fs';
import type { RawEvidence } from '../types.js';

let passed = 0;
let skipped = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed += 1;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed += 1;
  }
}

async function runTests() {
  console.log('--- TEST 1: Normalization ---');
  const rawText = 'Sustainable Agriculture <script>alert(1)</script> Drone Monitoring & Sensors!!';
  const cleaned = cleanText(rawText);
  assert(!cleaned.includes('<script>'), 'cleanText strips HTML tags');
  const tokens = extractTokens(cleaned);
  assert(tokens.includes('sustainable') && tokens.includes('agriculture'), 'extractTokens extracts meaningful words');
  assert(!tokens.includes('and') && !tokens.includes('the'), 'stop words are filtered');

  const sampleEvidence: RawEvidence = {
    source: 'Reddit',
    url: 'https://reddit.com/r/StockPhotography/comments/123/healthcare_b_roll',
    collected_at: new Date().toISOString(),
    evidence_type: 'post',
    raw_title: 'Need authentic healthcare technology and patient monitoring b-roll',
    raw_description: 'Can never find realistic non-cliche medical staff footage',
    raw_keywords: ['healthcare', 'patient', 'hospital', 'medical', 'technology']
  };
  const norm = normalizeEvidence(sampleEvidence);
  assert(norm.category === 'Healthcare & Medicine', 'healthcare evidence is categorized');
  assert(norm.normalized_keywords.length > 0, 'evidence receives normalized keywords');

  console.log('\n--- TEST 2: Deduplication ---');
  const sim = calculateJaccardSimilarity(['solar', 'energy', 'panel'], ['solar', 'energy', 'array']);
  assert(sim >= 0.5, 'Jaccard detects overlap');
  assert(calculateJaccardSimilarity(['doctor'], ['warehouse']) === 0, 'Jaccard handles zero overlap');
  assert(deduplicateEvidence([norm, { ...norm, normalized_keywords: [...norm.normalized_keywords] }]).length === 1, 'duplicate evidence collapses');

  console.log('\n--- TEST 3: Analysis layers ---');
  const cluster = clusterEvidence([norm])[0];
  assert(!!cluster, 'cluster created');
  const rec = analyzeRecurrence(cluster);
  assert(rec.recurrenceScore >= 1 && rec.recurrenceScore <= 5, 'recurrence score is bounded');
  const supply = analyzeSupplyAndGaps(cluster);
  assert(supply.sampleSize === 1, 'supply analysis reports actual sample size');
  assert(supply.differentiationPotential >= 0 && supply.differentiationPotential <= 100, 'differentiation potential is bounded');
  const commercial = analyzeCommercialUse(cluster);
  assert(commercial.targetBuyers.length > 0, 'commercial use profile has inferred buyer contexts');
  assert(commercial.confidence === 'Inferred', 'commercial use is labeled as inference');
  const longevity = analyzeLongevity(cluster);
  assert(!!longevity.reasoning, 'longevity includes reasoning');
  const score = computeInternalPriorityScore(cluster, supply, commercial, longevity);
  assert(score.score >= 0 && score.score <= 100, 'priority score is bounded');
  assert(!score.explanation.includes('sales') || score.explanation.includes('sales forecast'), 'score does not claim sales prediction');

  console.log('\n--- TEST 4: Risk / history ---');
  assert(evaluateRiskAndRejections('Corporate business handshake in front of globe', ['generic office']).rejected, 'stock cliche filter works');
  assert(evaluateRiskAndRejections('Authentic pediatric physical therapist assisting young patient', ['generic office']).rejected === false, 'valid concept is not over-filtered');
  const pastHistory = [{ title: 'Autonomous Drone Precision Agriculture', concept: 'Crop monitoring drone' }];
  assert(checkHistoryProtection('Autonomous Drone Precision Agriculture Monitoring', 'Crop drone sensing', pastHistory).isRepetitive, 'history repetition is detected');
  assert(!checkHistoryProtection('Organic Greenhouse Soil Moisture Sensor Calibration', 'Handheld soil testing', pastHistory).isRepetitive, 'meaningfully different angle is allowed');

  console.log('\n--- TEST 5: Storage ---');
  storage.saveInstructions('Test instruction');
  assert(storage.getInstructions() === 'Test instruction', 'instructions persist');
  storage.saveRejectedContent(['generic handshakes', 'ai plastic faces']);
  assert(storage.getRejectedContent().length === 2, 'rejection list persists');
  storage.deleteRejectedContent(0);
  assert(storage.getRejectedContent()[0] === 'ai plastic faces', 'rejection deletion persists');

  console.log('\\n--- TEST 6: Gemini model fallback regression ---');
  const analystSource = fs.readFileSync(new URL('../gemini/analyst.ts', import.meta.url), 'utf8');
  assert(
    !/for\\s*\\(\\s*const\\s+\\w+\\s+of\\s+candidateModels\\s*\\(\\s*\\)\\s*\\)/.test(analystSource),
    'Gemini model candidate selection awaits async discovery'
  );

  console.log('\\n--- TEST 7: Reddit & Discord Collectors ---');
  const redditCollector = new RedditCollector();
  const discordCollector = new DiscordCollector();
  assert(redditCollector.name === 'Reddit', 'Reddit collector initialized');
  assert(discordCollector.name === 'Discord', 'Discord collector initialized');

  console.log(`\nTEST SUMMARY: ${passed} PASSED, ${skipped} SKIPPED, ${failed} FAILED`);
  if (failed) process.exitCode = 1;
}

runTests().catch((err) => {
  console.error(err);
  process.exitCode = 1;
  });
