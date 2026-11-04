import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  HistoryRecord,
  RawEvidence,
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

class StorageManager {
  private db: DatabaseSync | null = null;
  private memoryFallback: {
    reports: Map<string, ResearchReport>;
    rejectedContent: string[];
    evidence: Map<string, RawEvidence[]>;
    proxySettings: ProxySettings;
  } = {
    reports: new Map(),
    rejectedContent: [],
    evidence: new Map(),
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

      CREATE TABLE IF NOT EXISTS research_events (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        event_type TEXT NOT NULL,
        message TEXT NOT NULL,
        url TEXT,
        details_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_research_events_job ON research_events(job_id, created_at);

      CREATE TABLE IF NOT EXISTS research_knowledge (
        fingerprint TEXT PRIMARY KEY,
        canonical_url TEXT NOT NULL,
        normalized_title TEXT NOT NULL,
        keywords_json TEXT NOT NULL,
        category TEXT NOT NULL,
        commercial_intent TEXT NOT NULL,
        source_family TEXT NOT NULL,
        observation TEXT,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        seen_count INTEGER NOT NULL DEFAULT 1,
        last_job_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        record_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_research_knowledge_seen ON research_knowledge(last_seen_at);
      CREATE INDEX IF NOT EXISTS idx_research_knowledge_family ON research_knowledge(source_family);

      CREATE TABLE IF NOT EXISTS research_knowledge_observations (
        id TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        job_id TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        observation_json TEXT NOT NULL,
        UNIQUE(fingerprint, content_hash, job_id)
      );

      CREATE INDEX IF NOT EXISTS idx_knowledge_observations_job ON research_knowledge_observations(job_id, collected_at);

      CREATE TABLE IF NOT EXISTS opportunity_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        concept TEXT,
        created_at TEXT NOT NULL
      );
    `);

    // Purge data captured by the retired private-profile sync feature.
    this.db.exec(`
      DROP TABLE IF EXISTS portfolio_assets;
      DROP TABLE IF EXISTS portfolio_change_log;
      DROP TABLE IF EXISTS portfolio_snapshots;
      DELETE FROM user_settings WHERE key IN ('gemini_instructions', 'pdf_document_config');
      DELETE FROM research_events
        WHERE event_type LIKE 'portfolio_%'
           OR LOWER(COALESCE(url, '')) LIKE '%contributor.stock.adobe.com%';
    `);
    try {
      this.db.exec("UPDATE reports SET report_json = json_remove(report_json, '$.portfolio_summary') WHERE json_valid(report_json)");
    } catch {
      // Older SQLite builds may not include JSON helpers; reports remain local and are never sent to the model.
    }
  }

  private loadSettings() {
    try {
      this.memoryFallback.rejectedContent = this.getRejectedContent();
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
        const cleaned = list.map((report: any) => {
          const safe = { ...report };
          delete safe.portfolio_summary;
          safe.sources_processed = Array.isArray(safe.sources_processed)
            ? safe.sources_processed.filter((name: string) => !/adobe contributor portfolio/i.test(String(name)))
            : safe.sources_processed;
          if (safe.source_status) delete safe.source_status['Adobe Contributor portfolio'];
          if (Array.isArray(safe.evidence_sources)) {
            safe.evidence_sources = safe.evidence_sources.filter((source: any) => !/contributor\.stock\.adobe\.com/i.test(String(source.url || '')));
          }
          if (safe.web_research && Array.isArray(safe.web_research.sources)) {
            safe.web_research.sources = safe.web_research.sources.filter((source: any) => !/contributor\.stock\.adobe\.com/i.test(String(source.url || '')));
          }
          return safe as ResearchReport;
        });
        for (const report of cleaned) this.memoryFallback.reports.set(report.job_id, report);
        fs.writeFileSync(reportsFile, JSON.stringify(cleaned, null, 2), 'utf8');
      }

      const settingsFile = path.join(DATA_DIR, 'settings_fallback.json');
      if (fs.existsSync(settingsFile)) {
        const parsed = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
        this.memoryFallback.rejectedContent = parsed.rejectedContent || [];
        if (parsed.proxySettings) this.memoryFallback.proxySettings = { ...DEFAULT_PROXY_SETTINGS, ...parsed.proxySettings };
        // Rewrite legacy settings without personal instructions or uploaded PDF content.
        fs.writeFileSync(settingsFile, JSON.stringify({
          rejectedContent: this.memoryFallback.rejectedContent,
          proxySettings: this.memoryFallback.proxySettings
        }, null, 2), 'utf8');
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
            rejectedContent: this.memoryFallback.rejectedContent,
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

  public appendResearchEvent(event: { id: string; jobId: string; at: string; type: string; message: string; url?: string; details?: Record<string, any> }) {
    if (!this.db) return;
    try {
      this.db.prepare(`INSERT OR IGNORE INTO research_events (id, job_id, created_at, event_type, message, url, details_json) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(event.id, event.jobId, event.at, event.type, event.message, event.url || null, JSON.stringify(event.details || {}));
    } catch (error) { console.error('SQLite appendResearchEvent error:', error); }
  }

  public getResearchEvents(jobId: string, after = 0) {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare('SELECT * FROM research_events WHERE job_id = ? ORDER BY created_at ASC LIMIT -1 OFFSET ?').all(jobId, Math.max(0, after)) as any[];
      return rows.map(row => ({ id: row.id, jobId: row.job_id, at: row.created_at, type: row.event_type, message: row.message, url: row.url || undefined, details: JSON.parse(row.details_json || '{}') }));
    } catch (error) { console.error('SQLite getResearchEvents error:', error); return []; }
  }

  public saveNormalizedResearchEvidence(jobId: string, records: Array<Record<string, any>>) {
    if (!this.db || !Array.isArray(records) || !records.length) return;
    const upsert = this.db.prepare('INSERT INTO research_knowledge (fingerprint, canonical_url, normalized_title, keywords_json, category, commercial_intent, source_family, observation, first_seen_at, last_seen_at, seen_count, last_job_id, content_hash, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?) ON CONFLICT(fingerprint) DO UPDATE SET canonical_url=excluded.canonical_url, normalized_title=excluded.normalized_title, keywords_json=excluded.keywords_json, category=excluded.category, commercial_intent=excluded.commercial_intent, source_family=excluded.source_family, observation=excluded.observation, last_seen_at=excluded.last_seen_at, seen_count=research_knowledge.seen_count+1, last_job_id=excluded.last_job_id, content_hash=excluded.content_hash, record_json=excluded.record_json');
    const observation = this.db.prepare('INSERT OR IGNORE INTO research_knowledge_observations (id, fingerprint, job_id, collected_at, content_hash, observation_json) VALUES (?, ?, ?, ?, ?, ?)');
    try {
      for (const record of records) {
        const collectedAt = String(record.collectedAt || new Date().toISOString());
        const fingerprint = String(record.fingerprint || '');
        const contentHash = String(record.contentHash || '');
        if (!fingerprint || !contentHash) continue;
        const payload = JSON.stringify(record);
        upsert.run(
          fingerprint, String(record.canonicalUrl || record.url || ''), String(record.title || ''),
          JSON.stringify(record.keywords || []), String(record.category || 'Unknown'),
          String(record.commercialIntent || 'Unknown'), String(record.sourceFamily || 'website'),
          String(record.observation || '').slice(0, 12000), collectedAt, collectedAt,
          jobId, contentHash, payload
        );
        observation.run(crypto.createHash('sha256').update(fingerprint + '|' + contentHash + '|' + jobId).digest('hex'), fingerprint, jobId, collectedAt, contentHash, payload);
      }
    } catch (error) {
      console.error('SQLite saveNormalizedResearchEvidence error:', error);
    }
  }

  public getRecentNormalizedResearchEvidence(limit = 80) {
    if (!this.db) return [];
    try {
      const safeLimit = Math.max(1, Math.min(500, Math.floor(limit) || 80));
      const rows = this.db.prepare('SELECT record_json, first_seen_at, last_seen_at, seen_count, last_job_id FROM research_knowledge ORDER BY last_seen_at DESC LIMIT ?').all(safeLimit) as any[];
      return rows.map(row => ({
        ...JSON.parse(row.record_json || '{}'),
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        seenCount: Number(row.seen_count) || 1,
        lastJobId: row.last_job_id
      }));
    } catch (error) {
      console.error('SQLite getRecentNormalizedResearchEvidence error:', error);
      return [];
    }
  }

  public getNormalizedEvidenceObservationCount(jobId: string) {
    if (!this.db) return 0;
    try {
      const row = this.db.prepare('SELECT COUNT(*) AS count FROM research_knowledge_observations WHERE job_id = ?').get(jobId) as any;
      return Number(row?.count) || 0;
    } catch (error) {
      console.error('SQLite getNormalizedEvidenceObservationCount error:', error);
      return 0;
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
