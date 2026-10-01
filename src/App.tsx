import React, { useEffect, useRef, useState } from 'react';
import type {
  HistoryRecord,
  PhotoOpportunity,
  ResearchReport,
  ResearchStage,
  VideoOpportunity
} from '../server/types.js';

const RESEARCH_STAGES: Array<{ id: ResearchStage; label: string }> = [
  { id: 'INITIALIZING', label: 'INITIALIZING RESEARCH ENGINE' },
  { id: 'COLLECTING', label: 'COLLECTING MARKET DATA' },
  { id: 'NORMALIZING', label: 'NORMALIZING RESULTS' },
  { id: 'DEDUPLICATING', label: 'REMOVING DUPLICATES' },
  { id: 'CLUSTERING', label: 'CLUSTERING CONCEPTS' },
  { id: 'DEMAND_ANALYSIS', label: 'ANALYZING RECURRING DEMAND' },
  { id: 'SUPPLY_GAP', label: 'ANALYZING SUPPLY / GAPS' },
  { id: 'COMMERCIAL_USE', label: 'MAPPING COMMERCIAL USE' },
  { id: 'LONGEVITY', label: 'CHECKING LONGEVITY' },
  { id: 'SCORING', label: 'SCORING OPPORTUNITIES' },
  { id: 'PREPARING_PHOTOS', label: 'PREPARING PHOTO IDEAS' },
  { id: 'PREPARING_VIDEOS', label: 'PREPARING VIDEO IDEAS' },
  { id: 'COMPLETE', label: 'REPORT READY' }
];

export default function App() {
  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Navigation state
  const [activeTab, setActiveTab] = useState<'research' | 'sources' | 'instructions' | 'history' | 'settings'>('research');

  // Controls state
  const [photoCount, setPhotoCount] = useState<number>(5);
  const [videoCount, setVideoCount] = useState<number>(3);
  const [isResearching, setIsResearching] = useState<boolean>(false);
  const [researchStage, setResearchStage] = useState<ResearchStage>('INITIALIZING');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressMessage, setProgressMessage] = useState<string>('Initializing research engine...');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Live Sources Probe & Stream state
  const [probeData, setProbeData] = useState<any | null>(null);
  const [isProbing, setIsProbing] = useState<boolean>(false);
  const [probeFilter, setProbeFilter] = useState<string>('ALL');
  const [probeSearch, setProbeSearch] = useState<string>('');

  // Raw Evidence Modal state (Stored in SQLite)
  const [evidenceModal, setEvidenceModal] = useState<{
    isOpen: boolean;
    jobId: string;
    items: any[];
    isLoading: boolean;
  }>({
    isOpen: false,
    jobId: '',
    items: [],
    isLoading: false
  });

  // Error state
  const [errorInfo, setErrorInfo] = useState<{ message: string; details?: string } | null>(null);
  const [showTechDetails, setShowTechDetails] = useState<boolean>(false);

  // Report & History
  const [currentReport, setCurrentReport] = useState<ResearchReport | null>(null);
  const [historyList, setHistoryList] = useState<HistoryRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Intelligence Setup state
  const [instructionsText, setInstructionsText] = useState<string>('');
  const [rejectedItems, setRejectedItems] = useState<string[]>([]);
  const [newRejectionInput, setNewRejectionInput] = useState<string>('');

  // Toast banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Evidence open toggles
  const [openEvidenceMap, setOpenEvidenceMap] = useState<Record<string, boolean>>({});

  // System Config
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('');
  const [sourcesStatus, setSourcesStatus] = useState<Record<string, string>>({
    Shutterstock: 'NOT CHECKED',
    'Adobe Stock': 'NOT CHECKED',
    Pond5: 'NOT CHECKED'
  });

  // Gemini Configuration State
  const [geminiConfig, setGeminiConfig] = useState<{
    hasCustomKey: boolean;
    hasEnvKey: boolean;
    hasKey: boolean;
    activeKeyMasked: string;
    activeModel: string;
    availableModels: string[];
  }>({
    hasCustomKey: false,
    hasEnvKey: false,
    hasKey: false,
    activeKeyMasked: 'CHECKING...',
    activeModel: 'gemini-3.8-flash',
    availableModels: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.1-pro-preview']
  });
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState<string>('');
  const [selectedModelInput, setSelectedModelInput] = useState<string>('gemini-3.8-flash');
  const [showApiKeyText, setShowApiKeyText] = useState<boolean>(false);
  const [isTestingGemini, setIsTestingGemini] = useState<boolean>(false);
  const [isSavingGemini, setIsSavingGemini] = useState<boolean>(false);
  const [geminiTestFeedback, setGeminiTestFeedback] = useState<{ success: boolean; message: string; durationMs?: number } | null>(null);

  // Copy feedback state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Show Toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  // Helper for API fetch
  const getApiUrl = (path: string) => {
    const base = apiBaseUrl.trim().replace(/\/+$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
  };

  // Theme setup
  useEffect(() => {
    const savedTheme = (localStorage.getItem('as_radar_x_theme') as 'dark' | 'light') || 'dark';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);

    const savedPhoto = localStorage.getItem('as_radar_x_photo_count');
    if (savedPhoto) setPhotoCount(parseInt(savedPhoto, 10));

    const savedVideo = localStorage.getItem('as_radar_x_video_count');
    if (savedVideo) setVideoCount(parseInt(savedVideo, 10));

    const savedApiBase = localStorage.getItem('as_radar_x_api_base');
    if (savedApiBase) setApiBaseUrl(savedApiBase);

    // Load initial settings and history
    loadInstructions();
    loadRejectedContent();
    loadSourcesStatus();
    loadHistory();
    loadGeminiConfig();

    // Check active job
    const storedJobId = localStorage.getItem('as_radar_x_active_job');
    const storedStarted = localStorage.getItem('as_radar_x_active_job_started');
    if (storedJobId) {
      setActiveJobId(storedJobId);
      setIsResearching(true);
      if (storedStarted) {
        const diff = Math.max(0, Math.floor((Date.now() - parseInt(storedStarted, 10)) / 1000));
        setElapsedSeconds(diff);
      }
      pollJobStatus(storedJobId);
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('as_radar_x_theme', next);
  };

  // Timer Effect
  useEffect(() => {
    if (isResearching) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isResearching]);

  // Load Instructions
  const loadInstructions = async () => {
    try {
      const res = await fetch(getApiUrl('/api/instruction'));
      if (res.ok) {
        const data = await res.json();
        setInstructionsText(data.instructions || '');
      }
    } catch {
      // ignore
    }
  };

  const handleSaveInstructions = async () => {
    try {
      const res = await fetch(getApiUrl('/api/instruction'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions: instructionsText.slice(0, 500) })
      });
      if (res.ok) {
        showToast('Gemini analyst instructions saved successfully.');
      }
    } catch (err: any) {
      showToast(`Failed saving instructions: ${err.message}`);
    }
  };

  const handleClearInstructions = async () => {
    try {
      const res = await fetch(getApiUrl('/api/instruction'), { method: 'DELETE' });
      if (res.ok) {
        setInstructionsText('');
        showToast('Instructions cleared.');
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  // Load Rejected Content
  const loadRejectedContent = async () => {
    try {
      const res = await fetch(getApiUrl('/api/rejected-content'));
      if (res.ok) {
        const data = await res.json();
        setRejectedItems(Array.isArray(data.items) ? data.items : []);
      }
    } catch {
      // ignore
    }
  };

  const handleAddOrUpdateRejection = async (index: number, val: string) => {
    const nextList = [...rejectedItems];
    if (index < nextList.length) {
      if (!val.trim()) {
        nextList.splice(index, 1);
      } else {
        nextList[index] = val.trim();
      }
    } else if (val.trim()) {
      nextList.push(val.trim());
      setNewRejectionInput('');
    }

    setRejectedItems(nextList);
    try {
      await fetch(getApiUrl('/api/rejected-content'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: nextList })
      });
      showToast('Rejection memory updated.');
    } catch (err: any) {
      showToast(`Failed updating rejection list: ${err.message}`);
    }
  };

  const handleDeleteRejection = async (index: number) => {
    try {
      const res = await fetch(getApiUrl(`/api/rejected-content/${index}`), { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        setRejectedItems(data.items || []);
        showToast('Exclusion item removed.');
      }
    } catch (err: any) {
      showToast(`Error deleting item: ${err.message}`);
    }
  };

  // Load Sources Status
  const loadSourcesStatus = async () => {
    try {
      const res = await fetch(getApiUrl('/api/sources/status'));
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, string> = {};
        for (const [k, v] of Object.entries(data.sources || {})) {
          map[k] = (v as any).overall || 'AVAILABLE';
        }
        setSourcesStatus(map);
      }
    } catch {
      // ignore
    }
  };

  // Run Real Live Probe of Adobe Stock, Shutterstock, Pond5
  const runSourcesProbe = async (force: boolean = false) => {
    setIsProbing(true);
    try {
      const res = await fetch(getApiUrl(force ? '/api/sources/probe' : '/api/sources/status'), {
        method: force ? 'POST' : 'GET'
      });
      if (res.ok) {
        const data = await res.json();
        setProbeData(data);
        if (data.sources) {
          const map: Record<string, string> = {};
          for (const [k, v] of Object.entries(data.sources)) {
            map[k] = (v as any).overall || 'AVAILABLE';
          }
          setSourcesStatus(map);
        }
        if (force) {
          showToast(`Live probe completed! Discovered ${data.totalEvidenceCount || 0} real marketplace evidence signals.`);
        }
      } else {
        throw new Error(`Probe HTTP ${res.status}`);
      }
    } catch (err: any) {
      showToast(`Probe failed: ${err.message}`);
    } finally {
      setIsProbing(false);
    }
  };

  // Inspect Raw Evidence for Job Stored in SQLite
  const handleOpenJobEvidence = async (jobId: string) => {
    setEvidenceModal({
      isOpen: true,
      jobId,
      items: [],
      isLoading: true
    });
    try {
      const res = await fetch(getApiUrl(`/api/evidence/${encodeURIComponent(jobId)}`));
      if (res.ok) {
        const data = await res.json();
        setEvidenceModal({
          isOpen: true,
          jobId,
          items: data.evidence || [],
          isLoading: false
        });
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err: any) {
      showToast(`Failed loading evidence: ${err.message}`);
      setEvidenceModal((prev) => ({ ...prev, isLoading: false }));
    }
  };

  // Gemini Config Handlers
  const loadGeminiConfig = async () => {
    try {
      const res = await fetch(getApiUrl('/api/gemini/config'));
      if (res.ok) {
        const data = await res.json();
        setGeminiConfig(data);
        if (data.activeModel) {
          setSelectedModelInput(data.activeModel);
        }
      }
    } catch {
      // ignore
    }
  };

  const handleSaveGeminiConfig = async () => {
    setIsSavingGemini(true);
    try {
      const body: any = { model: selectedModelInput };
      if (geminiApiKeyInput.trim()) {
        body.apiKey = geminiApiKeyInput.trim();
      }
      const res = await fetch(getApiUrl('/api/gemini/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const data = await res.json();
        setGeminiConfig((prev) => ({
          ...prev,
          hasCustomKey: data.hasCustomKey,
          hasKey: data.hasKey,
          activeKeyMasked: data.activeKeyMasked,
          activeModel: data.activeModel
        }));
        setGeminiApiKeyInput('');
        showToast('Gemini API & Model configuration saved successfully.');
      } else {
        const err = await res.json();
        showToast(`Save failed: ${err.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      showToast(`Save error: ${err.message}`);
    } finally {
      setIsSavingGemini(false);
    }
  };

  const handleTestGemini = async () => {
    setIsTestingGemini(true);
    setGeminiTestFeedback(null);
    try {
      const body: any = {
        model: selectedModelInput
      };
      if (geminiApiKeyInput.trim()) {
        body.apiKey = geminiApiKeyInput.trim();
      }
      const res = await fetch(getApiUrl('/api/gemini/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGeminiTestFeedback({
          success: true,
          message: `Connected successfully! Model: ${data.model}, Latency: ${data.durationMs}ms`,
          durationMs: data.durationMs
        });
        showToast('Gemini API is verified and online!');
      } else {
        setGeminiTestFeedback({
          success: false,
          message: data.error || 'Failed to authenticate with Gemini API. Check your key and model.'
        });
      }
    } catch (err: any) {
      setGeminiTestFeedback({
        success: false,
        message: err.message || 'Network error while testing Gemini connection.'
      });
    } finally {
      setIsTestingGemini(false);
    }
  };

  const handleClearCustomApiKey = async () => {
    try {
      const res = await fetch(getApiUrl('/api/gemini/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: '' })
      });
      if (res.ok) {
        loadGeminiConfig();
        showToast('Custom API Key cleared. Defaulting to server environment key.');
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  // Load History
  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(getApiUrl('/api/history'));
      if (res.ok) {
        const data = await res.json();
        setHistoryList(data.history || []);
      }
    } catch (err: any) {
      console.error('History load error:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Start Research
  const handleStartResearch = async () => {
    if (isResearching) return;
    if (photoCount === 0 && videoCount === 0) {
      showToast('Please select at least one photo or video opportunity.');
      return;
    }

    setErrorInfo(null);
    setShowTechDetails(false);
    setIsResearching(true);
    setElapsedSeconds(0);
    setProgressPercent(5);
    setResearchStage('INITIALIZING');
    setProgressMessage('Initializing research engine...');

    try {
      const res = await fetch(getApiUrl('/api/research'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_count: photoCount, video_count: videoCount })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const jobId = data.job_id;
      setActiveJobId(jobId);
      localStorage.setItem('as_radar_x_active_job', jobId);
      localStorage.setItem('as_radar_x_active_job_started', String(Date.now()));

      pollJobStatus(jobId);
    } catch (err: any) {
      setIsResearching(false);
      setErrorInfo({
        message: err.message || 'Research engine failed to start.',
        details: err.stack || String(err)
      });
      localStorage.removeItem('as_radar_x_active_job');
      localStorage.removeItem('as_radar_x_active_job_started');
    }
  };

  // Poll Job Status
  const pollJobStatus = async (jobId: string) => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);

    try {
      const res = await fetch(getApiUrl(`/api/research/status/${encodeURIComponent(jobId)}`));
      if (!res.ok) {
        throw new Error(`Status check HTTP ${res.status}`);
      }

      const data = await res.json();
      setResearchStage(data.stage || 'INITIALIZING');
      setProgressPercent(data.progress || 10);
      setProgressMessage(data.message || 'Processing research pipeline...');

      if (data.status === 'COMPLETED') {
        // Fetch full report
        const repRes = await fetch(getApiUrl(`/api/report/${encodeURIComponent(jobId)}`));
        if (repRes.ok) {
          const reportData = await repRes.json();
          setCurrentReport(reportData);
          if (reportData.source_status) {
            setSourcesStatus(reportData.source_status);
          }
        }
        setIsResearching(false);
        setActiveJobId(null);
        localStorage.removeItem('as_radar_x_active_job');
        localStorage.removeItem('as_radar_x_active_job_started');
        loadHistory();
        return;
      }

      if (data.status === 'FAILED') {
        throw new Error(data.error || data.message || 'Research pipeline failed.');
      }

      // Schedule next poll
      pollTimerRef.current = setTimeout(() => pollJobStatus(jobId), 2000);
    } catch (err: any) {
      setIsResearching(false);
      setActiveJobId(null);
      localStorage.removeItem('as_radar_x_active_job');
      localStorage.removeItem('as_radar_x_active_job_started');
      setErrorInfo({
        message: err.message || 'Research execution interrupted.',
        details: err.stack || String(err)
      });
    }
  };

  // Load Historical Report
  const handleLoadHistoricalReport = async (jobId: string) => {
    try {
      const res = await fetch(getApiUrl(`/api/report/${encodeURIComponent(jobId)}`));
      if (!res.ok) throw new Error(`Report HTTP ${res.status}`);
      const report = await res.json();
      setCurrentReport(report);
      setActiveTab('research');
      showToast(`Loaded historical report from ${report.date || jobId}`);
    } catch (err: any) {
      showToast(`Failed loading historical report: ${err.message}`);
    }
  };

  // Copy helper
  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      showToast('Copy failed.');
    }
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const secs = String(totalSeconds % 60).padStart(2, '0');
    return `Elapsed ${mins}:${secs}`;
  };

  const currentDateFormatted = new Date()
    .toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    })
    .toUpperCase();

  const totalOpportunities = (currentReport?.photos?.length || 0) + (currentReport?.videos?.length || 0);

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] font-['IBM_Plex_Sans'] relative pb-16">
      <div className="grid-bg"></div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#161c28] border border-[var(--accent-amber)] text-[var(--text-main)] text-xs font-mono py-2.5 px-4 rounded shadow-2xl flex items-center gap-2 animate-bounce">
          <i className="fa-solid fa-circle-check text-[var(--accent-amber)]"></i>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#0a0d14]/88 border-b border-[var(--border-color)]">
        <div className="max-w-[1400px] mx-auto px-4 min-h-[64px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xl font-bold font-brand tracking-wide">
              <i className="fa-solid fa-radar text-[var(--accent-amber)]"></i>
              <span>
                AS-RADAR-<span className="text-[var(--accent-amber)]">X</span>
              </span>
            </div>
            <div className="hidden sm:block pl-4 border-l border-[var(--border-color)] text-[var(--text-dim)] text-[0.66rem] font-semibold tracking-widest uppercase">
              Stock Content Market Intelligence
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 py-1.5 px-3 bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-full text-[0.68rem] font-bold font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  isResearching
                    ? 'bg-[var(--accent-cyan)] shadow-[0_0_8px_var(--accent-cyan)] animate-pulse-dot'
                    : errorInfo
                    ? 'bg-[var(--status-error)] shadow-[0_0_8px_var(--status-error)]'
                    : 'bg-[var(--status-success)] shadow-[0_0_8px_var(--status-success)]'
                }`}
              ></span>
              <span>
                {isResearching ? 'RESEARCH RUNNING' : errorInfo ? 'ENGINE ERROR' : 'ENGINE READY'}
              </span>
            </div>

            <div className="hidden md:block text-[var(--text-dim)] text-[0.72rem] font-mono">
              {currentDateFormatted}
            </div>

            <button
              onClick={toggleTheme}
              className="py-1.5 px-3 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] rounded text-xs text-[var(--text-main)] transition"
              title="Toggle Light / Dark Theme"
              type="button"
            >
              <i className={`fa-solid ${theme === 'dark' ? 'fa-sun text-[var(--accent-amber)]' : 'fa-moon'}`}></i>
            </button>

            <a
              href={getApiUrl('/api/download-zip')}
              download="as-radar-x-project.zip"
              className="py-1.5 px-3 bg-[var(--accent-amber)] hover:bg-[var(--accent-amber-hover)] text-black font-bold font-mono text-xs rounded flex items-center gap-1.5 shadow-sm transition"
              title="Download Complete Project Source Code (.ZIP)"
            >
              <i className="fa-solid fa-download"></i>
              <span className="hidden sm:inline">Download ZIP</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <div className="max-w-[1400px] mx-auto px-4 mt-4">
        {/* Navigation Tabs */}
        <nav className="flex gap-1 overflow-x-auto border-b border-[var(--border-color)] mb-6 scrollbar-none">
          <button
            onClick={() => setActiveTab('research')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === 'research'
                ? 'text-[var(--accent-amber)] border-[var(--accent-amber)] bg-amber-500/5'
                : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-main)]'
            }`}
          >
            <i className="fa-solid fa-microchip"></i>
            Research Engine
          </button>

          <button
            onClick={() => {
              setActiveTab('sources');
              if (!probeData) runSourcesProbe(false);
            }}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === 'sources'
                ? 'text-[var(--accent-amber)] border-[var(--accent-amber)] bg-amber-500/5'
                : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-main)]'
            }`}
          >
            <i className="fa-solid fa-satellite-dish"></i>
            Live Data Feeds & Probe
          </button>

          <button
            onClick={() => setActiveTab('instructions')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === 'instructions'
                ? 'text-[var(--accent-amber)] border-[var(--accent-amber)] bg-amber-500/5'
                : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-main)]'
            }`}
          >
            <i className="fa-solid fa-sliders"></i>
            Intelligence Setup
          </button>

          <button
            onClick={() => {
              setActiveTab('history');
              loadHistory();
            }}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === 'history'
                ? 'text-[var(--accent-amber)] border-[var(--accent-amber)] bg-amber-500/5'
                : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-main)]'
            }`}
          >
            <i className="fa-solid fa-clock-rotate-left"></i>
            Research History
          </button>

          <button
            onClick={() => {
              setActiveTab('settings');
              loadGeminiConfig();
            }}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === 'settings'
                ? 'text-[var(--accent-amber)] border-[var(--accent-amber)] bg-amber-500/5'
                : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-main)]'
            }`}
          >
            <i className="fa-solid fa-gear"></i>
            System Config
          </button>
        </nav>

        {/* ========================================================
             TAB 1: RESEARCH ENGINE
             ======================================================== */}
        {activeTab === 'research' && (
          <div>
            {/* Control Panel Card */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 mb-4 shadow-lg">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2 text-sm font-bold font-brand uppercase tracking-wider text-[var(--text-main)]">
                  <i className="fa-solid fa-sliders text-[var(--accent-amber)]"></i>
                  Execution Parameters
                </div>
                <span className="font-mono text-[0.65rem] text-[var(--text-dim)]">
                  AS-RADAR-X V2 ENGINE
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="block text-[0.67rem] font-bold font-mono tracking-wider text-[var(--text-muted)] uppercase mb-1.5">
                    Photo Opportunities Count
                  </label>
                  <select
                    value={photoCount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setPhotoCount(val);
                      localStorage.setItem('as_radar_x_photo_count', String(val));
                    }}
                    disabled={isResearching}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded p-2.5 text-sm font-mono text-[var(--text-main)] outline-none"
                  >
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 10].map((num) => (
                      <option key={num} value={num}>
                        {num} {num === 1 ? 'Item' : 'Items'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[0.67rem] font-bold font-mono tracking-wider text-[var(--text-muted)] uppercase mb-1.5">
                    Video Opportunities Count
                  </label>
                  <select
                    value={videoCount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setVideoCount(val);
                      localStorage.setItem('as_radar_x_video_count', String(val));
                    }}
                    disabled={isResearching}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded p-2.5 text-sm font-mono text-[var(--text-main)] outline-none"
                  >
                    {[0, 1, 2, 3, 4, 5, 6, 8, 10].map((num) => (
                      <option key={num} value={num}>
                        {num} {num === 1 ? 'Item' : 'Items'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex sm:col-span-2 lg:col-span-1 justify-end">
                  <button
                    onClick={handleStartResearch}
                    disabled={isResearching}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[42px] px-6 rounded bg-[var(--accent-amber)] hover:bg-[var(--accent-amber-hover)] disabled:opacity-50 text-black font-bold text-xs uppercase tracking-wider shadow-[0_0_14px_var(--accent-amber-glow)] transition transform active:scale-95"
                  >
                    <i className={`fa-solid ${isResearching ? 'fa-spinner fa-spin' : 'fa-bolt'}`}></i>
                    {isResearching ? 'Research in Progress...' : "Start Today's Research"}
                  </button>
                </div>
              </div>
            </div>

            {/* Research Progress Panel */}
            {isResearching && (
              <div className="bg-gradient-to-b from-[var(--bg-card)] to-[var(--bg-panel)] border border-[var(--accent-cyan)] rounded-lg p-5 mb-4 shadow-xl">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
                  <div>
                    <div className="text-[var(--accent-cyan)] font-brand text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                      <i className="fa-solid fa-circle-notch fa-spin"></i>
                      Research Execution In Progress
                    </div>
                    <div className="text-[var(--text-muted)] font-mono text-xs mt-1">
                      {progressMessage}
                    </div>
                  </div>
                  <div className="text-[var(--accent-cyan)] font-mono font-bold text-sm bg-[var(--accent-cyan-soft)] px-3 py-1 rounded">
                    {formatTimer(elapsedSeconds)}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="relative w-full h-1.5 bg-[var(--bg-input)] rounded-full overflow-hidden mb-5">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--accent-amber)] to-[var(--accent-cyan)] transition-all duration-300"
                    style={{ width: `${Math.max(5, progressPercent)}%` }}
                  ></div>
                </div>

                {/* Stages Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 font-mono text-[0.68rem]">
                  {RESEARCH_STAGES.map((st, idx) => {
                    const currentIdx = RESEARCH_STAGES.findIndex((s) => s.id === researchStage);
                    const isCompleted = currentIdx >= 0 && idx < currentIdx;
                    const isCurrent = st.id === researchStage;

                    return (
                      <div
                        key={st.id}
                        className={`flex items-center gap-2 p-2 rounded border ${
                          isCompleted
                            ? 'text-[var(--status-success)] border-emerald-500/20 bg-emerald-500/5'
                            : isCurrent
                            ? 'text-[var(--accent-cyan)] border-[var(--accent-cyan)] bg-[var(--accent-cyan-soft)] font-bold'
                            : 'text-[var(--text-dim)] border-[var(--border-subtle)] bg-[var(--bg-input)]'
                        }`}
                      >
                        {isCompleted ? (
                          <i className="fa-solid fa-check"></i>
                        ) : isCurrent ? (
                          <i className="fa-solid fa-spinner fa-spin"></i>
                        ) : (
                          <i className="fa-regular fa-circle text-[0.6rem]"></i>
                        )}
                        <span className="truncate">{st.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Error Panel */}
            {errorInfo && !isResearching && (
              <div className="bg-[var(--bg-card)] border border-[var(--status-error)] rounded-lg p-5 mb-4 shadow-lg">
                <div className="flex items-center gap-2 text-[var(--status-error)] font-bold text-sm uppercase">
                  <i className="fa-solid fa-triangle-exclamation"></i>
                  Research Engine Failure
                </div>
                <div className="text-[var(--text-main)] text-xs mt-2 font-mono">
                  {errorInfo.message}
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleStartResearch}
                    className="py-1.5 px-3 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] rounded text-xs font-bold uppercase text-[var(--text-main)] inline-flex items-center gap-2"
                  >
                    <i className="fa-solid fa-rotate-right"></i>
                    Retry
                  </button>
                  {errorInfo.details && (
                    <button
                      onClick={() => setShowTechDetails((prev) => !prev)}
                      className="py-1.5 px-3 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] rounded text-xs font-bold uppercase text-[var(--text-dim)] inline-flex items-center gap-2"
                    >
                      <i className="fa-solid fa-code"></i>
                      {showTechDetails ? 'Hide Technical Details' : 'Technical Details'}
                    </button>
                  )}
                </div>
                {showTechDetails && errorInfo.details && (
                  <pre className="mt-3 p-3 bg-[var(--code-bg)] border border-[var(--border-color)] rounded text-[var(--status-error)] text-[0.68rem] font-mono whitespace-pre-wrap overflow-x-auto">
                    {errorInfo.details}
                  </pre>
                )}
              </div>
            )}

            {/* Report Summary Area */}
            {currentReport && !isResearching && (
              <div>
                {/* Meta & Metrics */}
                <div className="mb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <h1 className="text-xl font-bold font-brand uppercase tracking-wide">
                      Today&apos;s Intelligence Report
                    </h1>
                    <div className="text-[var(--text-dim)] font-mono text-xs">
                      DATE: {currentReport.date} | DURATION: {currentReport.duration || '—'}
                    </div>
                  </div>
                  {currentReport.sources_processed?.length > 0 && (
                    <div className="text-[var(--text-muted)] font-mono text-xs mt-1">
                      SOURCES CHECKED: {currentReport.sources_processed.join(', ')}
                    </div>
                  )}
                </div>

                {/* Metrics 4-Card Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4">
                    <span className="block text-[0.62rem] font-bold font-mono tracking-wider text-[var(--text-dim)] uppercase">
                      Opportunities Found
                    </span>
                    <span className="block text-2xl font-bold font-mono text-[var(--accent-amber)] mt-1">
                      {totalOpportunities}
                    </span>
                    <span className="block text-[0.68rem] text-[var(--text-dim)] mt-0.5">
                      Evidence-backed items
                    </span>
                  </div>

                  <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4">
                    <span className="block text-[0.62rem] font-bold font-mono tracking-wider text-[var(--text-dim)] uppercase">
                      Photo Ideas
                    </span>
                    <span className="block text-2xl font-bold font-mono text-[var(--accent-amber)] mt-1">
                      {currentReport.photos?.length || 0}
                    </span>
                    <span className="block text-[0.68rem] text-[var(--text-dim)] mt-0.5">
                      Requested: {currentReport.photo_count_requested}
                    </span>
                  </div>

                  <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4">
                    <span className="block text-[0.62rem] font-bold font-mono tracking-wider text-[var(--text-dim)] uppercase">
                      Video Ideas
                    </span>
                    <span className="block text-2xl font-bold font-mono text-[var(--accent-cyan)] mt-1">
                      {currentReport.videos?.length || 0}
                    </span>
                    <span className="block text-[0.68rem] text-[var(--text-dim)] mt-0.5">
                      Requested: {currentReport.video_count_requested}
                    </span>
                  </div>

                  <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4">
                    <span className="block text-[0.62rem] font-bold font-mono tracking-wider text-[var(--text-dim)] uppercase">
                      Research Duration
                    </span>
                    <span className="block text-2xl font-bold font-mono text-[var(--text-main)] mt-1">
                      {currentReport.duration || '—'}
                    </span>
                    <span className="block text-[0.68rem] text-[var(--text-dim)] mt-0.5">
                      Pipeline execution
                    </span>
                  </div>
                </div>

                {/* Evidence Summary & Warnings Banner */}
                {currentReport.evidence_summary && (
                  <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 mb-6">
                    <div className="text-[0.68rem] font-bold font-mono text-[var(--accent-amber)] tracking-wider uppercase mb-1 flex items-center gap-2">
                      <i className="fa-solid fa-chart-pie"></i>
                      Evidence & Strategic Synthesis Summary
                    </div>
                    <p className="text-xs text-[var(--text-main)] leading-relaxed font-mono">
                      {currentReport.evidence_summary}
                    </p>
                    {currentReport.warnings?.length ? (
                      <div className="mt-3 pt-2 border-t border-[var(--border-subtle)] space-y-1">
                        {currentReport.warnings.map((w, i) => (
                          <div key={i} className="text-[0.7rem] text-[var(--status-warning)] font-mono flex items-center gap-1.5">
                            <i className="fa-solid fa-triangle-exclamation"></i>
                            <span>{w}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[0.68rem] text-[var(--text-dim)] font-mono">
                        Job: <strong className="text-[var(--text-main)]">{currentReport.job_id}</strong> &middot; Raw evidence and report history preserved in SQLite.
                      </span>
                      <button
                        onClick={() => handleOpenJobEvidence(currentReport.job_id)}
                        className="inline-flex items-center gap-1.5 py-1 px-3 bg-[var(--bg-input)] hover:border-[var(--accent-amber)] border border-[var(--border-color)] rounded text-xs font-mono text-[var(--accent-amber)] transition"
                      >
                        <i className="fa-solid fa-database"></i>
                        <span>Inspect Stored Raw Evidence Signals</span>
                      </button>
                    </div>
                  </div>
                )}

                {currentReport.web_research && (
                  <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4 mb-6">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="text-[0.68rem] font-bold font-mono text-[var(--accent-cyan)] tracking-wider uppercase flex items-center gap-2">
                        <i className="fa-solid fa-globe"></i> Grounded Web Research Layer
                      </div>
                      <span className="text-[0.62rem] font-mono text-[var(--text-dim)]">
                        {currentReport.web_research.sources?.length || 0} grounded sources · {currentReport.web_research.search_queries?.length || 0} search queries
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-main)] leading-relaxed">{currentReport.web_research.summary}</p>
                    {currentReport.web_research.findings?.length ? (
                      <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2">
                        {currentReport.web_research.findings.slice(0, 8).map((finding, i) => (
                          <div key={i} className="p-3 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded">
                            <div className="text-[0.7rem] font-bold text-[var(--accent-cyan)] mb-1">{finding.topic}</div>
                            <div className="text-[0.68rem] text-[var(--text-main)] leading-relaxed">{finding.observed_fact}</div>
                            <div className="text-[0.66rem] text-[var(--text-muted)] mt-1.5">Commercial signal: {finding.commercial_signal}</div>
                            <div className="text-[0.66rem] text-[var(--text-muted)] mt-1">Differentiation: {finding.supply_or_differentiation_signal}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {currentReport.web_research.sources?.length ? (
                      <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                        <div className="text-[0.63rem] font-bold font-mono uppercase text-[var(--text-dim)] mb-2">Grounded sources</div>
                        <div className="space-y-1">
                          {currentReport.web_research.sources.slice(0, 12).map((source) => (
                            <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="block text-[0.67rem] text-[var(--accent-cyan)] hover:underline truncate">
                              [{source.id}] {source.title} · {source.url}
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Photo Opportunities Section */}
                <section className="mb-8">
                  <div className="flex items-center gap-2 text-[var(--accent-amber)] font-brand text-base font-bold uppercase tracking-wider mb-3">
                    <i className="fa-solid fa-camera"></i>
                    <span>Photo Opportunities</span>
                    <span className="text-xs font-mono text-[var(--text-dim)]">
                      ({currentReport.photos?.length || 0})
                    </span>
                  </div>

                  {currentReport.photos?.length ? (
                    <div className="flex flex-col gap-4">
                      {currentReport.photos.map((photo, idx) => (
                        <PhotoCard
                          key={photo.id || `photo-${idx}`}
                          photo={photo}
                          index={idx + 1}
                          isOpen={!!openEvidenceMap[`p-${idx}`]}
                          onToggleEvidence={() =>
                            setOpenEvidenceMap((prev) => ({
                              ...prev,
                              [`p-${idx}`]: !prev[`p-${idx}`]
                            }))
                          }
                          copiedKey={copiedKey}
                          onCopy={copyToClipboard}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded p-6 text-center text-xs text-[var(--text-dim)]">
                      No photo opportunities returned for this run.
                    </div>
                  )}
                </section>

                {/* Video Opportunities Section */}
                <section className="mb-8">
                  <div className="flex items-center gap-2 text-[var(--accent-cyan)] font-brand text-base font-bold uppercase tracking-wider mb-3">
                    <i className="fa-solid fa-video"></i>
                    <span>Video Opportunities</span>
                    <span className="text-xs font-mono text-[var(--text-dim)]">
                      ({currentReport.videos?.length || 0})
                    </span>
                  </div>

                  {currentReport.videos?.length ? (
                    <div className="flex flex-col gap-4">
                      {currentReport.videos.map((video, idx) => (
                        <VideoCard
                          key={video.id || `video-${idx}`}
                          video={video}
                          index={idx + 1}
                          isOpen={!!openEvidenceMap[`v-${idx}`]}
                          onToggleEvidence={() =>
                            setOpenEvidenceMap((prev) => ({
                              ...prev,
                              [`v-${idx}`]: !prev[`v-${idx}`]
                            }))
                          }
                          copiedKey={copiedKey}
                          onCopy={copyToClipboard}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded p-6 text-center text-xs text-[var(--text-dim)]">
                      No video opportunities returned for this run.
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* Empty State before any research */}
            {!currentReport && !isResearching && !errorInfo && (
              <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-12 text-center shadow-md">
                <div className="text-4xl text-[var(--border-color)] mb-3">
                  <i className="fa-solid fa-compass"></i>
                </div>
                <div className="text-sm font-bold font-brand uppercase tracking-wider text-[var(--text-main)] mb-1">
                  No Report Generated Yet
                </div>
                <p className="max-w-md mx-auto text-xs text-[var(--text-muted)]">
                  Configure your target photo and video quantities above, then click &ldquo;Start Today&apos;s Research&rdquo; to execute the market collection pipeline.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ========================================================
             TAB: LIVE DATA FEEDS & PROBE
             ======================================================== */}
        {activeTab === 'sources' && (
          <div className="space-y-6">
            {/* Control & Overview Card */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold font-brand uppercase tracking-wider text-[var(--text-main)]">
                    <i className="fa-solid fa-satellite-dish text-[var(--accent-amber)]"></i>
                    Live Stock Market Data Feeds & Real-Time Probe
                  </div>
                  <p className="text-xs text-[var(--text-muted)] font-mono mt-1">
                    Live network probing across Adobe Stock, Shutterstock, and Pond5 without mock data.
                  </p>
                </div>

                <button
                  onClick={() => runSourcesProbe(true)}
                  disabled={isProbing}
                  className="inline-flex items-center gap-2 py-2 px-5 bg-[var(--accent-amber)] hover:bg-[var(--accent-amber-hover)] disabled:opacity-50 text-black font-bold text-xs uppercase tracking-wider rounded shadow-[0_0_12px_var(--accent-amber-glow)] transition transform active:scale-95"
                >
                  <i className={`fa-solid ${isProbing ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'}`}></i>
                  <span>{isProbing ? 'Probing Stock Providers...' : 'Test Feeds & Probe Live Data'}</span>
                </button>
              </div>

              {/* Status / Probe Meta Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                <div className="p-3 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded font-mono">
                  <span className="block text-[0.62rem] text-[var(--text-dim)] uppercase">Total Real Signals</span>
                  <span className="block text-xl font-bold text-[var(--accent-amber)] mt-0.5">
                    {probeData?.totalEvidenceCount ?? (isProbing ? '...' : 'Available')}
                  </span>
                </div>
                <div className="p-3 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded font-mono">
                  <span className="block text-[0.62rem] text-[var(--text-dim)] uppercase">Probed At</span>
                  <span className="block text-xs font-bold text-[var(--text-main)] mt-1 truncate">
                    {probeData?.probedAt ? new Date(probeData.probedAt).toLocaleTimeString() : 'Ready'}
                  </span>
                </div>
                <div className="p-3 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded font-mono">
                  <span className="block text-[0.62rem] text-[var(--text-dim)] uppercase">Probe Duration</span>
                  <span className="block text-xs font-bold text-[var(--text-main)] mt-1">
                    {probeData?.duration || '—'}
                  </span>
                </div>
                <div className="p-3 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded font-mono">
                  <span className="block text-[0.62rem] text-[var(--text-dim)] uppercase">Storage Target</span>
                  <span className="block text-xs font-bold text-emerald-400 mt-1 truncate">
                    SQLite Store
                  </span>
                </div>
              </div>
            </div>

            {/* Providers 3-Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {['Adobe Stock', 'Shutterstock', 'Pond5'].map((name) => {
                const srcData = probeData?.sources?.[name];
                const overall = srcData?.overall || sourcesStatus[name] || 'NOT CHECKED';
                const isAvail = overall === 'AVAILABLE';
                const isBlocked = overall === 'BLOCKED';

                return (
                  <div
                    key={name}
                    className={`bg-[var(--bg-card)] border rounded-lg p-5 flex flex-col justify-between shadow-md transition ${
                      isAvail
                        ? 'border-emerald-500/30'
                        : isBlocked
                        ? 'border-red-500/30'
                        : 'border-[var(--border-color)]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-[var(--border-subtle)]">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              isAvail
                                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                                : 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]'
                            }`}
                          ></span>
                          <h3 className="font-brand font-bold text-sm text-[var(--text-main)] uppercase tracking-wider">
                            {name}
                          </h3>
                        </div>
                        <span
                          className={`text-[0.65rem] font-bold font-mono px-2 py-0.5 rounded uppercase ${
                            isAvail
                              ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/30'
                              : 'text-red-400 bg-red-500/10 border border-red-500/30'
                          }`}
                        >
                          {overall}
                        </span>
                      </div>

                      {/* Endpoints List */}
                      <div className="space-y-2 mb-4 font-mono text-xs">
                        <div className="text-[0.64rem] font-bold text-[var(--text-dim)] uppercase tracking-wider">
                          Monitored Endpoints & Live Status
                        </div>
                        {srcData?.endpoints?.map((ep: any, idx: number) => {
                          const epAvail = ep.status === 'AVAILABLE';
                          return (
                            <div
                              key={idx}
                              className="p-2 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded text-[0.7rem]"
                            >
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <span className="font-semibold text-[var(--text-main)] truncate">
                                  {ep.subSource}
                                </span>
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[0.6rem] font-bold uppercase ${
                                    epAvail
                                      ? 'text-emerald-400 bg-emerald-500/10'
                                      : 'text-amber-400 bg-amber-500/10'
                                  }`}
                                >
                                  {ep.status}
                                </span>
                              </div>
                              <div className="text-[0.62rem] text-[var(--text-dim)] truncate mb-1">
                                <a
                                  href={ep.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-[var(--accent-amber)] transition inline-flex items-center gap-1"
                                >
                                  <span>{ep.url}</span>
                                  <i className="fa-solid fa-arrow-up-right-from-square text-[0.55rem]"></i>
                                </a>
                              </div>
                              {ep.evidenceCount > 0 && (
                                <div className="text-[0.64rem] text-emerald-400">
                                  &bull; {ep.evidenceCount} real marketplace signals extracted
                                </div>
                              )}
                              {ep.notes && (
                                <div className="text-[0.62rem] text-[var(--text-dim)] mt-0.5">
                                  {ep.notes}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {(!srcData || !srcData.endpoints?.length) && (
                          <div className="p-2.5 bg-[var(--bg-input)] rounded text-[0.7rem] text-[var(--text-dim)]">
                            Click &ldquo;Test Feeds & Probe Live Data&rdquo; above to run real-time endpoint inspection.
                          </div>
                        )}
                      </div>
                    </div>

                    {isBlocked && (
                      <div className="p-2.5 bg-red-500/5 border border-red-500/20 rounded font-mono text-[0.65rem] text-red-300 leading-relaxed">
                        <i className="fa-solid fa-shield-halved mr-1"></i>
                        Security challenge detected on cloud IP. Zero fake data generated.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Extracted Signals Stream */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-4 mb-4 border-b border-[var(--border-subtle)]">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold font-brand uppercase text-[var(--text-main)]">
                    <i className="fa-solid fa-stream text-[var(--accent-amber)]"></i>
                    Real Evidence Signal Stream
                  </div>
                  <span className="text-[0.68rem] text-[var(--text-dim)] font-mono">
                    Live parsed data points feeding the Gemini strategic intelligence model.
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  <div className="flex items-center gap-1 bg-[var(--bg-input)] border border-[var(--border-color)] rounded p-1">
                    {['ALL', 'Adobe Stock', 'Shutterstock', 'Pond5'].map((f) => (
                      <button
                        key={f}
                        onClick={() => setProbeFilter(f)}
                        className={`py-1 px-2.5 rounded text-[0.68rem] font-mono font-bold transition ${
                          probeFilter === f
                            ? 'bg-[var(--accent-amber)] text-black'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    value={probeSearch}
                    onChange={(e) => setProbeSearch(e.target.value)}
                    placeholder="Search keywords or titles..."
                    className="bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded py-1 px-2.5 text-xs font-mono text-[var(--text-main)] outline-none"
                  />
                </div>
              </div>

              {/* Signals Cards */}
              {(() => {
                const allSamples: any[] = [];
                if (probeData?.sources) {
                  for (const src of Object.values(probeData.sources) as any[]) {
                    if (Array.isArray(src.evidenceSample)) {
                      allSamples.push(...src.evidenceSample);
                    }
                  }
                }

                const filtered = allSamples.filter((item) => {
                  if (probeFilter !== 'ALL' && item.source !== probeFilter) return false;
                  if (probeSearch.trim()) {
                    const term = probeSearch.toLowerCase();
                    const titleMatch = (item.raw_title || '').toLowerCase().includes(term);
                    const kwMatch = (item.raw_keywords || []).some((k: string) => k.toLowerCase().includes(term));
                    return titleMatch || kwMatch;
                  }
                  return true;
                });

                if (isProbing) {
                  return (
                    <div className="py-12 text-center text-xs font-mono text-[var(--accent-amber)]">
                      <i className="fa-solid fa-spinner fa-spin text-xl mb-2"></i>
                      <div>Probing stock marketplace endpoints and extracting real tokens...</div>
                    </div>
                  );
                }

                if (!filtered.length) {
                  return (
                    <div className="p-8 text-center bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded font-mono text-xs text-[var(--text-dim)]">
                      {probeData
                        ? 'No signals matched your filter criteria.'
                        : 'No live probe executed yet. Click "Test Feeds & Probe Live Data" above to fetch live signals.'}
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filtered.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--accent-amber)]/40 rounded transition font-mono flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span
                              className={`text-[0.62rem] font-bold px-2 py-0.5 rounded uppercase ${
                                item.source === 'Adobe Stock'
                                  ? 'text-red-300 bg-red-500/10 border border-red-500/20'
                                  : item.source === 'Shutterstock'
                                  ? 'text-amber-300 bg-amber-500/10 border border-amber-500/20'
                                  : 'text-cyan-300 bg-cyan-500/10 border border-cyan-500/20'
                              }`}
                            >
                              {item.source}
                            </span>
                            <span className="text-[0.62rem] text-[var(--text-dim)] uppercase">
                              {item.evidence_type?.replace(/_/g, ' ') || 'Market Observation'}
                            </span>
                          </div>

                          <h4 className="text-xs font-semibold text-[var(--text-main)] mb-2 leading-relaxed">
                            {item.raw_title}
                          </h4>

                          {item.raw_description && (
                            <p className="text-[0.7rem] text-[var(--text-muted)] mb-2 leading-normal">
                              {item.raw_description}
                            </p>
                          )}

                          {item.raw_keywords?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {item.raw_keywords.slice(0, 8).map((kw: string, kIdx: number) => (
                                <span
                                  key={kIdx}
                                  className="text-[0.62rem] py-0.5 px-1.5 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded text-[var(--text-dim)]"
                                >
                                  #{kw}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[0.62rem] text-[var(--text-dim)] mt-2">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-[var(--accent-amber)] truncate max-w-[200px] inline-flex items-center gap-1"
                          >
                            <span>{item.url}</span>
                            <i className="fa-solid fa-arrow-up-right-from-square text-[0.55rem]"></i>
                          </a>
                          <span>{item.collected_at ? new Date(item.collected_at).toLocaleTimeString() : ''}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ========================================================
             TAB 3: INTELLIGENCE SETUP
             ======================================================== */}
        {activeTab === 'instructions' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Gemini Analyst Instructions */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg">
              <div className="flex items-center gap-2 pb-3 mb-3 border-b border-[var(--border-subtle)] text-sm font-bold font-brand uppercase text-[var(--text-main)]">
                <i className="fa-solid fa-brain text-[var(--accent-amber)]"></i>
                Gemini Analyst Instructions
              </div>
              <p className="text-xs text-[var(--text-muted)] mb-3">
                Persistent strategic instructions supplied to the Gemini analyst layer along with collected evidence.
              </p>

              <textarea
                value={instructionsText}
                onChange={(e) => setInstructionsText(e.target.value.slice(0, 500))}
                rows={7}
                maxLength={500}
                placeholder="e.g. Focus on European B2B sustainable supply chain concepts. Prioritize high-resolution macro photography with authentic natural lighting..."
                className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded p-3 text-xs font-mono text-[var(--text-main)] outline-none resize-y"
              />

              <div className="flex items-center justify-between gap-3 mt-3">
                <span className="font-mono text-xs text-[var(--text-dim)]">
                  {instructionsText.length} / 500
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={handleClearInstructions}
                    type="button"
                    className="py-1.5 px-3 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] rounded text-xs font-bold uppercase text-[var(--text-main)]"
                  >
                    Clear
                  </button>
                  <button
                    onClick={handleSaveInstructions}
                    type="button"
                    className="py-1.5 px-4 bg-[var(--accent-amber)] hover:bg-[var(--accent-amber-hover)] rounded text-xs font-bold uppercase text-black"
                  >
                    Save Instructions
                  </button>
                </div>
              </div>
            </div>

            {/* Adobe Not Accepted Content */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg">
              <div className="flex items-center gap-2 pb-3 mb-3 border-b border-[var(--border-subtle)] text-sm font-bold font-brand uppercase text-[var(--text-main)]">
                <i className="fa-solid fa-ban text-[var(--status-error)]"></i>
                Adobe Not Accepted Content
              </div>
              <p className="text-xs text-[var(--text-muted)] mb-3">
                Store rejected topics, reasons, or cliches to supply as strict negative constraints during research.
              </p>

              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {rejectedItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-6 text-right font-mono text-xs text-[var(--text-dim)]">
                      {idx + 1}.
                    </span>
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => handleAddOrUpdateRejection(idx, e.target.value)}
                      className="flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--text-main)] outline-none"
                    />
                    <button
                      onClick={() => handleDeleteRejection(idx)}
                      className="p-1.5 text-[var(--text-dim)] hover:text-[var(--status-error)] transition"
                      title="Delete entry"
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                ))}

                {/* Dynamic Next Numbered Field */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="w-6 text-right font-mono text-xs text-[var(--accent-amber)]">
                    {rejectedItems.length + 1}.
                  </span>
                  <input
                    type="text"
                    value={newRejectionInput}
                    onChange={(e) => setNewRejectionInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newRejectionInput.trim()) {
                        handleAddOrUpdateRejection(rejectedItems.length, newRejectionInput);
                      }
                    }}
                    placeholder="Enter rejected topic / concept and press Enter..."
                    className="flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded px-2.5 py-1.5 text-xs font-mono text-[var(--text-main)] outline-none"
                  />
                  <button
                    onClick={() => {
                      if (newRejectionInput.trim()) {
                        handleAddOrUpdateRejection(rejectedItems.length, newRejectionInput);
                      }
                    }}
                    disabled={!newRejectionInput.trim()}
                    className="py-1 px-2.5 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] rounded text-xs font-mono text-[var(--accent-amber)] disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
             TAB 3: RESEARCH HISTORY
             ======================================================== */}
        {activeTab === 'history' && (
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 text-sm font-bold font-brand uppercase text-[var(--text-main)]">
                <i className="fa-solid fa-clock-rotate-left text-[var(--accent-amber)]"></i>
                Historical Research Reports
              </div>
              <button
                onClick={loadHistory}
                disabled={isLoadingHistory}
                className="py-1.5 px-3 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] rounded text-xs font-mono text-[var(--text-main)] inline-flex items-center gap-1.5"
              >
                <i className={`fa-solid fa-rotate ${isLoadingHistory ? 'fa-spin' : ''}`}></i>
                Refresh
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="bg-[var(--bg-panel)] text-[var(--text-dim)] text-[0.65rem] uppercase tracking-wider border-b border-[var(--border-subtle)]">
                    <th className="p-3">Job ID</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Photos</th>
                    <th className="p-3">Videos</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {historyList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center p-8 text-[var(--text-dim)]">
                        {isLoadingHistory ? 'Loading history records...' : 'No historical reports recorded yet.'}
                      </td>
                    </tr>
                  ) : (
                    historyList.map((rec) => (
                      <tr
                        key={rec.job_id}
                        className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)] transition"
                      >
                        <td className="p-3 font-bold text-[var(--text-main)]">{rec.job_id}</td>
                        <td className="p-3 text-[var(--text-muted)]">{rec.date}</td>
                        <td className="p-3 text-[var(--accent-amber)]">{rec.photo_count}</td>
                        <td className="p-3 text-[var(--accent-cyan)]">{rec.video_count}</td>
                        <td className="p-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[0.62rem] font-bold ${
                              rec.status === 'COMPLETED'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : 'bg-red-500/10 text-red-400 border border-red-500/30'
                            }`}
                          >
                            {rec.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleLoadHistoricalReport(rec.job_id)}
                            className="py-1 px-2.5 bg-[var(--bg-panel)] hover:bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent-amber)] rounded text-xs font-mono text-[var(--text-main)] transition"
                          >
                            View Report
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================
             TAB 4: SYSTEM CONFIG
             ======================================================== */}
        {activeTab === 'settings' && (
          <div className="space-y-6 max-w-4xl">
            {/* Gemini API & Strategic Engine Configuration */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2 text-sm font-bold font-brand uppercase text-[var(--text-main)]">
                  <i className="fa-solid fa-brain text-[var(--accent-amber)]"></i>
                  Gemini API &amp; Strategic Engine Configuration
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[0.65rem] font-mono font-bold uppercase ${
                      geminiConfig.hasKey
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-red-500/10 text-red-400 border border-red-500/30'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        geminiConfig.hasKey ? 'bg-emerald-400' : 'bg-red-400'
                      }`}
                    ></span>
                    {geminiConfig.hasKey ? 'API KEY CONFIGURED' : 'API KEY MISSING'}
                  </span>
                </div>
              </div>

              {/* API Key Status Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 font-mono text-xs">
                <div className="p-3 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded">
                  <span className="text-[var(--text-dim)] block text-[0.65rem] uppercase mb-1">
                    Active Gemini Key (Masked)
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[var(--text-main)] tracking-wider">
                      {geminiConfig.activeKeyMasked}
                    </span>
                    <span className="text-[0.62rem] text-[var(--text-muted)]">
                      {geminiConfig.hasCustomKey
                        ? 'Source: SQLite Database'
                        : geminiConfig.hasEnvKey
                        ? 'Source: Server .env'
                        : 'None'}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded">
                  <span className="text-[var(--text-dim)] block text-[0.65rem] uppercase mb-1">
                    Strategic AI Model
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[var(--accent-amber)]">
                      {geminiConfig.activeModel}
                    </span>
                    <span className="text-[0.62rem] text-[var(--text-muted)]">
                      @google/genai SDK
                    </span>
                  </div>
                </div>
              </div>

              {/* Test Feedback Message */}
              {geminiTestFeedback && (
                <div
                  className={`p-3 rounded border font-mono text-xs mb-4 flex items-start gap-2 ${
                    geminiTestFeedback.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                  }`}
                >
                  <i
                    className={`fa-solid ${
                      geminiTestFeedback.success ? 'fa-circle-check text-emerald-400' : 'fa-circle-xmark text-red-400'
                    } mt-0.5`}
                  ></i>
                  <div className="flex-1 leading-relaxed">
                    <strong>{geminiTestFeedback.success ? 'Success: ' : 'Error: '}</strong>
                    {geminiTestFeedback.message}
                  </div>
                </div>
              )}

              {/* Form Controls */}
              <div className="space-y-4 mb-5">
                <div>
                  <label className="block text-[0.68rem] font-bold font-mono tracking-wider text-[var(--text-muted)] uppercase mb-1.5">
                    Select Strategic Gemini Model
                  </label>
                  <select
                    value={selectedModelInput}
                    onChange={(e) => setSelectedModelInput(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded p-2.5 text-xs font-mono text-[var(--text-main)] outline-none"
                  >
                    <option value="gemini-3.8-flash">
                      gemini-3.8-flash (Recommended: Ultra-fast synthesis &amp; commercial analysis)
                    </option>
                    <option value="gemini-3.1-pro-preview">
                      gemini-3.1-pro-preview (Deep reasoning, complex stock market clustering)
                    </option>
                    <option value="gemini-3.1-flash-lite">
                      gemini-3.1-flash-lite (Cost-effective low latency)
                    </option>
                    <option value="gemini-flash-latest">
                      gemini-flash-latest (Stable alias)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-[0.68rem] font-bold font-mono tracking-wider text-[var(--text-muted)] uppercase mb-1.5 flex items-center justify-between">
                    <span>Update / Enter Custom Gemini API Key</span>
                    <button
                      type="button"
                      onClick={() => setShowApiKeyText(!showApiKeyText)}
                      className="text-[0.62rem] text-[var(--accent-cyan)] hover:underline capitalize"
                    >
                      {showApiKeyText ? 'Hide Key' : 'Show Key'}
                    </button>
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKeyText ? 'text' : 'password'}
                      value={geminiApiKeyInput}
                      onChange={(e) => setGeminiApiKeyInput(e.target.value)}
                      placeholder={
                        geminiConfig.hasKey
                          ? 'Leave empty to keep current key, or paste new AIzaSy... key to update'
                          : 'Paste your Gemini API Key here (AIzaSy...)'
                      }
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded p-2.5 text-xs font-mono text-[var(--text-main)] outline-none pr-10"
                    />
                  </div>
                  <span className="block text-[0.68rem] text-[var(--text-dim)] mt-1 font-mono">
                    Keys entered here are saved in server-side SQLite (<code className="text-[var(--text-muted)]">user_settings</code>) and proxied on the server.
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={handleSaveGeminiConfig}
                  disabled={isSavingGemini}
                  className="py-2 px-5 bg-[var(--accent-amber)] hover:bg-[var(--accent-amber-hover)] disabled:opacity-50 rounded font-bold text-xs uppercase text-black flex items-center gap-2 transition"
                >
                  {isSavingGemini && <i className="fa-solid fa-spinner fa-spin"></i>}
                  <span>Save Gemini Configuration</span>
                </button>

                <button
                  type="button"
                  onClick={handleTestGemini}
                  disabled={isTestingGemini}
                  className="py-2 px-4 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] hover:border-[var(--accent-cyan)] rounded font-mono text-xs text-[var(--text-main)] flex items-center gap-2 transition"
                >
                  {isTestingGemini ? (
                    <>
                      <i className="fa-solid fa-circle-notch fa-spin text-[var(--accent-cyan)]"></i>
                      <span>Testing Gemini Connection...</span>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-plug text-[var(--accent-cyan)]"></i>
                      <span>Test Connection</span>
                    </>
                  )}
                </button>

                {geminiConfig.hasCustomKey && (
                  <button
                    type="button"
                    onClick={handleClearCustomApiKey}
                    className="py-2 px-3 bg-transparent hover:bg-red-500/10 text-red-400 border border-transparent hover:border-red-500/20 rounded font-mono text-xs transition"
                  >
                    Clear Custom Key (Reset to Env)
                  </button>
                )}
              </div>
            </div>

            {/* Architecture & API Key Location Guide Card */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg">
              <div className="flex items-center gap-2 pb-3 mb-3 border-b border-[var(--border-subtle)] text-sm font-bold font-brand uppercase text-[var(--text-main)]">
                <i className="fa-solid fa-code text-[var(--accent-cyan)]"></i>
                Gemini API Architecture &amp; Key Locations Guide
              </div>
              <p className="text-xs text-[var(--text-muted)] font-mono mb-4 leading-relaxed">
                AS-Radar-X uses the modern <strong className="text-[var(--text-main)]">@google/genai</strong> SDK. Here is where the Gemini API is configured and how you can modify it:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
                <div className="p-3 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded flex flex-col justify-between">
                  <div>
                    <div className="text-[var(--accent-amber)] font-bold mb-1 flex items-center gap-1.5">
                      <i className="fa-solid fa-sliders"></i>
                      1. In-App Web UI
                    </div>
                    <div className="text-[0.7rem] text-[var(--text-muted)] leading-relaxed">
                      Configure right here on this screen. Saved directly into SQLite (<code className="text-[var(--text-dim)]">user_settings</code> table).
                    </div>
                  </div>
                  <div className="mt-3 text-[0.62rem] text-emerald-400 font-bold">
                    ✓ No server restart needed
                  </div>
                </div>

                <div className="p-3 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded flex flex-col justify-between">
                  <div>
                    <div className="text-[var(--accent-cyan)] font-bold mb-1 flex items-center gap-1.5">
                      <i className="fa-solid fa-file-shield"></i>
                      2. Server .env File
                    </div>
                    <div className="text-[0.7rem] text-[var(--text-muted)] leading-relaxed">
                      Set <code className="text-[var(--text-main)] bg-[var(--bg-panel)] px-1 py-0.5 rounded">GEMINI_API_KEY=AIzaSy...</code> in your server environment or <code className="text-[var(--text-dim)]">.env</code> file.
                    </div>
                  </div>
                  <div className="mt-3 text-[0.62rem] text-emerald-400 font-bold">
                    ✓ Default server fallback
                  </div>
                </div>

                <div className="p-3 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded flex flex-col justify-between">
                  <div>
                    <div className="text-[var(--text-main)] font-bold mb-1 flex items-center gap-1.5">
                      <i className="fa-solid fa-file-code"></i>
                      3. Engine Codebase
                    </div>
                    <div className="text-[0.7rem] text-[var(--text-muted)] leading-relaxed">
                      Located in <code className="text-[var(--accent-amber)]">server/gemini/analyst.ts</code>. Handles prompt synthesis, schema validation, and automatic multi-model failover.
                    </div>
                  </div>
                  <div className="mt-3 text-[0.62rem] text-cyan-400 font-bold">
                    ✓ Full pipeline control
                  </div>
                </div>
              </div>
            </div>

            {/* General Infrastructure Card */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg">
              <div className="flex items-center gap-2 pb-3 mb-4 border-b border-[var(--border-subtle)] text-sm font-bold font-brand uppercase text-[var(--text-main)]">
                <i className="fa-solid fa-server text-[var(--accent-amber)]"></i>
                Backend &amp; Network Infrastructure
              </div>

              <div className="mb-4">
                <label className="block text-[0.68rem] font-bold font-mono tracking-wider text-[var(--text-muted)] uppercase mb-1.5">
                  Backend API Base URL
                </label>
                <input
                  type="text"
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  placeholder="Leave blank for same-origin (/api)"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded p-2.5 text-xs font-mono text-[var(--text-main)] outline-none"
                />
                <span className="block text-[0.68rem] text-[var(--text-dim)] mt-1 font-mono">
                  Example: https://your-backend.example.com (empty defaults to same-origin)
                </span>
              </div>

              <div className="space-y-2 mb-6 font-mono text-xs">
                <div className="p-3 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <strong className="text-[var(--text-main)]">SQLite Database:</strong>
                    <span className="text-[var(--text-dim)] ml-2">data/as_radar_x.sqlite (built-in Node.js v22 DatabaseSync)</span>
                  </div>
                  <span className="text-emerald-400 font-bold text-[0.65rem] uppercase">ACTIVE &amp; PERSISTED</span>
                </div>

                <div className="p-3 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <strong className="text-[var(--text-main)]">Live Data Collectors:</strong>
                    <span className="text-[var(--text-dim)] ml-2">Adobe Stock, Shutterstock, Pond5 live extractors</span>
                  </div>
                  <span className="text-emerald-400 font-bold text-[0.65rem] uppercase">LIVE PROBING</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    localStorage.setItem('as_radar_x_api_base', apiBaseUrl.trim());
                    showToast('Backend configuration saved.');
                  }}
                  className="py-2 px-5 bg-[var(--accent-amber)] hover:bg-[var(--accent-amber-hover)] rounded font-bold text-xs uppercase text-black"
                >
                  Save URL Config
                </button>
                <button
                  onClick={() => {
                    setActiveTab('sources');
                    runSourcesProbe(true);
                  }}
                  className="py-2 px-4 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] rounded font-mono text-xs text-[var(--text-main)]"
                >
                  Probe Live Feeds Now
                </button>
              </div>
            </div>

            {/* Export & Download Card */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2 text-sm font-bold font-brand uppercase text-[var(--text-main)]">
                  <i className="fa-solid fa-file-zipper text-[var(--accent-amber)]"></i>
                  Export &amp; Download Complete Source Code (.ZIP)
                </div>
                <span className="text-[0.65rem] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/20">
                  READY FOR OFFLINE / LOCAL RUN
                </span>
              </div>

              <p className="text-xs text-[var(--text-muted)] font-mono mb-4 leading-relaxed">
                You can download the entire AS-Radar-X application (frontend, backend, SQLite integration, Gemini analyst, stock collectors, and test suites) as a single clean <strong>.ZIP</strong> archive and run it directly on your computer with Node.js.
              </p>

              <div className="p-3 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded font-mono text-xs mb-4 space-y-2">
                <div className="font-bold text-[var(--text-main)] text-[0.72rem] uppercase mb-1 flex items-center gap-1.5">
                  <i className="fa-solid fa-terminal text-[var(--accent-cyan)]"></i>
                  How to run locally on your computer:
                </div>
                <div className="text-[var(--text-dim)] pl-2 border-l-2 border-[var(--border-color)] space-y-1 text-[0.68rem]">
                  <div>1. Extract the downloaded <code className="text-[var(--accent-amber)]">as-radar-x-project.zip</code> archive</div>
                  <div>2. Open terminal in the project folder and run: <code className="text-[var(--text-main)] bg-[var(--bg-panel)] px-1 py-0.5 rounded">npm install</code></div>
                  <div>3. Configure your key in <code className="text-[var(--text-main)]">.env</code>: <code className="text-[var(--accent-cyan)] bg-[var(--bg-panel)] px-1 py-0.5 rounded">GEMINI_API_KEY="AIzaSy..."</code></div>
                  <div>4. Launch the application: <code className="text-[var(--text-main)] bg-[var(--bg-panel)] px-1 py-0.5 rounded">npm run dev</code></div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <a
                  href={getApiUrl('/api/download-zip')}
                  download="as-radar-x-project.zip"
                  className="py-2.5 px-6 bg-[var(--accent-amber)] hover:bg-[var(--accent-amber-hover)] text-black font-bold font-mono text-xs uppercase rounded flex items-center gap-2 shadow-md transition"
                >
                  <i className="fa-solid fa-cloud-arrow-down text-sm"></i>
                  <span>Download Complete Project ZIP</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Raw Evidence Modal (SQLite) */}
      <EvidenceModal
        isOpen={evidenceModal.isOpen}
        jobId={evidenceModal.jobId}
        items={evidenceModal.items}
        isLoading={evidenceModal.isLoading}
        onClose={() => setEvidenceModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Footer */}
      <footer className="mt-16 text-center font-mono text-[0.66rem] text-[var(--text-dim)] tracking-wider">
        AS-RADAR-X · STOCK CONTENT MARKET INTELLIGENCE · REAL EVIDENCE ENGINE
      </footer>
    </div>
  );
}

// -------------------------------------------------------------
// Photo Opportunity Card Component
// -------------------------------------------------------------
interface PhotoCardProps {
  photo: PhotoOpportunity;
  index: number;
  isOpen: boolean;
  onToggleEvidence: () => void;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}

function PhotoCard({ photo, index, isOpen, onToggleEvidence, copiedKey, onCopy }: PhotoCardProps) {
  const tagsList = Array.isArray(photo.tags) ? photo.tags : [];
  const tagsCopyValue = tagsList.join(', ');

  return (
    <article className="relative bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 pl-6 shadow-md overflow-hidden before:content-[''] before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-[var(--accent-amber)]">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-2 mb-2">
        <div>
          <span className="inline-block px-2 py-0.5 mb-1.5 rounded bg-amber-500/10 text-[var(--accent-amber)] text-[0.65rem] font-bold font-mono tracking-wider">
            #{index} PHOTO OPPORTUNITY
          </span>
          <h3 className="text-base font-bold text-[var(--text-main)] leading-snug">
            {photo.title || 'Untitled Opportunity'}
          </h3>
        </div>

        <button
          onClick={() => onCopy(photo.title, `p-title-${index}`)}
          className="inline-flex items-center gap-1.5 py-1 px-2 bg-[var(--bg-input)] hover:border-[var(--accent-amber)] border border-[var(--border-color)] rounded text-[0.64rem] font-mono text-[var(--text-muted)] transition"
        >
          <i className={`fa-regular ${copiedKey === `p-title-${index}` ? 'fa-check text-[var(--status-success)]' : 'fa-copy'}`}></i>
          <span>{copiedKey === `p-title-${index}` ? 'COPIED' : 'COPY TITLE'}</span>
        </button>
      </div>

      {photo.description && (
        <div className="mb-4">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[0.64rem] font-bold font-mono uppercase tracking-wider text-[var(--text-dim)]">DESCRIPTION</span>
            <button onClick={() => onCopy(photo.description, `p-description-${index}`)} className="inline-flex items-center gap-1.5 py-0.5 px-2 bg-[var(--bg-input)] hover:border-[var(--accent-amber)] border border-[var(--border-color)] rounded text-[0.62rem] font-mono text-[var(--text-muted)] transition">
              <i className={`fa-regular ${copiedKey === `p-description-${index}` ? 'fa-check text-[var(--status-success)]' : 'fa-copy'}`}></i>
              <span>{copiedKey === `p-description-${index}` ? 'COPIED' : 'COPY DESCRIPTION'}</span>
            </button>
          </div>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">{photo.description}</p>
        </div>
      )}

      {/* Attributes Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 p-3 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded font-mono text-xs mb-4">
        {photo.why_selected && (
          <div>
            <div className="text-[var(--text-dim)] text-[0.62rem] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <i className="fa-solid fa-bullseye text-[var(--accent-amber)]"></i>
              Why Selected
            </div>
            <div className="text-[var(--text-main)] text-[0.76rem] mt-0.5">{photo.why_selected}</div>
          </div>
        )}

        {photo.commercial_use && (
          <div>
            <div className="text-[var(--text-dim)] text-[0.62rem] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <i className="fa-solid fa-briefcase text-[var(--accent-amber)]"></i>
              Commercial Use
            </div>
            <div className="text-[var(--text-main)] text-[0.76rem] mt-0.5">{photo.commercial_use}</div>
          </div>
        )}

        {photo.visual_angle && (
          <div>
            <div className="text-[var(--text-dim)] text-[0.62rem] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <i className="fa-solid fa-eye text-[var(--accent-amber)]"></i>
              Visual Angle / Gap
            </div>
            <div className="text-[var(--text-main)] text-[0.76rem] mt-0.5">{photo.visual_angle}</div>
          </div>
        )}

        {photo.longevity && (
          <div>
            <div className="text-[var(--text-dim)] text-[0.62rem] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <i className="fa-solid fa-hourglass-half text-[var(--accent-amber)]"></i>
              Longevity Profile
            </div>
            <div className="text-[var(--text-main)] text-[0.76rem] mt-0.5">{photo.longevity}</div>
          </div>
        )}

        {photo.trend_dependence && (
          <div>
            <div className="text-[var(--text-dim)] text-[0.62rem] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <i className="fa-solid fa-chart-line text-[var(--accent-amber)]"></i>
              Trend Dependence
            </div>
            <div className="text-[var(--text-main)] text-[0.76rem] mt-0.5">{photo.trend_dependence}</div>
          </div>
        )}
      </div>

      {photo.production_spec && Object.keys(photo.production_spec).length > 0 && (
        <div className="p-3 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded mb-4">
          <div className="text-[0.64rem] font-bold font-mono uppercase tracking-wider text-[var(--accent-amber)] mb-2">
            Production Specification
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {Object.entries(photo.production_spec).map(([key, value]) => value ? (
              <div key={key}>
                <div className="text-[0.58rem] uppercase font-mono text-[var(--text-dim)] font-bold">{key.replace(/_/g, ' ')}</div>
                <div className="text-[0.68rem] text-[var(--text-main)] mt-0.5">{String(value)}</div>
              </div>
            ) : null)}
          </div>
        </div>
      )}

      {photo.differentiation_strategy && (
        <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded mb-4">
          <div className="text-[0.64rem] font-bold font-mono uppercase tracking-wider text-emerald-400 mb-1">Why This Is Different</div>
          <div className="text-xs text-[var(--text-main)] leading-relaxed">{photo.differentiation_strategy}</div>
        </div>
      )}

      {/* AI Image Generation Prompt Box */}
      {photo.prompt && (
        <div className="p-3 bg-[var(--code-bg)] border border-[var(--border-color)] rounded mb-4">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[0.64rem] font-bold font-mono uppercase tracking-wider text-[var(--text-dim)] flex items-center gap-1.5">
              <i className="fa-solid fa-wand-magic-sparkles text-[var(--accent-amber)]"></i>
              AI Image Generation Prompt
            </span>
            <button
              onClick={() => onCopy(photo.prompt, `p-prompt-${index}`)}
              className="inline-flex items-center gap-1.5 py-0.5 px-2 bg-[var(--bg-input)] hover:border-[var(--accent-amber)] border border-[var(--border-color)] rounded text-[0.62rem] font-mono text-[var(--text-muted)] transition"
            >
              <i className={`fa-regular ${copiedKey === `p-prompt-${index}` ? 'fa-check text-[var(--status-success)]' : 'fa-copy'}`}></i>
              <span>{copiedKey === `p-prompt-${index}` ? 'COPIED' : 'COPY PROMPT'}</span>
            </button>
          </div>
          <p className="font-mono text-xs text-[var(--text-main)] whitespace-pre-wrap leading-relaxed select-all">
            {photo.prompt}
          </p>
        </div>
      )}

      {/* Stock Keywords / Tags */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[0.64rem] font-bold font-mono uppercase tracking-wider text-[var(--text-dim)] flex items-center gap-1.5">
            <i className="fa-solid fa-tags text-[var(--accent-amber)]"></i>
            Stock Keywords / Tags ({tagsList.length})
          </span>
          {tagsList.length > 0 && (
            <button
              onClick={() => onCopy(tagsCopyValue, `p-tags-${index}`)}
              className="inline-flex items-center gap-1.5 py-0.5 px-2 bg-[var(--bg-input)] hover:border-[var(--accent-amber)] border border-[var(--border-color)] rounded text-[0.62rem] font-mono text-[var(--text-muted)] transition"
            >
              <i className={`fa-regular ${copiedKey === `p-tags-${index}` ? 'fa-check text-[var(--status-success)]' : 'fa-copy'}`}></i>
              <span>{copiedKey === `p-tags-${index}` ? 'COPIED' : 'COPY TAGS'}</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {tagsList.map((tag, tIdx) => (
            <span
              key={tIdx}
              className="inline-block py-0.5 px-2 bg-[var(--bg-panel)] border border-[var(--border-color)] rounded text-[0.66rem] font-mono text-[var(--text-muted)]"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Traceable Market Evidence Accordion */}
      {photo.evidence && Object.keys(photo.evidence).length > 0 && (
        <div className="mt-4 pt-3 border-t border-dashed border-[var(--border-color)]">
          <button
            onClick={onToggleEvidence}
            className="inline-flex items-center gap-1.5 py-1 px-3 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] rounded text-xs font-mono text-[var(--text-main)] transition"
          >
            <i className="fa-solid fa-chart-line text-[var(--accent-amber)]"></i>
            <span>{isOpen ? 'Hide Market Evidence' : 'View Market Evidence & Traceability'}</span>
          </button>

          {isOpen && (
            <div className="mt-3 p-3 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded font-mono text-xs space-y-1.5">
              <div className="text-[0.66rem] font-bold uppercase tracking-wider text-[var(--accent-amber)] mb-1">
                Market Traceability Record
              </div>
              {Object.entries(photo.evidence).map(([k, v]) => (
                <div key={k} className="text-[0.72rem] text-[var(--text-main)]">
                  <strong className="text-[var(--text-dim)] uppercase">{k.replace(/_/g, ' ')}: </strong>
                  {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// -------------------------------------------------------------
// Video Opportunity Card Component
// -------------------------------------------------------------
interface VideoCardProps {
  video: VideoOpportunity;
  index: number;
  isOpen: boolean;
  onToggleEvidence: () => void;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}

function VideoCard({ video, index, isOpen, onToggleEvidence, copiedKey, onCopy }: VideoCardProps) {
  const tagsList = Array.isArray(video.tags) ? video.tags : [];
  const tagsCopyValue = tagsList.join(', ');

  return (
    <article className="relative bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 pl-6 shadow-md overflow-hidden before:content-[''] before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-[var(--accent-cyan)]">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-2 mb-2">
        <div>
          <span className="inline-block px-2 py-0.5 mb-1.5 rounded bg-[var(--accent-cyan-soft)] text-[var(--accent-cyan)] text-[0.65rem] font-bold font-mono tracking-wider">
            #{index} VIDEO OPPORTUNITY
          </span>
          <h3 className="text-base font-bold text-[var(--text-main)] leading-snug">
            {video.title || 'Untitled Opportunity'}
          </h3>
        </div>

        <button
          onClick={() => onCopy(video.title, `v-title-${index}`)}
          className="inline-flex items-center gap-1.5 py-1 px-2 bg-[var(--bg-input)] hover:border-[var(--accent-cyan)] border border-[var(--border-color)] rounded text-[0.64rem] font-mono text-[var(--text-muted)] transition"
        >
          <i className={`fa-regular ${copiedKey === `v-title-${index}` ? 'fa-check text-[var(--status-success)]' : 'fa-copy'}`}></i>
          <span>{copiedKey === `v-title-${index}` ? 'COPIED' : 'COPY TITLE'}</span>
        </button>
      </div>

      {video.description && (
        <div className="mb-4">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[0.64rem] font-bold font-mono uppercase tracking-wider text-[var(--text-dim)]">DESCRIPTION</span>
            <button onClick={() => onCopy(video.description, `v-description-${index}`)} className="inline-flex items-center gap-1.5 py-0.5 px-2 bg-[var(--bg-input)] hover:border-[var(--accent-cyan)] border border-[var(--border-color)] rounded text-[0.62rem] font-mono text-[var(--text-muted)] transition">
              <i className={`fa-regular ${copiedKey === `v-description-${index}` ? 'fa-check text-[var(--status-success)]' : 'fa-copy'}`}></i>
              <span>{copiedKey === `v-description-${index}` ? 'COPIED' : 'COPY DESCRIPTION'}</span>
            </button>
          </div>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">{video.description}</p>
        </div>
      )}

      {/* Video Attributes Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 p-3 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded font-mono text-xs mb-4">
        {video.motion_value && (
          <div>
            <div className="text-[var(--text-dim)] text-[0.62rem] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <i className="fa-solid fa-film text-[var(--accent-cyan)]"></i>
              Why Motion Matters
            </div>
            <div className="text-[var(--text-main)] text-[0.76rem] mt-0.5">{video.motion_value}</div>
          </div>
        )}

        {video.commercial_use && (
          <div>
            <div className="text-[var(--text-dim)] text-[0.62rem] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <i className="fa-solid fa-briefcase text-[var(--accent-cyan)]"></i>
              Commercial Use
            </div>
            <div className="text-[var(--text-main)] text-[0.76rem] mt-0.5">{video.commercial_use}</div>
          </div>
        )}

        {video.motion_action && (
          <div>
            <div className="text-[var(--text-dim)] text-[0.62rem] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <i className="fa-solid fa-clapperboard text-[var(--accent-cyan)]"></i>
              Choreography & Motion
            </div>
            <div className="text-[var(--text-main)] text-[0.76rem] mt-0.5">{video.motion_action}</div>
          </div>
        )}

        {video.duration && (
          <div>
            <div className="text-[var(--text-dim)] text-[0.62rem] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <i className="fa-solid fa-stopwatch text-[var(--accent-cyan)]"></i>
              Duration
            </div>
            <div className="text-[var(--text-main)] text-[0.76rem] mt-0.5">{video.duration}</div>
          </div>
        )}

        {video.loop_potential && (
          <div>
            <div className="text-[var(--text-dim)] text-[0.62rem] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <i className="fa-solid fa-rotate text-[var(--accent-cyan)]"></i>
              Loop Potential
            </div>
            <div className="text-[var(--text-main)] text-[0.76rem] mt-0.5">{video.loop_potential}</div>
          </div>
        )}

        {video.aspect_ratio && (
          <div>
            <div className="text-[var(--text-dim)] text-[0.62rem] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <i className="fa-solid fa-expand text-[var(--accent-cyan)]"></i>
              Aspect Ratio
            </div>
            <div className="text-[var(--text-main)] text-[0.76rem] mt-0.5">{video.aspect_ratio}</div>
          </div>
        )}
      </div>

      {video.production_spec && Object.keys(video.production_spec).length > 0 && (
        <div className="p-3 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded mb-4">
          <div className="text-[0.64rem] font-bold font-mono uppercase tracking-wider text-[var(--accent-cyan)] mb-2">
            Production Specification
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {Object.entries(video.production_spec).map(([key, value]) => value ? (
              <div key={key}>
                <div className="text-[0.58rem] uppercase font-mono text-[var(--text-dim)] font-bold">{key.replace(/_/g, ' ')}</div>
                <div className="text-[0.68rem] text-[var(--text-main)] mt-0.5">{String(value)}</div>
              </div>
            ) : null)}
          </div>
        </div>
      )}

      {video.differentiation_strategy && (
        <div className="p-3 bg-cyan-500/5 border border-cyan-500/20 rounded mb-4">
          <div className="text-[0.64rem] font-bold font-mono uppercase tracking-wider text-[var(--accent-cyan)] mb-1">Why This Is Different</div>
          <div className="text-xs text-[var(--text-main)] leading-relaxed">{video.differentiation_strategy}</div>
        </div>
      )}

      {/* AI Video Prompt Box */}
      {video.prompt && (
        <div className="p-3 bg-[var(--code-bg)] border border-[var(--border-color)] rounded mb-4">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[0.64rem] font-bold font-mono uppercase tracking-wider text-[var(--text-dim)] flex items-center gap-1.5">
              <i className="fa-solid fa-video text-[var(--accent-cyan)]"></i>
              AI Video Generation Prompt
            </span>
            <button
              onClick={() => onCopy(video.prompt, `v-prompt-${index}`)}
              className="inline-flex items-center gap-1.5 py-0.5 px-2 bg-[var(--bg-input)] hover:border-[var(--accent-cyan)] border border-[var(--border-color)] rounded text-[0.62rem] font-mono text-[var(--text-muted)] transition"
            >
              <i className={`fa-regular ${copiedKey === `v-prompt-${index}` ? 'fa-check text-[var(--status-success)]' : 'fa-copy'}`}></i>
              <span>{copiedKey === `v-prompt-${index}` ? 'COPIED' : 'COPY PROMPT'}</span>
            </button>
          </div>
          <p className="font-mono text-xs text-[var(--text-main)] whitespace-pre-wrap leading-relaxed select-all">
            {video.prompt}
          </p>
        </div>
      )}

      {/* Tags */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[0.64rem] font-bold font-mono uppercase tracking-wider text-[var(--text-dim)] flex items-center gap-1.5">
            <i className="fa-solid fa-tags text-[var(--accent-cyan)]"></i>
            Stock Keywords / Tags ({tagsList.length})
          </span>
          {tagsList.length > 0 && (
            <button
              onClick={() => onCopy(tagsCopyValue, `v-tags-${index}`)}
              className="inline-flex items-center gap-1.5 py-0.5 px-2 bg-[var(--bg-input)] hover:border-[var(--accent-cyan)] border border-[var(--border-color)] rounded text-[0.62rem] font-mono text-[var(--text-muted)] transition"
            >
              <i className={`fa-regular ${copiedKey === `v-tags-${index}` ? 'fa-check text-[var(--status-success)]' : 'fa-copy'}`}></i>
              <span>{copiedKey === `v-tags-${index}` ? 'COPIED' : 'COPY TAGS'}</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {tagsList.map((tag, tIdx) => (
            <span
              key={tIdx}
              className="inline-block py-0.5 px-2 bg-[var(--bg-panel)] border border-[var(--border-color)] rounded text-[0.66rem] font-mono text-[var(--text-muted)]"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Evidence Accordion */}
      {video.evidence && Object.keys(video.evidence).length > 0 && (
        <div className="mt-4 pt-3 border-t border-dashed border-[var(--border-color)]">
          <button
            onClick={onToggleEvidence}
            className="inline-flex items-center gap-1.5 py-1 px-3 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] rounded text-xs font-mono text-[var(--text-main)] transition"
          >
            <i className="fa-solid fa-chart-line text-[var(--accent-cyan)]"></i>
            <span>{isOpen ? 'Hide Market Evidence' : 'View Market Evidence & Traceability'}</span>
          </button>

          {isOpen && (
            <div className="mt-3 p-3 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded font-mono text-xs space-y-1.5">
              <div className="text-[0.66rem] font-bold uppercase tracking-wider text-[var(--accent-cyan)] mb-1">
                Market Traceability Record
              </div>
              {Object.entries(video.evidence).map(([k, v]) => (
                <div key={k} className="text-[0.72rem] text-[var(--text-main)]">
                  <strong className="text-[var(--text-dim)] uppercase">{k.replace(/_/g, ' ')}: </strong>
                  {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// -------------------------------------------------------------
// Evidence Modal Component (Direct SQLite Inspection)
// -------------------------------------------------------------
function EvidenceModal({
  isOpen,
  jobId,
  items,
  isLoading,
  onClose
}: {
  isOpen: boolean;
  jobId: string;
  items: any[];
  isLoading: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[85vh] bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-2xl flex flex-col overflow-hidden animate-fade-in">
        {/* Modal Header */}
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-panel)]">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-database text-[var(--accent-amber)]"></i>
            <div>
              <h3 className="text-sm font-bold font-brand uppercase tracking-wider text-[var(--text-main)]">
                Stored Marketplace Evidence Signals (SQLite Store)
              </h3>
              <p className="text-[0.68rem] text-[var(--text-dim)] font-mono">
                Job ID: {jobId} · {items.length} stored raw evidence records
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] text-[var(--text-main)] flex items-center justify-center transition"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto font-mono text-xs space-y-3">
          {isLoading ? (
            <div className="py-12 text-center text-[var(--accent-amber)]">
              <i className="fa-solid fa-spinner fa-spin text-2xl mb-2"></i>
              <div>Loading stored signals from SQLite database...</div>
            </div>
          ) : !items.length ? (
            <div className="py-8 text-center text-[var(--text-dim)]">
              No evidence signals found for this job ID in SQLite store.
            </div>
          ) : (
            items.map((it, idx) => (
              <div
                key={idx}
                className="p-3 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded hover:border-[var(--accent-amber)]/40 transition"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span
                    className={`text-[0.65rem] font-bold px-2 py-0.5 rounded uppercase ${
                      it.source === 'Adobe Stock'
                        ? 'text-red-300 bg-red-500/10 border border-red-500/20'
                        : it.source === 'Shutterstock'
                        ? 'text-amber-300 bg-amber-500/10 border border-amber-500/20'
                        : 'text-cyan-300 bg-cyan-500/10 border border-cyan-500/20'
                    }`}
                  >
                    {it.source}
                  </span>
                  <span className="text-[0.62rem] text-[var(--text-dim)] uppercase">
                    {it.evidence_type?.replace(/_/g, ' ') || 'Signal'}
                  </span>
                </div>

                <div className="font-semibold text-xs text-[var(--text-main)] mb-1">
                  {it.raw_title}
                </div>

                {it.raw_keywords?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1 mb-2">
                    {it.raw_keywords.map((kw: string, kIdx: number) => (
                      <span
                        key={kIdx}
                        className="text-[0.62rem] py-0.5 px-1.5 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded text-[var(--text-dim)]"
                      >
                        #{kw}
                      </span>
                    ))}
                  </div>
                )}

                <div className="text-[0.64rem] text-[var(--text-dim)] truncate pt-1 border-t border-[var(--border-subtle)] flex items-center justify-between">
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--accent-amber)] truncate max-w-md inline-flex items-center gap-1"
                  >
                    <span>{it.url}</span>
                    <i className="fa-solid fa-arrow-up-right-from-square text-[0.55rem]"></i>
                  </a>
                  <span>{it.collected_at ? new Date(it.collected_at).toLocaleTimeString() : ''}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-panel)] flex items-center justify-between">
          <span className="text-[0.65rem] text-[var(--text-dim)] font-mono">
            SQLite Table: <code className="text-[var(--accent-amber)]">evidence_store</code>
          </span>
          <button
            onClick={onClose}
            className="py-1 px-4 bg-[var(--accent-amber)] hover:bg-[var(--accent-amber-hover)] text-black font-bold text-xs uppercase rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
