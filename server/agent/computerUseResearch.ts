import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { browserBridge, type BrowserCapture } from './browserBridge.js';
import { storage } from '../storage/database.js';
import { getComputerUseModelCandidates, listAvailableGeminiModels } from '../gemini/models.js';

const root = path.resolve(process.env.AS_RADAR_DATA_DIR || path.resolve(process.cwd(), 'data'));
const eventsDir = path.join(root, 'research-events');
const shotsDir = path.join(root, 'research-screenshots');
const pending = new Map<string, () => void>();
const GEMINI_REQUEST_TIMEOUT_MS = 60_000;
const GEMINI_HEARTBEAT_INTERVAL_MS = 10_000;
const SITE_CAPTURE_MAX_ATTEMPTS = 3;
const SITE_CAPTURE_RETRY_DELAY_MS = 1_200;
const STARTING_PUBLIC_MARKETPLACES = [
  'https://stock.adobe.com/',
  'https://www.shutterstock.com/',
  'https://www.istockphoto.com/',
  'https://www.freepik.com/'
];

function log(jobId: string, type: string, message: string, details: Record<string, any> = {}, url = '') {
  const event = { id: crypto.randomUUID(), jobId, at: new Date().toISOString(), type, message, details, url };
  storage.appendResearchEvent(event);
  fs.mkdirSync(eventsDir, { recursive: true });
  fs.appendFileSync(path.join(eventsDir, path.basename(jobId) + '.jsonl'), JSON.stringify(event) + '\n', 'utf8');
  return event;
}

function saveScreenshot(jobId: string, data?: string) {
  if (!data) return undefined;
  try {
    const dir = path.join(shotsDir, path.basename(jobId));
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}.jpg`);
    fs.writeFileSync(target, Buffer.from(data, 'base64'));
    return path.relative(root, target).split(path.sep).join('/');
  } catch (error: any) {
    log(jobId, 'screenshot_error', 'Screenshot could not be saved locally.', { error: error.message || String(error) });
    return undefined;
  }
}

export function resumeComputerUse(jobId: string) {
  const resume = pending.get(jobId);
  if (!resume) return false;
  pending.delete(jobId); resume(); return true;
}

function handoff(jobId: string, message: string, url: string, onHandoff?: (message: string) => void, onResume?: () => void) {
  log(jobId, 'human_handoff', message, { resumeRequired: true }, url);
  onHandoff?.(message);
  return new Promise<void>(resolve => pending.set(jobId, () => { onResume?.(); resolve(); }));
}

async function awaitUserHandoff(
  jobId: string,
  message: string,
  url: string,
  input: { onHandoff?: (message: string) => void; onResume?: () => void }
): Promise<any> {
  await browserBridge.show();
  await browserBridge.setTakeover(true);
  try {
    await handoff(jobId, message, url, input.onHandoff, input.onResume);
  } finally {
    await browserBridge.setTakeover(false).catch(() => undefined);
  }

  try {
    const capture = await browserBridge.capture();
    const screenshot = saveScreenshot(jobId, capture.screenshotBase64);
log(jobId, 'browser_preview', 'The user handoff is complete. Gemini has the browser back.', {
      screenshot,
      pageTitle: capture.snapshot.title,
      userHandoffCompleted: true
    }, capture.snapshot.url);
    return capture;
  } finally {
    await browserBridge.hide().catch(() => undefined);
  }
}

function getText(interaction: any) {
  return (interaction?.steps || []).filter((s: any) => s.type === 'model_output').flatMap((s: any) => s.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text || '').join('\n');
}

function isVerification(snapshot: any) {
  const text = String(snapshot?.text || '');
  let url = '';
  try { url = new URL(String(snapshot?.url || '')).hostname.toLowerCase(); } catch { /* no URL */ }
  const adobeAuthHost = /(^|\.)((account|auth)\.adobe\.com|adobeid[^.]*\.services\.adobe\.com)$/.test(url);
  const authCopy = /sign in to adobe|sign in to continue|enter your password|email address to continue|two.step verification|verify your identity/i.test(text);
  return !!snapshot?.verificationHint || snapshot?.passwordFieldCount > 0 || (adobeAuthHost && authCopy);
}

function actionSafety(call: any) {
  const args = call?.arguments || {};
  const raw = args.safety_decision ?? call?.safety_decision ?? call?.safetyDecision ?? '';
  if (raw && typeof raw === 'object') return String(raw.decision || raw.status || '').toLowerCase();
  return String(raw).toLowerCase();
}

function isRetryableGeminiError(error: any): boolean {
  const message = String(error?.message || error || '');
  const status = String(error?.status || error?.code || '');
  return /\b(429|500|502|503|504)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|high demand|temporarily unavailable|overloaded|timed? ?out|timeout/i.test(status + ' ' + message);
}

function isUnavailableModelError(error: any): boolean {
  const message = String(error?.message || error || '');
  const status = String(error?.status || error?.code || '');
  return /\b404\b|model[^.]{0,80}(not found|not available|not supported)|not found[^.]{0,80}model/i.test(status + ' ' + message);
}

function waitForRetry(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getHost(url: string): string {
  try { return new URL(String(url || '')).hostname.toLowerCase(); } catch { return ''; }
}

function getPageCaptureProblem(capture: BrowserCapture): string | null {
  const snapshot = capture?.snapshot;
  if (!snapshot) return 'The browser returned no page snapshot.';
  if (!/^https?:\/\//i.test(String(snapshot.url || ''))) {
    return `The browser did not reach a public web page (current URL: ${snapshot.url || 'unknown'}).`;
  }

  const text = String(snapshot.text || '').replace(/\s+/g, ' ').trim();
  const title = String(snapshot.title || '').trim();
  const failureText = `${title} ${text}`;
  const knownFailure = failureText.match(/this site can(?:not|'t|’t) be reached|web page not available|webpage not available|ERR_(?:NAME_NOT_RESOLVED|CONNECTION_TIMED_OUT|TIMED_OUT|CONNECTION_REFUSED|ADDRESS_UNREACHABLE|INTERNET_DISCONNECTED)|too many requests|429 too many requests|403 forbidden|access denied|temporarily unavailable/i);
  if (knownFailure) return `The site returned a browser/network error: ${knownFailure[0]}.`;

  const hasVisibleEvidence = text.length >= 45
    || (snapshot.headings || []).length > 0
    || (snapshot.links || []).length >= 2
    || (snapshot.images || []).length >= 2
    || (snapshot.tables || []).length > 0;
  if (!hasVisibleEvidence) return 'The page loaded but returned too little readable public content to research.';
  return null;
}

function unavailableCapture(url: string, reason: string): BrowserCapture {
  return {
    snapshot: {
      url: url || 'about:blank',
      title: 'Site skipped after failed attempts',
      text: `No usable page data was captured after ${SITE_CAPTURE_MAX_ATTEMPTS} attempts. Reason: ${reason}`,
      headings: [],
      links: [],
      images: [],
      tables: [],
      passwordFieldCount: 0,
      verificationHint: false,
      capturedAt: new Date().toISOString()
    },
    sensitive: false
  };
}

async function capturePublicPageWithRetries(
  jobId: string,
  action: string,
  requestedUrl: string,
  previousCapture: BrowserCapture,
  onProgress?: (stage: string, progress: number, message: string) => void
): Promise<{ ok: boolean; capture: BrowserCapture; url: string; host: string; attempts: number; reason?: string }> {
  let lastError = '';
  let lastUrl = requestedUrl || previousCapture.snapshot.url || '';

  for (let attempt = 1; attempt <= SITE_CAPTURE_MAX_ATTEMPTS; attempt++) {
    try {
      const nextCapture = await browserBridge.capture();
      const problem = getPageCaptureProblem(nextCapture);
      if (problem) throw new Error(problem);
      return {
        ok: true,
        capture: nextCapture,
        url: nextCapture.snapshot.url,
        host: getHost(nextCapture.snapshot.url),
        attempts: attempt
      };
    } catch (error: any) {
      lastError = String(error?.message || error || 'Unknown browser capture error');
      let currentUrl = requestedUrl;
      if (!currentUrl) {
        try {
          const status = await browserBridge.status();
          currentUrl = String(status?.url || '');
        } catch {
          // Use the last known public URL when the browser status response is also unavailable.
        }
      }
      lastUrl = currentUrl || previousCapture.snapshot.url || lastUrl;
      const host = getHost(lastUrl);
      log(jobId, 'site_retry', `Page capture failed at ${host || lastUrl || 'unknown site'} (attempt ${attempt}/${SITE_CAPTURE_MAX_ATTEMPTS}): ${lastError}`, {
        action,
        url: lastUrl,
        host,
        attempt,
        maxAttempts: SITE_CAPTURE_MAX_ATTEMPTS,
        error: lastError
      }, lastUrl);

      if (attempt < SITE_CAPTURE_MAX_ATTEMPTS) {
        onProgress?.('BROWSER_RESEARCH', 18, `Retrying ${host || 'the current public site'} · attempt ${attempt + 1}/${SITE_CAPTURE_MAX_ATTEMPTS}`);
        await waitForRetry(SITE_CAPTURE_RETRY_DELAY_MS * attempt);
        if (lastUrl && /^https?:\/\//i.test(lastUrl)) {
          try {
            await browserBridge.execute('navigate', { url: lastUrl });
          } catch (retryNavigationError: any) {
            lastError += ` · retry navigation: ${String(retryNavigationError?.message || retryNavigationError)}`;
          }
        }
      }
    }
  }

  const host = getHost(lastUrl);
  log(jobId, 'site_skipped', `Skipped ${host || lastUrl || 'the current site'} after ${SITE_CAPTURE_MAX_ATTEMPTS} unsuccessful attempts. Moving to another public source.`, {
    action,
    url: lastUrl,
    host,
    attempts: SITE_CAPTURE_MAX_ATTEMPTS,
    reason: lastError,
    nextStep: 'Do not retry this domain in this run. Choose another independent public website or source family.'
  }, lastUrl);

  return {
    ok: false,
    capture: unavailableCapture(lastUrl, lastError),
    url: lastUrl,
    host,
    attempts: SITE_CAPTURE_MAX_ATTEMPTS,
    reason: lastError
  };
}

async function createInteractionAttempt(
  ai: any,
  request: any,
  model: string,
  jobId: string,
  phase: 'initial' | 'follow-up',
  onProgress?: (stage: string, progress: number, message: string) => void
): Promise<any> {
  const controller = new AbortController();
  const startedAt = Date.now();
  const phaseLabel = phase === 'initial' ? 'first research request' : 'research follow-up';
  log(jobId, 'gemini_request_started', `Sending Gemini the ${phaseLabel} using ${model}.`, { model, phase, timeoutMs: GEMINI_REQUEST_TIMEOUT_MS });

  const heartbeat = setInterval(() => {
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    log(jobId, 'gemini_wait', `Gemini is still processing the ${phaseLabel} (${elapsedSeconds}s).`, { model, phase, elapsedSeconds });
    if (phase === 'initial') {
      onProgress?.('PLANNING', Math.min(12, 9 + Math.floor(elapsedSeconds / 15)), `Waiting for Gemini's first response · ${elapsedSeconds}s · ${model}`);
    }
  }, GEMINI_HEARTBEAT_INTERVAL_MS);

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const apiRequest = ai.interactions.create(request, {
      timeout_ms: GEMINI_REQUEST_TIMEOUT_MS,
      signal: controller.signal
    });
    const timeoutRequest = new Promise((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error(`Gemini Computer Use ${phaseLabel} timed out after ${Math.round(GEMINI_REQUEST_TIMEOUT_MS / 1000)} seconds. Check the API key, quota and network, then retry.`));
      }, GEMINI_REQUEST_TIMEOUT_MS);
    });
    const response = await Promise.race([apiRequest, timeoutRequest]);
    log(jobId, 'gemini_request_completed', `Gemini completed the ${phaseLabel}.`, {
      model,
      phase,
      durationMs: Date.now() - startedAt
    });
    return response;
  } catch (error: any) {
    log(jobId, 'gemini_request_error', `Gemini's ${phaseLabel} did not complete successfully.`, {
      model,
      phase,
      durationMs: Date.now() - startedAt,
      error: String(error?.message || error)
    });
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    clearInterval(heartbeat);
  }
}

async function createInteractionWithRetry(
  ai: any,
  request: any,
  model: string,
  jobId: string,
  onProgress?: (stage: string, progress: number, message: string) => void
): Promise<any> {
  let lastError: any;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await createInteractionAttempt(ai, request, model, jobId, 'follow-up', onProgress);
    } catch (error: any) {
      lastError = error;
      if (!isRetryableGeminiError(error) || attempt === 1) break;
      log(jobId, 'gemini_retry', `Gemini Computer Use follow-up request for ${model} returned a temporary error; retry 1/1.`, {
        model,
        attempt: attempt + 1,
        error: String(error?.message || error)
      });
      await waitForRetry(2000);
    }
  }
  throw new Error(`Gemini Computer Use follow-up request failed on "${model}" after retries: ${String(lastError?.message || lastError)}`);
}

export async function runComputerUseResearch(input: { jobId: string; niche: string; rejectedItems?: string[]; photoCount: number; videoCount: number; model?: string; maxTurns?: number; onProgress?: (stage: string, progress: number, message: string) => void; onHandoff?: (message: string) => void; onResume?: () => void }) {
  const key = storage.getCustomApiKey() || process.env.GEMINI_API_KEY || '';
  if (!key) throw new Error('Set a Gemini API key in Settings before starting research.');
  if (!browserBridge.available) throw new Error('Computer-use research requires the Windows desktop application.');
  const ai: any = new GoogleGenAI({ apiKey: key });
  const modelPreference = String(input.model || storage.getCustomModel() || 'auto').trim();
  const autoSelectModel = !modelPreference || modelPreference.toLowerCase() === 'auto';
  let availableModels: string[] = [];
  if (autoSelectModel) {
    try {
      availableModels = await listAvailableGeminiModels(key);
    } catch {
      // Auto can still use the documented compatible-model fallback order.
    }
  }
  const modelCandidates = getComputerUseModelCandidates(
    modelPreference,
    storage.getLastSuccessfulModel(),
    availableModels
  );
  if (!modelCandidates.length) {
    throw new Error(
      `Selected Gemini model "${modelPreference}" does not support this app's complete Computer Use research workflow. Choose Auto or one of the Computer Use-compatible models in Settings.`
    );
  }
  let model = modelCandidates[0];
  const maxTurns = Math.max(12, Math.min(80, input.maxTurns || 55));
  const skippedDomains = new Map<string, string>();
  let capture: BrowserCapture | null = null;
  let firstShot: string | undefined;
  const startupFailures: string[] = [];

  for (const startUrl of STARTING_PUBLIC_MARKETPLACES) {
    const host = getHost(startUrl);
    log(input.jobId, 'site_opening', `Opening public marketplace source: ${host}.`, { url: startUrl, host, source: 'startup' }, startUrl);
    let opened = false;
    for (let attempt = 1; attempt <= SITE_CAPTURE_MAX_ATTEMPTS; attempt++) {
      try {
        await browserBridge.show(startUrl);
        opened = true;
        break;
      } catch (error: any) {
        const reason = String(error?.message || error);
        startupFailures.push(`${host}: ${reason}`);
        log(input.jobId, 'site_retry', `Browser could not open ${host} (attempt ${attempt}/${SITE_CAPTURE_MAX_ATTEMPTS}): ${reason}`, {
          url: startUrl, host, attempt, maxAttempts: SITE_CAPTURE_MAX_ATTEMPTS, error: reason, action: 'show'
        }, startUrl);
        if (attempt < SITE_CAPTURE_MAX_ATTEMPTS) await waitForRetry(SITE_CAPTURE_RETRY_DELAY_MS * attempt);
      }
    }
    if (!opened) {
      skippedDomains.set(host, startupFailures[startupFailures.length - 1] || 'Browser did not acknowledge the open request.');
      log(input.jobId, 'site_skipped', `Skipped ${host} after ${SITE_CAPTURE_MAX_ATTEMPTS} browser-open attempts. Trying another marketplace.`, {
        url: startUrl, host, attempts: SITE_CAPTURE_MAX_ATTEMPTS, reason: skippedDomains.get(host)
      }, startUrl);
      continue;
    }

    const outcome = await capturePublicPageWithRetries(input.jobId, 'startup', startUrl, unavailableCapture(startUrl, 'Initial page capture has not succeeded yet.'), input.onProgress);
    if (outcome.ok) {
      capture = outcome.capture;
      firstShot = saveScreenshot(input.jobId, capture.screenshotBase64);
      log(input.jobId, 'page_visited', capture.snapshot.title || capture.snapshot.url, {
        url: capture.snapshot.url,
        screenshot: firstShot,
        initialCapture: true,
        headings: capture.snapshot.headings.slice(0, 20),
        text: capture.snapshot.text.slice(0, 16000),
        links: capture.snapshot.links.slice(0, 120),
        images: capture.snapshot.images.slice(0, 80),
        tables: capture.snapshot.tables.slice(0, 20)
      }, capture.snapshot.url);
      log(input.jobId, 'browser_preview', 'Public marketplace start page captured.', {
        screenshot: firstShot,
        pageTitle: capture.snapshot.title,
        initialCapture: true
      }, capture.snapshot.url);
      break;
    }

    if (outcome.host) skippedDomains.set(outcome.host, outcome.reason || 'Page capture failed.');
    startupFailures.push(`${host}: ${outcome.reason || 'Page capture failed.'}`);
  }

  if (!capture) {
    throw new Error(`The embedded browser could not read any starting public marketplace after ${SITE_CAPTURE_MAX_ATTEMPTS} attempts per site. ${startupFailures.slice(-6).join(' | ') || 'Check the internet connection and restart the app.'}`);
  }

  const tool: any[] = [{ type: 'computer_use', environment: 'browser', enable_prompt_injection_detection: true }];
  const prompt = [
    'You are AS-Radar-X, an autonomous commercial stock-media market research director. Your task is to discover genuinely useful, evidence-backed stock photo and video opportunities by studying PUBLIC web pages only.',
    'PRIVACY / SCOPE: Never visit, request, inspect or interact with Adobe Contributor, contributor.stock.adobe.com, account dashboards, upload pages, earnings pages, private profiles or authenticated account areas. Never ask the user to sign in. Use public customer-facing pages only. If a page requires sign-in, skip it and find a public alternative. Do not inspect cookies, browser storage, account details, downloads, sales, earnings or private assets.',
    'NICHE / OBJECTIVE: ' + input.niche,
    'ONLY USER-SUPPLIED CONTEXT: The following rejection list is a strict negative filter. Do not create ideas matching it. Do not infer personal information from it and do not send or request any other personal/account data.',
    'REJECTED DATA / EXCLUSIONS: ' + (Array.isArray(input.rejectedItems) && input.rejectedItems.length ? input.rejectedItems.map((item: string) => '- ' + String(item).slice(0, 300)).join('\n') : 'No exclusions supplied.'),
    'OUTPUT LIMIT: at most ' + input.photoCount + ' photo and ' + input.videoCount + ' video opportunities. Return fewer if evidence is weak or repetitive.',
    'RESEARCH COVERAGE STANDARD: Aim for at least 15 distinct useful public pages across at least 6 independent domains and 3 different source families. Treat these as coverage targets, not permission to invent evidence. Continue beyond the minimum while genuinely new evidence is still appearing; stop when additional pages become repetitive or the action budget is reached. If access restrictions or unavailable pages prevent coverage, disclose the shortfall.',
    'SITE FAILURE RECOVERY: AS-Radar-X automatically gives each public website up to 3 total page-capture attempts (the first attempt plus 2 retries). A retry reloads the same public URL. When a tool result says siteSkipped=true or a site_skipped event is recorded, do not revisit that hostname in this research run. Immediately choose another independent public domain, change source family when possible, and continue researching. Do not repeatedly request the same failed URL, wait indefinitely, or stop the whole research job because one website failed. Explain coverage gaps only when several independent sources are unavailable.',
    'SOURCE VISIBILITY: Every successfully captured page and every skipped website is logged by AS-Radar-X with its public URL, hostname, attempt count and failure reason. Keep your final memo consistent with those actual observations; do not claim you visited a page that returned no usable content.',
    'SOURCE FAMILY A — STOCK-MARKETPLACE SUPPLY: Search public result pages from multiple stock marketplaces such as Adobe Stock public search, Shutterstock, iStock, Freepik and Pond5. Compare multiple query variants and synonyms. Inspect visible listing titles, keyword language, result ordering, repeated visual compositions, dominant styles, model/prop clichés, format/orientation, and whether results are near-duplicates. Record visible result counts only when clearly displayed. Do not sign in, use contributor tools or access private account pages.',
    'SOURCE FAMILY B — BUYER DEMAND / COMMERCIAL USE: Find primary-source evidence from company product pages, public advertising campaigns, brand websites, agency case studies, campaign showcases, annual reports, public procurement or tender documents, industry/trade publications, and public research or technical reports. Identify who would use an asset, in what channel, and for what communication purpose.',
    'SOURCE FAMILY C — REAL-WORLD CONTEXT: Explore official government, NGO, scientific, educational, healthcare, engineering, climate, technology, manufacturing, logistics and other relevant institutional sources. Use them to identify emerging workflows, infrastructure, technologies, public priorities and durable commercial communication needs.',
    'SEARCH METHOD: Create several query families for each promising subject: core subject terms, buyer/use-case terms, commercial synonyms, technical vocabulary, visual-angle terms, and competing marketplace terms. Search demand-side and supply-side evidence separately. Follow relevant pages, related searches and pagination where useful instead of stopping at a search engine snippet.',
    'EVIDENCE CAPTURE: For every useful page record its exact public URL, page title, domain/source family, visible publication/update date if available, the specific observed fact, and why it matters commercially. Capture representative listing/title patterns and visible ordering/count information only when actually shown. Separate direct observations from your interpretation. Do not fabricate search volume, downloads, sales, revenue, market share, ranking values, stock counts, publication dates or trend percentages.',
    'COMPETITION ANALYSIS: Measure visible supply signals from multiple marketplace search pages: breadth of similar results, repeated title terms, recurring compositions, near-duplicate variations, common color/style treatments and obvious oversupplied angles. Search synonyms rather than judging one keyword alone. Distinguish a genuinely differentiated visual angle from a merely renamed subject.',
    'DEMAND ANALYSIS: Look for repeated real buyer problems, business workflows, product launches, public campaigns, educational needs, policy initiatives, services and communications that require visual explanation. A product existing does not by itself prove stock demand; explain the link to an actual buyer use case and state whether it is observed or inferred.',
    'GAP ANALYSIS: For each candidate compare independent demand evidence with marketplace supply evidence. A gap hypothesis must state (1) the buyer/use-case signal, (2) what current public listings already cover, (3) what is underrepresented or visually repetitive, (4) the distinct production angle that could fill that gap, and (5) confidence and evidence limitations. Never claim a gap from absence on one page alone.',
    'COMMERCIAL FILTER: Prioritize recurring and durable business/educational/editorial communication needs, clear buyer applications, visual clarity, production feasibility and differentiated execution. Assess evergreen vs seasonal vs short-lived relevance. Identify plausible buyer sectors without pretending to know actual purchase volume.',
    'ANTI-REPETITION: Avoid the rejection list above. Within this run, avoid overlapping ideas and near-identical visual angles. Choose materially different commercial jobs and visual treatments, not ten variations of one broad trend.',
    'SOURCE QUALITY: Prefer primary sources and independently corroborated observations. Avoid Reddit, Discord, forums and discussion boards. Avoid using trend dashboards or unsupported popularity claims as evidence. Search public pages only and respect robots, rate limits, paywalls and site restrictions.',
    'BROWSER SAFETY: Use navigation, search fields, clicks and scrolling only on public pages. Never enter passwords, personal details, email addresses, payment data, account IDs, API keys, OTPs or security answers. Never upload, download paid stock files, submit forms, make purchases or alter any account.',
    'FINAL RESEARCH MEMO: Summarize coverage by source family and domain, strongest observed demand signals, marketplace competition patterns, under-served visual angles, candidate concepts, buyer use cases, public evidence URLs, dates, what is observed vs inferred, confidence, and remaining uncertainty. Explicitly disclose if the coverage target could not be reached. Do not write final production prompts yet; the separate analyst pass creates those after evidence collection.'
  ].join('\n');
  log(input.jobId, 'model_selection', `Gemini model preference: ${modelPreference}.`, { selectedModel: modelPreference, candidates: modelCandidates });
  log(input.jobId, 'agent_instructions', 'Exact public-market research instructions sent to Gemini Computer Use.', {
    prompt,
    model,
    maxTurns,
    attemptsPerSite: SITE_CAPTURE_MAX_ATTEMPTS,
    startingPublicMarketplaces: STARTING_PUBLIC_MARKETPLACES
  });

  input.onProgress?.('PLANNING', 9, 'Sending Gemini its first marketplace research request.');
  if (isVerification(capture.snapshot)) {
    capture = await awaitUserHandoff(
      input.jobId,
      'Please sign in or complete the human verification manually in the visible browser, then press Continue.',
      capture.snapshot.url,
      input
    );
  } else {
    // Hide the live browser during autonomous work. The panel shows saved snapshots instead.
    await browserBridge.hide();
  }
  const initialInput = [
    { type: 'text', text: prompt + '\nVISIBLE START PAGE:\n' + capture.snapshot.text.slice(0, 14000) },
    ...(capture.screenshotBase64 ? [{ type: 'image', data: capture.screenshotBase64, mime_type: capture.screenshotMimeType || 'image/jpeg' }] : [])
  ];
  let interaction: any = null;
  const modelFailures: string[] = [];
  let timedOutModelFallbacks = 0;
  for (const candidateModel of modelCandidates) {
    let tryNextModel = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        interaction = await createInteractionAttempt(
          ai,
          {
            model: candidateModel,
            input: initialInput,
            tools: tool
          },
          candidateModel,
          input.jobId,
          'initial',
          input.onProgress
        );
        model = candidateModel;
        storage.saveLastSuccessfulModel(model);
        log(input.jobId, 'agent_started', `Gemini Computer Use agent started with ${model}.`, {
          niche: input.niche,
          maxTurns,
          modelPreference,
          startingUrl: capture.snapshot.url
        });
        break;
      } catch (error: any) {
        const message = String(error?.message || error);
        const requestTimedOut = /timed? ?out|timeout|abort/i.test(message);
        if (isRetryableGeminiError(error) && attempt < 1 && !requestTimedOut) {
          log(input.jobId, 'gemini_retry', `Gemini Computer Use initial request for ${candidateModel} returned a temporary error; retry 1/1.`, {
            model: candidateModel,
            attempt: attempt + 1,
            error: message
          });
          await waitForRetry(2000 * (attempt + 1));
          continue;
        }
        if (autoSelectModel && (isRetryableGeminiError(error) || isUnavailableModelError(error)) && (!requestTimedOut || timedOutModelFallbacks < 1)) {
          if (requestTimedOut) timedOutModelFallbacks++;
          modelFailures.push(`${candidateModel}: ${message}`);
          tryNextModel = true;
          break;
        }
        throw new Error(`Gemini Computer Use failed using selected model "${candidateModel}": ${message}`);
      }
    }
    if (interaction) break;
    if (!tryNextModel) break;
  }
  if (!interaction) {
    throw new Error(
      autoSelectModel
        ? `Auto could not start Gemini Computer Use on any available compatible model. ${modelFailures.slice(0, 4).join(' | ') || 'No compatible models were available.'}`
        : `Gemini Computer Use could not start using selected model "${modelCandidates[0]}".`
    );
  }
  let actions = 0, pages = 1;
  const visited = new Set<string>([capture.snapshot.url]);
  let consecutiveNoNewPages = 0;
  for (let turn = 0; turn < maxTurns; turn++) {
    const calls = (interaction.steps || []).filter((s: any) => s.type === 'function_call');
    if (!calls.length) {
      const finalText = getText(interaction) || String(interaction?.output_text || '');
      const result = { finalText, actions, pages, screenshots, turns: turn + 1, model, turnLimitReached: false };
      log(input.jobId, 'agent_finished', 'Gemini finished its evidence-gathering pass.', result, capture.snapshot.url);
      return result;
    }
    const results: any[] = [];
    let forceModelReplan = false;
    for (const call of calls) {
      const args = call.arguments || {};
      const intent = String(args.intent || `Gemini requested ${call.name}`);
      if (forceModelReplan) {
        results.push({ skipped: true, reason: 'The previous website failed after 3 attempts. Choose a new public URL on a different hostname before taking another browser action.' });
        continue;
      }
      log(input.jobId, 'agent_intent', intent, { action: call.name, safetyDecision: actionSafety(call) }, capture.snapshot.url);
      const safety = actionSafety(call);
      const prohibitedIntent = /(purchase|buy now|checkout|subscribe|upload|delete|remove account|post a comment|send a message|publish|place an order|confirm payment|change account settings|grant access|authorize an app)/i;
      if (prohibitedIntent.test(intent)) {
        results.push({ blocked: true, reason: 'Account, purchase, publishing or destructive actions are outside the research permission.' });
        log(input.jobId, 'action_blocked', 'A non-research action was blocked by local policy.', { action: call.name, intent }, capture.snapshot.url);
        continue;
      }
      if (safety.includes('blocked')) throw new Error(`Gemini safety system blocked browser action: ${call.name}.`);
      const requestedUrl = call.name === 'navigate' ? String(args.url || '') : '';
      const requestedHost = getHost(requestedUrl);
      const currentHost = getHost(capture.snapshot.url);
      const blockedHost = requestedHost && skippedDomains.has(requestedHost)
        ? requestedHost
        : (!requestedUrl && currentHost && skippedDomains.has(currentHost) ? currentHost : '');
      if (blockedHost) {
        const reason = skippedDomains.get(blockedHost) || 'This hostname was already skipped after failed attempts.';
        results.push({ skipped: true, siteSkipped: true, failedUrl: requestedUrl || capture.snapshot.url, host: blockedHost, reason: `${reason} Choose another public website.` });
        log(input.jobId, 'site_skipped', `Blocked another attempt to revisit failed hostname ${blockedHost}.`, {
          url: requestedUrl || capture.snapshot.url, host: blockedHost, alreadySkipped: true, reason
        }, requestedUrl || capture.snapshot.url);
        forceModelReplan = true;
        continue;
      }
      let safetyAcknowledgement = false;
      if (safety.includes('require_confirmation')) {
        capture = await awaitUserHandoff(
          input.jobId,
          `Gemini requests your confirmation: ${intent}`,
          capture.snapshot.url,
          input
        );
        safetyAcknowledgement = true;
      }
      if (isVerification(capture.snapshot)) {
        capture = await awaitUserHandoff(
          input.jobId,
          'Please sign in or complete the human verification manually in the visible browser, then press Continue.',
          capture.snapshot.url,
          input
        );
        results.push({ skipped: true, reason: 'The user completed sign-in or human verification. Re-evaluate the current page and choose a fresh action.' });
        continue;
      }
      const allowed = ['click','double_click','triple_click','middle_click','right_click','move','type','navigate','scroll','wait','go_back','go_forward','press_key','hotkey','take_screenshot','open_app','type_text_at'];
      if (!allowed.includes(call.name)) { results.push({ skipped: true, reason: `Unsupported or disallowed action: ${call.name}` }); continue; }
      if ((call.name === 'type' || call.name === 'type_text_at') && /password|one.time.code|otp|verification code|security answer/i.test(String(args.text || ''))) { results.push({ skipped: true, reason: 'Credential-like typing blocked; user must enter it manually.' }); continue; }
      let result: any = { ok: true };
      try {
        if (call.name === 'navigate') result = await browserBridge.execute('navigate', { url: args.url });
        else if (['click','double_click','triple_click','middle_click','right_click','move'].includes(call.name)) result = await browserBridge.execute('pointer', { action: call.name, x: args.x, y: args.y });
        else if (call.name === 'type' || call.name === 'type_text_at') {
          if (args.x !== undefined && args.y !== undefined) await browserBridge.execute('pointer', { action: 'click', x: args.x, y: args.y });
          result = await browserBridge.execute('type', { text: String(args.text || '').slice(0, 1000), clear: args.clear_before_typing === true });
          if (args.press_enter) await browserBridge.execute('keypress', { key: 'enter' });
        }
        else if (call.name === 'scroll') result = await browserBridge.execute('scroll', { x: args.x, y: args.y, direction: args.direction || 'down', magnitude: args.magnitude_in_pixels || args.magnitude || 300 });
        else if (call.name === 'wait') result = await browserBridge.execute('wait', { ms: Number(args.seconds || 1) * 1000 });
        else if (call.name === 'go_back') result = await browserBridge.execute('back', {});
        else if (call.name === 'go_forward') result = await browserBridge.execute('forward', {});
        else if (call.name === 'press_key') result = await browserBridge.execute('keypress', { key: args.key });
        else if (call.name === 'hotkey') result = await browserBridge.execute('hotkey', { keys: args.keys || [] });
        else if (call.name === 'take_screenshot') result = { requested: true };
        else if (call.name === 'open_app') result = { opened: true };
      } catch (error: any) { result = { error: error.message || String(error) }; }
      actions++;
      const captureOutcome = await capturePublicPageWithRetries(
        input.jobId,
        call.name,
        requestedUrl,
        capture,
        input.onProgress
      );
      if (!captureOutcome.ok) {
        const failedHost = captureOutcome.host || requestedHost || currentHost;
        if (failedHost) skippedDomains.set(failedHost, captureOutcome.reason || 'Page capture failed after retries.');
        capture = captureOutcome.capture;
        const failedResult = {
          ...(result && typeof result === 'object' ? result : { result }),
          ...(safetyAcknowledgement ? { safety_acknowledgement: true } : {}),
          siteSkipped: true,
          failedUrl: captureOutcome.url,
          host: failedHost,
          retryAttempts: captureOutcome.attempts,
          error: captureOutcome.reason,
          nextStep: 'Do not revisit this hostname. Continue with another independent public website or source family.'
        };
        results.push(failedResult);
        consecutiveNoNewPages++;
        forceModelReplan = true;
        log(input.jobId, 'browser_action', `${call.name}: ${intent} · site skipped after retries`, {
          action: call.name, result: failedResult, screenshot: undefined, pageTitle: capture.snapshot.title
        }, captureOutcome.url);
        input.onProgress?.('BROWSER_RESEARCH', Math.min(78, 12 + Math.round((turn / maxTurns) * 65)), `Skipping ${failedHost || 'unavailable site'} after 3 failed attempts · trying another source`);
        continue;
      }

      capture = captureOutcome.capture;
      const screenshotPath = saveScreenshot(input.jobId, capture.screenshotBase64); if (screenshotPath) screenshots++;
      results.push(safetyAcknowledgement ? { ...result, safety_acknowledgement: true } : result);
      if (capture.snapshot.url && !visited.has(capture.snapshot.url)) {
        visited.add(capture.snapshot.url); pages++; consecutiveNoNewPages = 0;
        log(input.jobId, 'page_visited', capture.snapshot.title || capture.snapshot.url, { url: capture.snapshot.url, screenshot: screenshotPath, headings: capture.snapshot.headings.slice(0, 20), text: capture.snapshot.text.slice(0, 16000), links: capture.snapshot.links.slice(0, 120), images: capture.snapshot.images.slice(0, 80), tables: capture.snapshot.tables.slice(0, 20) }, capture.snapshot.url);
      } else { consecutiveNoNewPages++; }
      log(input.jobId, 'browser_action', `${call.name}: ${intent}`, { action: call.name, result, screenshot: screenshotPath, pageTitle: capture.snapshot.title }, capture.snapshot.url);
      input.onProgress?.('BROWSER_RESEARCH', Math.min(78, 12 + Math.round((turn / maxTurns) * 65)), `Researching ${capture.snapshot.title || capture.snapshot.url} · ${pages} pages · ${actions} actions`);
      if (isVerification(capture.snapshot)) {
        capture = await awaitUserHandoff(
          input.jobId,
          'A sign-in or verification page appeared. Complete it manually, then press Continue.',
          capture.snapshot.url,
          input
        );
      }
    }
    const functionResults = calls.map((call: any, index: number) => ({ type: 'function_result', name: call.name, call_id: call.id || call.call_id, result: [{ type: 'text', text: JSON.stringify({ ...results[index], url: capture.snapshot.url, title: capture.snapshot.title, visibleText: capture.snapshot.text.slice(0, 15000), headings: capture.snapshot.headings.slice(0, 30), links: capture.snapshot.links.slice(0, 80), images: capture.snapshot.images.slice(0, 50), tables: capture.snapshot.tables.slice(0, 20) }) }, ...(capture.screenshotBase64 ? [{ type: 'image', data: capture.screenshotBase64, mime_type: capture.screenshotMimeType || 'image/jpeg' }] : [])] }));
    interaction = await createInteractionWithRetry(
      ai,
      { model, previous_interaction_id: interaction.id, input: functionResults, tools: tool },
      model,
      input.jobId,
      input.onProgress
    );
    if (consecutiveNoNewPages >= 8 && turn > 15) log(input.jobId, 'coverage_note', 'Gemini has revisited pages without discovering new URLs; it may choose to expand to new sources or conclude coverage.', { turn, pages, actions }, capture.snapshot.url);
  }
  const finalText = getText(interaction) || String(interaction?.output_text || '');
  log(input.jobId, 'turn_limit', 'Research action limit reached; all captured observations are preserved for the final analyst.', { actions, pages, screenshots, finalText }, capture.snapshot.url);
  return { finalText, actions, pages, screenshots, turns: maxTurns, model, turnLimitReached: true };
}