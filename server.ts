import 'dotenv/config';
import * as archiver from 'archiver';
import express, { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { researchCoordinator } from './server/researcher.js';
import { storage } from './server/storage/database.js';
import { applyProxySettings, testProxyConnection } from './server/proxy.js';
import { listAvailableGeminiModels } from './server/gemini/models.js';
import { resumeComputerUse } from './server/agent/computerUseResearch.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT !== undefined ? parseInt(process.env.PORT, 10) : 3000;

function publishProxySettings(config = storage.getProxySettings()) {
  if (typeof process.send === 'function') {
    try { process.send({ type: 'as-radar-proxy-config', config }); } catch { /* no Electron parent in web deployment */ }
  }
}

try {
  applyProxySettings(storage.getProxySettings());
} catch (err) {
  console.error('Saved proxy settings could not be applied; starting with proxy disabled.', err);
  storage.saveProxySettings({ enabled: false });
  applyProxySettings(storage.getProxySettings());
}
publishProxySettings();

app.use(express.json({ limit: '35mb' }));
app.use(express.urlencoded({ extended: true, limit: '35mb' }));

// API Endpoints

// 1. Research Execution
app.post('/api/research', (req: Request, res: Response) => {
  try {
    const photoCount = req.body?.photo_count === undefined ? 5 : Number(req.body.photo_count);
    const videoCount = req.body?.video_count === undefined ? 3 : Number(req.body.video_count);

    if (!Number.isInteger(photoCount) || !Number.isInteger(videoCount)) {
      res.status(400).json({ error: 'Photo and video counts must be integers.' });
      return;
    }
    if (photoCount < 0 || videoCount < 0 || photoCount > 10 || videoCount > 10) {
      res.status(400).json({ error: 'Photo and video counts must each be between 0 and 10.' });
      return;
    }
    if (photoCount === 0 && videoCount === 0) {
      res.status(400).json({ error: 'Please specify at least one photo or video opportunity.' });
      return;
    }

    const niche = typeof req.body?.niche === 'string' ? req.body.niche.trim().slice(0, 3000) : '';
    const titleInstructions = typeof req.body?.title_instructions === 'string' ? req.body.title_instructions.trim().slice(0, 1200) : '';
    const tagCount = req.body?.tag_count === undefined ? 25 : Number(req.body.tag_count);
    if (!Number.isInteger(tagCount) || tagCount < 1 || tagCount > 50) {
      res.status(400).json({ error: 'Tag count must be between 1 and 50.' });
      return;
    }
    const jobId = researchCoordinator.createJob(photoCount, videoCount, { niche, titleInstructions, tagCount });
    res.json({ job_id: jobId, status: 'RUNNING', photo_count: photoCount, video_count: videoCount, tag_count: tagCount });
  } catch (err: any) {
    console.error('Error starting research:', err);
    res.status(500).json({ error: err.message || 'Failed to initialize research job.' });
  }
});

// 2. Research Job Status
app.get('/api/research/status/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const state = researchCoordinator.getJobState(jobId);
  if (!state) {
    res.status(404).json({ error: `Research job '${jobId}' not found.` });
    return;
  }

  res.json({
    job_id: state.jobId,
    status: state.status,
    stage: state.stage,
    progress: state.progress,
    message: state.message,
    error: state.error
  });
});

// Autonomous research audit trail and portfolio cache.
app.get('/api/research/events/:jobId', (req: Request, res: Response) => {
  const after = Math.max(0, Number(req.query.after) || 0);
  res.json({ job_id: req.params.jobId, events: storage.getResearchEvents(req.params.jobId, after) });
});

app.post('/api/research/resume/:jobId', (req: Request, res: Response) => {
  const resumed = resumeComputerUse(req.params.jobId);
  res.json({ success: resumed, message: resumed ? 'Research agent resumed.' : 'No pending human handoff for this job.' });
});

app.get('/api/research/screenshots/:jobId/:file', (req: Request, res: Response) => {
  if (process.env.AS_RADAR_LOCAL_ONLY === 'true') {
    const remote = req.ip || req.socket.remoteAddress || '';
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
      res.status(403).end();
      return;
    }
  }
  const jobId = String(req.params.jobId || '');
  const file = String(req.params.file || '');
  if (!/^job_[A-Za-z0-9_-]{4,80}$/.test(jobId) || !/^[0-9]{10,16}-[a-f0-9]{6}\.jpg$/.test(file)) {
    res.status(400).json({ error: 'Invalid screenshot reference.' });
    return;
  }
  const screenshotRoot = path.resolve(process.env.AS_RADAR_DATA_DIR || path.resolve(process.cwd(), 'data'), 'research-screenshots');
  const target = path.resolve(screenshotRoot, jobId, file);
  if (!target.startsWith(screenshotRoot + path.sep) || !fs.existsSync(target)) {
    res.status(404).end();
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.type('jpg').sendFile(target);
});

app.get('/api/portfolio/assets', (_req: Request, res: Response) => {
  const assets = storage.getPortfolioAssets();
  res.json({ assets, count: assets.length });
});

// 3. Get Report
app.get('/api/report/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const report = storage.getReport(jobId);
  if (!report) {
    res.status(404).json({ error: `Report for job '${jobId}' not found.` });
    return;
  }
  res.json(report);
});

// 4. History
app.get('/api/history', (_req: Request, res: Response) => {
  const history = storage.getHistory();
  res.json({ history });
});

app.delete('/api/history', (_req: Request, res: Response) => {
  try {
    storage.clearAllHistory();
    res.json({ success: true, message: 'All content history cleared successfully.', history: [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to clear history' });
  }
});

app.post('/api/history/clear', (_req: Request, res: Response) => {
  try {
    storage.clearAllHistory();
    res.json({ success: true, message: 'All content history cleared successfully.', history: [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to clear history' });
  }
});

// 5. Instructions
app.get('/api/instruction', (_req: Request, res: Response) => {
  const instructions = storage.getInstructions();
  res.json({ instructions });
});

app.put('/api/instruction', (req: Request, res: Response) => {
  const text = typeof req.body.instructions === 'string' ? req.body.instructions : '';
  storage.saveInstructions(text);
  res.json({ success: true, instructions: text.slice(0, 500) });
});

app.delete('/api/instruction', (_req: Request, res: Response) => {
  storage.clearInstructions();
  res.json({ success: true, instructions: '' });
});

// 6. Rejected Content (Adobe Not Accepted Content)
app.get('/api/rejected-content', (_req: Request, res: Response) => {
  const items = storage.getRejectedContent();
  res.json({ items });
});

app.put('/api/rejected-content', (req: Request, res: Response) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  storage.saveRejectedContent(items);
  res.json({ success: true, items: storage.getRejectedContent() });
});

app.delete('/api/rejected-content/:index', (req: Request, res: Response) => {
  const index = parseInt(req.params.index, 10);
  if (isNaN(index)) {
    res.status(400).json({ error: 'Invalid rejection index' });
    return;
  }
  storage.deleteRejectedContent(index);
  res.json({ success: true, items: storage.getRejectedContent() });
});

// 6.1 PDF Document & Directives
app.get('/api/pdf-instruction', (_req: Request, res: Response) => {
  const doc = storage.getPdfDocument();
  res.json({
    hasPdf: !!doc && !!doc.base64Data,
    fileName: doc?.fileName || '',
    fileSize: doc?.fileSize || 0,
    instructions: doc?.instructions || '',
    uploadedAt: doc?.uploadedAt || ''
  });
});

app.post('/api/pdf-instruction', (req: Request, res: Response) => {
  try {
    const { fileName, fileSize, mimeType, base64Data, instructions } = req.body || {};
    if (!base64Data || typeof base64Data !== 'string') {
      res.status(400).json({ success: false, error: 'Valid PDF document data is required.' });
      return;
    }
    const cleanBase64 = base64Data.replace(/^data:application\/pdf;base64,/i, '').trim();
    storage.savePdfDocument({
      fileName: (fileName || 'document.pdf').trim(),
      fileSize: Number(fileSize) || 0,
      mimeType: mimeType || 'application/pdf',
      base64Data: cleanBase64,
      instructions: typeof instructions === 'string' ? instructions.slice(0, 3000) : '',
      uploadedAt: new Date().toISOString()
    });
    const saved = storage.getPdfDocument();
    res.json({
      success: true,
      hasPdf: true,
      fileName: saved?.fileName,
      fileSize: saved?.fileSize,
      instructions: saved?.instructions,
      uploadedAt: saved?.uploadedAt
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed saving PDF document' });
  }
});

app.delete('/api/pdf-instruction', (_req: Request, res: Response) => {
  storage.clearPdfDocument();
  res.json({ success: true, hasPdf: false, instructions: '' });
});

// 7. Raw Evidence for Research Job
app.get('/api/evidence/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const items = storage.getRawEvidence(jobId);
  res.json({ job_id: jobId, evidence: items, count: items.length });
});

// Legacy Reddit/Discord settings are intentionally no longer active in AS-Radar-X's research pipeline.

// Proxy settings (HTTP or V2Ray SOCKS5)
app.get('/api/proxy/config', (_req: Request, res: Response) => {
  const config = storage.getProxySettings();
  const { password, ...safeConfig } = config;
  res.json({ ...safeConfig, hasPassword: !!password });
});

app.post('/api/proxy/config', (req: Request, res: Response) => {
  try {
    const patch = req.body || {};
    const current = storage.getProxySettings();
    const candidate = {
      ...current,
      ...patch,
      password: patch.password ? String(patch.password) : current.password
    };
    // Validate and apply before persisting so a typo cannot poison the next app startup.
    applyProxySettings(candidate);
    const config = storage.saveProxySettings(patch);
    publishProxySettings(config);
    const { password, ...safeConfig } = config;
    res.json({ success: true, config: { ...safeConfig, hasPassword: !!password } });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Failed saving proxy settings.' });
  }
});

app.post('/api/proxy/test', async (req: Request, res: Response) => {
  try {
    const current = storage.getProxySettings();
    const candidate = {
      ...current,
      ...(req.body || {}),
      password: req.body?.password ? String(req.body.password) : current.password
    };
    const result = await testProxyConnection(candidate);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message || 'Proxy connection test failed.' });
  }
});

// Local backend health (used by the desktop launcher)
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ success: true, app: 'AS-Radar-X', online: true });
});

// 12. Gemini Model and API Key Configuration
app.get('/api/gemini/config', (_req: Request, res: Response) => {
  const customKey = storage.getCustomApiKey();
  const envKey = process.env.GEMINI_API_KEY || '';
  const activeKey = customKey || envKey;
  const activeModel = storage.getCustomModel();

  res.json({
    hasCustomKey: !!customKey,
    hasEnvKey: !!envKey,
    hasKey: !!activeKey,
    activeKeyMasked: activeKey ? `${activeKey.slice(0, 6)}...${activeKey.slice(-4)}` : 'NOT_SET',
    activeModel,
    availableModels: [...new Set(['auto', activeModel, storage.getLastSuccessfulModel()].filter(Boolean))],
    lastSuccessfulModel: storage.getLastSuccessfulModel()
  });
});

app.post('/api/gemini/models', async (req: Request, res: Response) => {
  try {
    const apiKey = String(req.body?.apiKey || storage.getCustomApiKey() || process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      res.status(400).json({ success: false, error: 'Add a Gemini API key before refreshing the model list.' });
      return;
    }
    const models = await listAvailableGeminiModels(apiKey);
    if (!models.length) {
      res.status(502).json({ success: false, error: 'Google returned no Gemini models supporting generateContent for this API key.' });
      return;
    }
    res.json({ success: true, models });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message || 'Unable to fetch Gemini models from Google.' });
  }
});

app.post('/api/gemini/config', (req: Request, res: Response) => {
  const { apiKey, model } = req.body;
  if (apiKey !== undefined) {
    storage.saveCustomApiKey(apiKey);
  }
  if (model !== undefined) {
    storage.saveCustomModel(model);
  }

  const customKey = storage.getCustomApiKey();
  const envKey = process.env.GEMINI_API_KEY || '';
  const activeKey = customKey || envKey;

  res.json({
    success: true,
    hasCustomKey: !!customKey,
    hasKey: !!activeKey,
    activeKeyMasked: activeKey ? `${activeKey.slice(0, 6)}...${activeKey.slice(-4)}` : 'NOT_SET',
    activeModel: storage.getCustomModel()
  });
});

app.post('/api/gemini/test', async (req: Request, res: Response) => {
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const apiKey = String(req.body?.apiKey || storage.getCustomApiKey() || process.env.GEMINI_API_KEY || '').trim();
    const rawModel = String(req.body?.model || storage.getCustomModel() || process.env.GEMINI_MODEL || 'auto').trim();
    if (!apiKey) {
      res.status(400).json({ success: false, error: 'No Gemini API key available to test.' });
      return;
    }
    const ai = new GoogleGenAI({ apiKey });
    let candidates: string[];
    if (rawModel.toLowerCase() === 'auto') {
      try { candidates = await listAvailableGeminiModels(apiKey); } catch { candidates = []; }
      candidates = [...new Set([storage.getLastSuccessfulModel(), ...candidates.slice(0, 12), 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-2.0-flash'].filter((model): model is string => !!model))];
    } else {
      candidates = [rawModel.replace(/^models\//, '')];
    }
    const errors: string[] = [];
    for (const testModel of candidates) {
      const started = Date.now();
      try {
        const response = await ai.models.generateContent({
          model: testModel,
          contents: 'Respond with exactly: OK_AS_RADAR_X_ONLINE',
          config: { temperature: 0.1 }
        });
        const durationMs = Date.now() - started;
        storage.saveLastSuccessfulModel(testModel);
        res.json({ success: true, model: rawModel.toLowerCase() === 'auto' ? `auto → ${testModel}` : testModel, resolvedModel: testModel, durationMs, response: response.text?.trim() });
        return;
      } catch (err: any) {
        errors.push(`${testModel}: ${err.message || 'request failed'}`);
        if (rawModel.toLowerCase() !== 'auto') break;
      }
    }
    res.status(502).json({
      success: false,
      error: rawModel.toLowerCase() === 'auto'
        ? `Auto could not find a working model. Tried ${errors.length} model(s). ${errors.slice(0, 3).join(' | ')}`
        : errors[0] || 'Gemini connectivity test failed.'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Gemini connectivity test failed.' });
  }
});

// Vite or Static Serving Setup
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  const host = process.env.AS_RADAR_LOCAL_ONLY === 'true' ? '127.0.0.1' : '0.0.0.0';
  const listener = app.listen(PORT, host, () => {
    const address = listener.address();
    const actualPort = typeof address === 'object' && address ? address.port : PORT;
    console.log(`AS-Radar-X server running on http://${host}:${actualPort}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
