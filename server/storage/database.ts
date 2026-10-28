import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  DiscordConfig,
  HistoryRecord,
  PdfDocumentConfig,
  RawEvidence,
  RedditConfig,
  ResearchReport
} from '../types.js';

const DATA_DIR = path.resolve(process.env.AS_RADAR_DATA_DIR || path.resolve(process.cwd(), 'data'));
const DB_PATH = path.join(DATA_DIR, 'as_radar_x.sqlite');

export interface ProxySettings {
  enabled: boolean;
  protocol: 'http' | 'socks5';
  host: string;
  port: number;
  username: string;
  password: string;
}

const DEFAULT_PROXY_SETTINGS: ProxySettings = {
  enabled: false,
  protocol: 'http',
  host: '127.0.0.1',
  port: 10809,
  username: '',
  password: ''
};

const DEFAULT_SUBREDDITS = [
  'StockPhotography',
  'AdobeStock',
  'Shutterstock',
  'graphic_design',
  'VideoEditing',
  'editors',
  'Midjourney',
  'blender',
  'vfx'
];

const DEFAULT_REDDIT_CONFIG: RedditConfig = {
  clientId: '',
  clientSecret: '',
  userAgent: 'AS-Radar-X/2.0 (by /u/saradagreats)',
  subreddits: [...DEFAULT_SUBREDDITS],
  timeframe: '24h',
  collectPosts: true,
  collectComments: true,
  connected: false,
  lastCollectedAt: undefined,
  collectedCount: 0
};

const DEFAULT_DISCORD_CONFIG: DiscordConfig = {
  botToken: '',
  guilds: [],
  timeframe: '24h',
  collectMessages: true,
  collectThreads: true,
  connected: false,
  lastCollectedAt: undefined,
  collectedCount: 0
};

class StorageManager {
  private db: DatabaseSync | null = null;
  private memoryFallback: {
    reports: Map<string, ResearchReport>;
    instructions: string;
    rejectedContent: string[];
    evidence: Map<string, RawEvidence[]>;
    redditConfig: RedditConfig;
    discordConfig: DiscordConfig;
    platformDataEnabled: boolean;
    pdfDocument: PdfDocumentConfig | null;
    proxySettings: ProxySettings;
  } = {
    reports: new Map(),
    instructions: '',
    rejectedContent: [],
    evidence: new Map(),
    redditConfig: { ...DEFAULT_REDDIT_CONFIG },
    discordConfig: { ...DEFAULT_DISCORD_CONFIG },
    platformDataEnabled: true,
    pdfDocument: null,
    proxySettings: { ...DEFAULT_PROXY_SETTINGS }
  };

  constructor() {
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      this.db = new DatabaseSync(DB_PATH);
      this.runMigrations();
      this.loadSettings();
    } catch (err) {
      console.warn('SQLite init warning, running with fallback file storage:', err);
      this.loadFallbackFiles();
    }
  }

  private runMigrations() {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reports (
        job_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL,
        photo_count INTEGER NOT NULL,
        video_count INTEGER NOT NULL,
        duration TEXT,
        sources_processed TEXT,
        source_status TEXT,
        report_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS evidence_store (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        source TEXT NOT NULL,
        url TEXT NOT NULL,
        evidence_type TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        raw_title TEXT NOT NULL,
        raw_keywords TEXT,
        metadata_json TEXT
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rejected_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_text TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS opportunity_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        concept TEXT,
        created_at TEXT NOT NULL
      );
    `);
  }

  private loadSettings() {
    try {
      this.memoryFallback.instructions = this.getInstructions();
      this.memoryFallback.rejectedContent = this.getRejectedContent();
      this.memoryFallback.redditConfig = this.getRedditConfig();
      this.memoryFallback.discordConfig = this.getDiscordConfig();
      this.memoryFallback.platformDataEnabled = this.getPlatformDataEnabled();
      this.memoryFallback.pdfDocument = this.getPdfDocument();
      this.memoryFallback.proxySettings = this.getProxySettings();
    } catch (e) {
      // ignore
    }
  }

  private loadFallbackFiles() {
    try {
      const reportsFile = path.join(DATA_DIR, 'reports_fallback.json');
      if (fs.existsSync(reportsFile)) {
        const raw = fs.readFileSync(reportsFile, 'utf8');
        const list: ResearchReport[] = JSON.parse(raw);
        for (const r of list) {
          this.memoryFallback.reports.set(r.job_id, r);
        }
      }

      const settingsFile = path.join(DATA_DIR, 'settings_fallback.json');
      if (fs.existsSync(settingsFile)) {
        const parsed = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
        this.memoryFallback.instructions = parsed.instructions || '';
        this.memoryFallback.rejectedContent = parsed.rejectedContent || [];
        if (parsed.redditConfig) this.memoryFallback.redditConfig = { ...DEFAULT_REDDIT_CONFIG, ...parsed.redditConfig };
        if (parsed.discordConfig) this.memoryFallback.discordConfig = { ...DEFAULT_DISCORD_CONFIG, ...parsed.discordConfig };
        if (typeof parsed.platformDataEnabled === 'boolean') this.memoryFallback.platformDataEnabled = parsed.platformDataEnabled;
        if (parsed.pdfDocument) this.memoryFallback.pdfDocument = parsed.pdfDocument;
        if (parsed.proxySettings) this.memoryFallback.proxySettings = { ...DEFAULT_PROXY_SETTINGS, ...parsed.proxySettings };
      }
    } catch (e) {
      console.error('Error loading fallback storage files:', e);
    }
  }

  private persistFallback() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const reportsFile = path.join(DATA_DIR, 'reports_fallback.json');
      const list = Array.from(this.memoryFallback.reports.values());
      fs.writeFileSync(reportsFile, JSON.stringify(list, null, 2), 'utf8');

      const settingsFile = path.join(DATA_DIR, 'settings_fallback.json');
      fs.writeFileSync(
        settingsFile,
        JSON.stringify(
          {
            instructions: this.memoryFallback.instructions,
            rejectedContent: this.memoryFallback.rejectedContent,
            redditConfig: this.memoryFallback.redditConfig,
            discordConfig: this.memoryFallback.discordConfig,
            platformDataEnabled: this.memoryFallback.platformDataEnabled,
            pdfDocument: this.memoryFallback.pdfDocument,
            proxySettings: this.memoryFallback.proxySettings
          },
          null,
          2
        ),
        'utf8'
      );
    } catch (e) {
      console.error('Failed writing fallback files:', e);
    }
  }

  public saveReport(report: ResearchReport) {
    this.memoryFallback.reports.set(report.job_id, report);
    this.persistFallback();

    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO reports (
            job_id, created_at, date, status, photo_count, video_count,
            duration, sources_processed, source_status, report_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          report.job_id,
          report.created_at,
          report.date,
          report.status,
          report.photos.length,
          report.videos.length,
          report.duration,
          JSON.stringify(report.sources_processed),
          JSON.stringify(report.source_status),
          JSON.stringify(report)
        );

        // Record opportunities for history protection
        const oppStmt = this.db.prepare(`
          INSERT INTO opportunity_history (job_id, type, title, concept, created_at)
          VALUES (?, ?, ?, ?, ?)
        `);

        for (const p of report.photos) {
          oppStmt.run(
            report.job_id,
            'photo',
            p.title || 'Untitled Photo',
            p.concept || p.description || '',
            report.created_at || new Date().toISOString()
          );
        }
        for (const v of report.videos) {
          oppStmt.run(
            report.job_id,
            'video',
            v.title || 'Untitled Video',
            v.concept || v.description || '',
            report.created_at || new Date().toISOString()
          );
        }
      } catch (err) {
        console.error('SQLite saveReport error:', err);
      }
    }
  }

  public getReport(jobId: string): ResearchReport | null {
    if (this.db) {
      try {
        const stmt = this.db.prepare('SELECT report_json FROM reports WHERE job_id = ?');
        const row = stmt.get(jobId) as { report_json: string } | undefined;
        if (row && row.report_json) {
          return JSON.parse(row.report_json);
        }
      } catch (err) {
        console.error('SQLite getReport error:', err);
      }
    }
    return this.memoryFallback.reports.get(jobId) || null;
  }

  public getHistory(): HistoryRecord[] {
    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          SELECT job_id, date, photo_count, video_count, status, duration, report_json
          FROM reports
          ORDER BY created_at DESC
          LIMIT 50
        `);
        const rows = stmt.all() as Array<{
          job_id: string;
          date: string;
          photo_count: number;
          video_count: number;
          status: string;
          duration: string;
          report_json: string;
        }>;

        return rows.map((r) => {
          let majorTopics: string[] = [];
          let sourceStatus = {};
          try {
            const parsed = JSON.parse(r.report_json);
            sourceStatus = parsed.source_status || {};
            const photoTitles = (parsed.photos || []).map((p: any) => p.title);
            const videoTitles = (parsed.videos || []).map((v: any) => v.title);
            majorTopics = [...photoTitles, ...videoTitles].slice(0, 3);
          } catch {
            // ignore
          }

          return {
            job_id: r.job_id,
            date: r.date,
            photo_count: r.photo_count,
            video_count: r.video_count,
            status: r.status,
            duration: r.duration,
            major_topics: majorTopics,
            source_status: sourceStatus
          };
        });
      } catch (err) {
        console.error('SQLite getHistory error:', err);
      }
    }

    const list = Array.from(this.memoryFallback.reports.values())
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .map((r) => ({
        job_id: r.job_id,
        date: r.date,
        photo_count: r.photos.length,
        video_count: r.videos.length,
        status: r.status,
        duration: r.duration,
        major_topics: [...r.photos.map((p) => p.title), ...r.videos.map((v) => v.title)].slice(0, 3),
        source_status: r.source_status
      }));

    return list;
  }

  public clearAllHistory(): void {
    this.memoryFallback.reports.clear();
    this.memoryFallback.evidence.clear();

    try {
      const reportsFile = path.join(DATA_DIR, 'reports_fallback.json');
      fs.writeFileSync(reportsFile, JSON.stringify([], null, 2), 'utf8');
    } catch (e) {
      console.error('Failed writing empty reports fallback file:', e);
    }

    if (this.db) {
      try {
        this.db.exec(`
          DELETE FROM reports;
          DELETE FROM evidence_store;
          DELETE FROM opportunity_history;
        `);
      } catch (err) {
        console.error('SQLite clearAllHistory error:', err);
      }
    }
  }

  public saveRawEvidence(jobId: string, items: RawEvidence[]) {
    this.memoryFallback.evidence.set(jobId, items);
    if (!this.db || !items.length) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO evidence_store (
          job_id, source, url, evidence_type, collected_at, raw_title, raw_keywords, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of items) {
        stmt.run(
          jobId,
          item.source,
          item.url || '',
          item.evidence_type || 'post',
          item.collected_at || new Date().toISOString(),
          item.raw_title || '',
          JSON.stringify(item.raw_keywords || []),
          JSON.stringify(item.metadata || {})
        );
      }
    } catch (err) {
      console.error('SQLite saveRawEvidence error:', err);
    }
  }

  public getRawEvidence(jobId: string): RawEvidence[] {
    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          SELECT source, url, evidence_type, collected_at, raw_title, raw_keywords, metadata_json
          FROM evidence_store
          WHERE job_id = ?
        `);
        const rows = stmt.all(jobId) as Array<{
          source: string;
          url: string;
          evidence_type: string;
          collected_at: string;
          raw_title: string;
          raw_keywords: string;
          metadata_json: string;
        }>;
        if (rows.length > 0) {
          return rows.map((r) => ({
            source: r.source as any,
            url: r.url,
            evidence_type: r.evidence_type as any,
            collected_at: r.collected_at,
            raw_title: r.raw_title,
            raw_keywords: JSON.parse(r.raw_keywords || '[]'),
            metadata: JSON.parse(r.metadata_json || '{}')
          }));
        }
      } catch (err) {
        console.error('SQLite getRawEvidence error:', err);
      }
    }
    return this.memoryFallback.evidence.get(jobId) || [];
  }

  public getRecentOpportunityHistory(limit: number = 30): Array<{ title: string; concept: string }> {
    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          SELECT title, concept FROM opportunity_history
          ORDER BY id DESC
          LIMIT ?
        `);
        const rows = stmt.all(limit) as Array<{ title: string; concept: string }>;
        return rows;
      } catch (err) {
        console.error('SQLite getRecentOpportunityHistory error:', err);
      }
    }

    const result: Array<{ title: string; concept: string }> = [];
    for (const r of Array.from(this.memoryFallback.reports.values())) {
      for (const p of r.photos) result.push({ title: p.title || '', concept: p.concept || p.description || '' });
      for (const v of r.videos) result.push({ title: v.title || '', concept: v.concept || v.description || '' });
      if (result.length >= limit) break;
    }
    return result;
  }

  // Instructions
  public getInstructions(): string {
    if (this.db) {
      try {
        const stmt = this.db.prepare("SELECT value FROM user_settings WHERE key = 'gemini_instructions'");
        const row = stmt.get() as { value: string } | undefined;
        if (row) return row.value || '';
      } catch (err) {
        console.error('SQLite getInstructions error:', err);
      }
    }
    return this.memoryFallback.instructions;
  }

  public saveInstructions(instructions: string): void {
    const text = (instructions || '').slice(0, 1000);
    this.memoryFallback.instructions = text;
    this.persistFallback();

    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO user_settings (key, value)
          VALUES ('gemini_instructions', ?)
        `);
        stmt.run(text);
      } catch (err) {
        console.error('SQLite saveInstructions error:', err);
      }
    }
  }

  public clearInstructions(): void {
    this.memoryFallback.instructions = '';
    this.persistFallback();

    if (this.db) {
      try {
        this.db.prepare("DELETE FROM user_settings WHERE key = 'gemini_instructions'").run();
      } catch (err) {
        console.error('SQLite clearInstructions error:', err);
      }
    }
  }

  // PDF Document & Directives
  public getPdfDocument(): PdfDocumentConfig | null {
    if (this.db) {
      try {
        const stmt = this.db.prepare("SELECT value FROM user_settings WHERE key = 'pdf_document_config'");
        const row = stmt.get() as { value: string } | undefined;
        if (row && row.value) {
          return JSON.parse(row.value) as PdfDocumentConfig;
        }
      } catch (err) {
        console.error('SQLite getPdfDocument error:', err);
      }
    }
    return this.memoryFallback.pdfDocument || null;
  }

  public savePdfDocument(doc: PdfDocumentConfig): void {
    this.memoryFallback.pdfDocument = doc;
    this.persistFallback();

    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO user_settings (key, value)
          VALUES ('pdf_document_config', ?)
        `);
        stmt.run(JSON.stringify(doc));
      } catch (err) {
        console.error('SQLite savePdfDocument error:', err);
      }
    }
  }

  public clearPdfDocument(): void {
    this.memoryFallback.pdfDocument = null;
    this.persistFallback();

    if (this.db) {
      try {
        this.db.prepare("DELETE FROM user_settings WHERE key = 'pdf_document_config'").run();
      } catch (err) {
        console.error('SQLite clearPdfDocument error:', err);
      }
    }
  }

  // Gemini Key & Model
  public getCustomApiKey(): string {
    if (this.db) {
      try {
        const stmt = this.db.prepare("SELECT value FROM user_settings WHERE key = 'custom_gemini_api_key'");
        const row = stmt.get() as { value: string } | undefined;
        if (row && row.value) return row.value;
      } catch (err) {
        console.error('SQLite getCustomApiKey error:', err);
      }
    }
    return '';
  }

  public saveCustomApiKey(key: string): void {
    const val = (key || '').trim();
    if (this.db) {
      try {
        if (!val) {
          this.db.prepare("DELETE FROM user_settings WHERE key = 'custom_gemini_api_key'").run();
        } else {
          this.db.prepare("INSERT OR REPLACE INTO user_settings (key, value) VALUES ('custom_gemini_api_key', ?)").run(val);
        }
      } catch (err) {
        console.error('SQLite saveCustomApiKey error:', err);
      }
    }
  }

  public getCustomModel(): string {
    if (this.db) {
      try {
        const stmt = this.db.prepare("SELECT value FROM user_settings WHERE key = 'custom_gemini_model'");
        const row = stmt.get() as { value: string } | undefined;
        if (row && row.value) return row.value;
      } catch (err) {
        console.error('SQLite getCustomModel error:', err);
      }
    }
    return 'gemini-3.7-flash';
  }

  public saveCustomModel(model: string): void {
    const val = (model || '').trim();
    if (this.db) {
      try {
        this.db.prepare("INSERT OR REPLACE INTO user_settings (key, value) VALUES ('custom_gemini_model', ?)").run(val || 'gemini-3.7-flash');
      } catch (err) {
        console.error('SQLite saveCustomModel error:', err);
      }
    }
  }

  public getLastSuccessfulModel(): string {
    if (!this.db) return '';
    try {
      const row = this.db.prepare("SELECT value FROM user_settings WHERE key = 'last_successful_gemini_model'").get() as { value: string } | undefined;
      return row?.value || '';
    } catch (err) {
      console.error('SQLite getLastSuccessfulModel error:', err);
      return '';
    }
  }

  public saveLastSuccessfulModel(model: string): void {
    const value = (model || '').trim();
    if (!value || !this.db) return;
    try {
      this.db.prepare("INSERT OR REPLACE INTO user_settings (key, value) VALUES ('last_successful_gemini_model', ?)").run(value);
    } catch (err) {
      console.error('SQLite saveLastSuccessfulModel error:', err);
    }
  }

  // Rejected Content
  public getRejectedContent(): string[] {
    if (this.db) {
      try {
        const stmt = this.db.prepare('SELECT item_text FROM rejected_items ORDER BY id ASC');
        const rows = stmt.all() as Array<{ item_text: string }>;
        return rows.map((r) => r.item_text).filter(Boolean);
      } catch (err) {
        console.error('SQLite getRejectedContent error:', err);
      }
    }
    return this.memoryFallback.rejectedContent;
  }

  public saveRejectedContent(items: string[]): void {
    const cleaned = (items || []).map((s) => String(s).trim()).filter(Boolean);
    this.memoryFallback.rejectedContent = cleaned;
    this.persistFallback();

    if (this.db) {
      try {
        this.db.exec('DELETE FROM rejected_items');
        const stmt = this.db.prepare('INSERT INTO rejected_items (item_text, created_at) VALUES (?, ?)');
        const now = new Date().toISOString();
        for (const item of cleaned) {
          stmt.run(item, now);
        }
      } catch (err) {
        console.error('SQLite saveRejectedContent error:', err);
      }
    }
  }

  public deleteRejectedContent(index: number): void {
    const list = this.getRejectedContent();
    if (index >= 0 && index < list.length) {
      list.splice(index, 1);
      this.saveRejectedContent(list);
    }
  }

  // Platform Data Toggle
  public getPlatformDataEnabled(): boolean {
    if (this.db) {
      try {
        const stmt = this.db.prepare("SELECT value FROM user_settings WHERE key = 'platform_data_enabled'");
        const row = stmt.get() as { value: string } | undefined;
        if (row && row.value !== undefined) {
          return row.value === 'true' || row.value === '1';
        }
      } catch (err) {
        console.error('SQLite getPlatformDataEnabled error:', err);
      }
    }
    return this.memoryFallback.platformDataEnabled ?? true;
  }

  public savePlatformDataEnabled(enabled: boolean): void {
    this.memoryFallback.platformDataEnabled = !!enabled;
    this.persistFallback();
    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO user_settings (key, value)
          VALUES ('platform_data_enabled', ?)
        `);
        stmt.run(enabled ? 'true' : 'false');
      } catch (err) {
        console.error('SQLite savePlatformDataEnabled error:', err);
      }
    }
  }

  // Reddit Configuration
  public getRedditConfig(): RedditConfig {
    if (this.db) {
      try {
        const stmt = this.db.prepare("SELECT value FROM user_settings WHERE key = 'reddit_config'");
        const row = stmt.get() as { value: string } | undefined;
        if (row && row.value) {
          const parsed = JSON.parse(row.value);
          return {
            ...DEFAULT_REDDIT_CONFIG,
            ...parsed,
            subreddits: Array.isArray(parsed.subreddits) && parsed.subreddits.length > 0 ? parsed.subreddits : [...DEFAULT_SUBREDDITS]
          };
        }
      } catch (err) {
        console.error('SQLite getRedditConfig error:', err);
      }
    }
    return this.memoryFallback.redditConfig || { ...DEFAULT_REDDIT_CONFIG };
  }

  public getMaskedRedditConfig(): RedditConfig {
    const config = this.getRedditConfig();
    return {
      ...config,
      clientSecret: config.clientSecret ? '••••••••' : ''
    };
  }

  public saveRedditConfig(patch: Partial<RedditConfig>): RedditConfig {
    const current = this.getRedditConfig();
    const isMaskedSecret = patch.clientSecret && (patch.clientSecret === '••••••••' || patch.clientSecret.includes('••'));

    const updated: RedditConfig = {
      ...current,
      clientId: patch.clientId !== undefined ? patch.clientId.trim() : current.clientId,
      clientSecret: isMaskedSecret ? current.clientSecret : (patch.clientSecret !== undefined ? patch.clientSecret.trim() : current.clientSecret),
      userAgent: patch.userAgent !== undefined ? patch.userAgent.trim() || DEFAULT_REDDIT_CONFIG.userAgent : current.userAgent,
      subreddits: Array.isArray(patch.subreddits) ? patch.subreddits.map((s) => s.replace(/^r\//i, '').trim()).filter(Boolean) : current.subreddits,
      timeframe: patch.timeframe === '7d' ? '7d' : '24h',
      collectPosts: patch.collectPosts !== undefined ? !!patch.collectPosts : current.collectPosts,
      collectComments: patch.collectComments !== undefined ? !!patch.collectComments : current.collectComments,
      connected: patch.connected !== undefined ? patch.connected : current.connected,
      lastCollectedAt: patch.lastCollectedAt !== undefined ? patch.lastCollectedAt : current.lastCollectedAt,
      collectedCount: patch.collectedCount !== undefined ? patch.collectedCount : current.collectedCount
    };

    this.memoryFallback.redditConfig = updated;
    this.persistFallback();

    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO user_settings (key, value)
          VALUES ('reddit_config', ?)
        `);
        stmt.run(JSON.stringify(updated));
      } catch (err) {
        console.error('SQLite saveRedditConfig error:', err);
      }
    }

    return updated;
  }

  public updateRedditStats(collectedCount: number, connected: boolean = true): void {
    const current = this.getRedditConfig();
    current.lastCollectedAt = new Date().toISOString();
    current.collectedCount = (current.collectedCount || 0) + collectedCount;
    current.connected = connected;
    this.saveRedditConfig(current);
  }

  // Discord Configuration
  public getDiscordConfig(): DiscordConfig {
    if (this.db) {
      try {
        const stmt = this.db.prepare("SELECT value FROM user_settings WHERE key = 'discord_config'");
        const row = stmt.get() as { value: string } | undefined;
        if (row && row.value) {
          const parsed = JSON.parse(row.value);
          return {
            ...DEFAULT_DISCORD_CONFIG,
            ...parsed,
            guilds: Array.isArray(parsed.guilds) ? parsed.guilds : []
          };
        }
      } catch (err) {
        console.error('SQLite getDiscordConfig error:', err);
      }
    }
    return this.memoryFallback.discordConfig || { ...DEFAULT_DISCORD_CONFIG };
  }

  public getMaskedDiscordConfig(): DiscordConfig {
    const config = this.getDiscordConfig();
    return {
      ...config,
      botToken: config.botToken ? '••••••••' : ''
    };
  }

  public saveDiscordConfig(patch: Partial<DiscordConfig>): DiscordConfig {
    const current = this.getDiscordConfig();
    const isMaskedToken = patch.botToken && (patch.botToken === '••••••••' || patch.botToken.includes('••'));

    const updated: DiscordConfig = {
      ...current,
      botToken: isMaskedToken ? current.botToken : (patch.botToken !== undefined ? patch.botToken.trim() : current.botToken),
      guilds: Array.isArray(patch.guilds) ? patch.guilds : current.guilds,
      timeframe: patch.timeframe === '7d' ? '7d' : '24h',
      collectMessages: patch.collectMessages !== undefined ? !!patch.collectMessages : current.collectMessages,
      collectThreads: patch.collectThreads !== undefined ? !!patch.collectThreads : current.collectThreads,
      connected: patch.connected !== undefined ? patch.connected : current.connected,
      lastCollectedAt: patch.lastCollectedAt !== undefined ? patch.lastCollectedAt : current.lastCollectedAt,
      collectedCount: patch.collectedCount !== undefined ? patch.collectedCount : current.collectedCount
    };

    this.memoryFallback.discordConfig = updated;
    this.persistFallback();

    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO user_settings (key, value)
          VALUES ('discord_config', ?)
        `);
        stmt.run(JSON.stringify(updated));
      } catch (err) {
        console.error('SQLite saveDiscordConfig error:', err);
      }
    }

    return updated;
  }

  public updateDiscordStats(collectedCount: number, connected: boolean = true): void {
    const current = this.getDiscordConfig();
    current.lastCollectedAt = new Date().toISOString();
    current.collectedCount = (current.collectedCount || 0) + collectedCount;
    current.connected = connected;
    this.saveDiscordConfig(current);
  }

  // V2Ray / desktop proxy settings
  public getProxySettings(): ProxySettings {
    if (this.db) {
      try {
        const stmt = this.db.prepare("SELECT value FROM user_settings WHERE key = 'proxy_settings'");
        const row = stmt.get() as { value: string } | undefined;
        if (row?.value) return { ...DEFAULT_PROXY_SETTINGS, ...JSON.parse(row.value) };
      } catch (err) {
        console.error('SQLite getProxySettings error:', err);
      }
    }
    return { ...DEFAULT_PROXY_SETTINGS, ...(this.memoryFallback.proxySettings || {}) };
  }

  public saveProxySettings(patch: Partial<ProxySettings>): ProxySettings {
    const current = this.getProxySettings();
    const protocol = patch.protocol === 'socks5' ? 'socks5' : patch.protocol === 'http' ? 'http' : current.protocol;
    const rawPort = patch.port === undefined ? current.port : Number(patch.port);
    const updated: ProxySettings = {
      enabled: patch.enabled !== undefined ? !!patch.enabled : current.enabled,
      protocol,
      host: patch.host !== undefined ? String(patch.host).trim() || current.host : current.host,
      port: Number.isInteger(rawPort) && rawPort > 0 && rawPort <= 65535 ? rawPort : current.port,
      username: patch.username !== undefined ? String(patch.username).trim() : current.username,
      password: patch.password !== undefined && String(patch.password).length > 0 ? String(patch.password) : current.password
    };
    this.memoryFallback.proxySettings = updated;
    this.persistFallback();
    if (this.db) {
      try {
        this.db.prepare("INSERT OR REPLACE INTO user_settings (key, value) VALUES ('proxy_settings', ?)").run(JSON.stringify(updated));
      } catch (err) {
        console.error('SQLite saveProxySettings error:', err);
      }
    }
    return updated;
  }

}

export const storage = new StorageManager();
