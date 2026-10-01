import 'dotenv/config';
import * as archiver from 'archiver';
import express, { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { researchCoordinator } from './server/researcher.js';
import { storage } from './server/storage/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

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

    const jobId = researchCoordinator.createJob(photoCount, videoCount);
    res.json({ job_id: jobId, status: 'RUNNING', photo_count: photoCount, video_count: videoCount });
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

// 7. Raw Evidence for Research Job
app.get('/api/evidence/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const items = storage.getRawEvidence(jobId);
  res.json({ job_id: jobId, evidence: items, count: items.length });
});

// 8. Live Sources Probe and Status
let cachedProbe: any = null;
let lastProbeTime = 0;
const PROBE_CACHE_TTL = 3 * 60 * 1000; // 3 minutes cache

async function runSourcesProbe(force: boolean = false) {
  const now = Date.now();
  if (!force && cachedProbe && now - lastProbeTime < PROBE_CACHE_TTL) {
    return cachedProbe;
  }

  const { ShutterstockCollector } = await import('./server/collectors/shutterstock.js');
  const { AdobeStockCollector } = await import('./server/collectors/adobeStock.js');
  const { Pond5Collector } = await import('./server/collectors/pond5.js');

  const shutterCollector = new ShutterstockCollector();
  const adobeCollector = new AdobeStockCollector();
  const pondCollector = new Pond5Collector();
  const testTopics = ['commercial enterprise', 'sustainable energy', 'modern healthcare'];

  const startTime = Date.now();
  const [shutterResults, adobeResults, pondResults] = await Promise.all([
    shutterCollector.collect(testTopics),
    adobeCollector.collect(testTopics),
    pondCollector.collect(testTopics)
  ]);
  const duration = `${Math.round((Date.now() - startTime) / 1000)}s`;

  const mapResults = (name: string, results: any[]) => {
    const isAvail = results.some((r) => r.status === 'AVAILABLE');
    const isBlocked = results.every((r) => r.status === 'BLOCKED');
    const overall = isAvail ? 'AVAILABLE' : isBlocked ? 'BLOCKED' : results[0]?.status || 'UNAVAILABLE';
    const evidence = results.flatMap((r) => r.evidence || []);

    return {
      source: name,
      overall,
      endpoints: results.map((r) => ({
        subSource: r.subSource,
        url: r.url,
        status: r.status,
        evidenceCount: (r.evidence || []).length,
        notes: r.notes || r.error || undefined
      })),
      evidenceCount: evidence.length,
      evidenceSample: evidence.slice(0, 5)
    };
  };

  const responseData = {
    probedAt: new Date().toISOString(),
    duration,
    sources: {
      'Adobe Stock': mapResults('Adobe Stock', adobeResults),
      Shutterstock: mapResults('Shutterstock', shutterResults),
      Pond5: mapResults('Pond5', pondResults)
    },
    totalEvidenceCount:
      adobeResults.flatMap((r) => r.evidence).length +
      shutterResults.flatMap((r) => r.evidence).length +
      pondResults.flatMap((r) => r.evidence).length
  };

  cachedProbe = responseData;
  lastProbeTime = now;
  return responseData;
}

// Quick status overview
app.get('/api/sources/status', async (_req: Request, res: Response) => {
  try {
    const probe = await runSourcesProbe(false);
    res.json({
      probedAt: probe.probedAt,
      sources: {
        'Adobe Stock': {
          overall: probe.sources['Adobe Stock'].overall,
          evidenceCount: probe.sources['Adobe Stock'].evidenceCount,
          endpoints: probe.sources['Adobe Stock'].endpoints
        },
        Shutterstock: {
          overall: probe.sources['Shutterstock'].overall,
          evidenceCount: probe.sources['Shutterstock'].evidenceCount,
          endpoints: probe.sources['Shutterstock'].endpoints
        },
        Pond5: {
          overall: probe.sources['Pond5'].overall,
          evidenceCount: probe.sources['Pond5'].evidenceCount,
          endpoints: probe.sources['Pond5'].endpoints
        }
      },
      totalEvidenceCount: probe.totalEvidenceCount
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to check sources status' });
  }
});

// Full active probe
app.post('/api/sources/probe', async (_req: Request, res: Response) => {
  try {
    const probe = await runSourcesProbe(true);
    res.json(probe);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Probe execution failed' });
  }
});

app.get('/api/sources/probe', async (req: Request, res: Response) => {
  try {
    const force = req.query.force === 'true';
    const probe = await runSourcesProbe(force);
    res.json(probe);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Probe execution failed' });
  }
});

// 9. Gemini Model and API Key Configuration
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
    availableModels: [
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.1-pro-preview'
    ]
  });
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
    const customKey = storage.getCustomApiKey();
    const apiKey = (req.body?.apiKey || customKey || process.env.GEMINI_API_KEY || '').trim();
    const model = (req.body?.model || storage.getCustomModel() || process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();

    if (!apiKey) {
      res.status(400).json({ success: false, error: 'No Gemini API key available to test.' });
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    const startTime = Date.now();
    const testResponse = await ai.models.generateContent({
      model,
      contents: 'Respond with exactly: OK_AS_RADAR_X_ONLINE',
      config: { temperature: 0.1 }
    });
    const durationMs = Date.now() - startTime;

    res.json({
      success: true,
      model,
      durationMs,
      response: testResponse.text?.trim()
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Gemini connectivity test failed.'
    });
  }
});

// 10. Download Complete Project Source Code as ZIP
app.get('/api/download-zip', (_req: Request, res: Response) => {
  try {
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="as-radar-x-project.zip"');

    archive.on('error', (err: any) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed creating project archive' });
      }
    });

    archive.pipe(res);

    const rootDir = process.cwd();

    // Include source code & configuration directories
    archive.directory(path.join(rootDir, 'src'), 'src');
    archive.directory(path.join(rootDir, 'server'), 'server');

    // Include root configuration and setup files
    const rootFiles = [
      'package.json',
      'tsconfig.json',
      'vite.config.ts',
      'server.ts',
      'index.html',
      'README.md',
      '.env.example',
      '.gitignore',
      'metadata.json'
    ];

    for (const f of rootFiles) {
      const fullPath = path.join(rootDir, f);
      if (fs.existsSync(fullPath)) {
        archive.file(fullPath, { name: f });
      }
    }

    archive.finalize();
  } catch (err: any) {
    console.error('Download project zip error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal error packaging project' });
    }
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AS-Radar-X server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
