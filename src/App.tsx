import React, { useEffect, useRef, useState } from 'react';
import type {
  DiscordConfig,
  HistoryRecord,
  PhotoOpportunity,
  RedditConfig,
  ResearchReport,
  ResearchStage,
  VideoOpportunity
} from '../server/types.js';
import { PhotoCard } from './components/PhotoCard.js';
import { VideoCard } from './components/VideoCard.js';
import { EvidenceModal } from './components/EvidenceModal.js';
import { RedditConfigSection } from './components/RedditConfigSection.js';
import { DiscordConfigSection } from './components/DiscordConfigSection.js';

const RESEARCH_STAGES: Array<{ id: ResearchStage; label: string }> = [
  { id: 'INITIALIZING', label: 'INITIALIZING RESEARCH ENGINE' },
  { id: 'COLLECTING', label: 'COLLECTING DISCUSSION DATA (REDDIT & DISCORD)' },
  { id: 'NORMALIZING', label: 'NORMALIZING RESULTS' },
  { id: 'DEDUPLICATING', label: 'REMOVING DUPLICATES' },
  { id: 'CLUSTERING', label: 'CLUSTERING HUMAN COMPLAINTS & DEMAND' },
  { id: 'DEMAND_ANALYSIS', label: 'ANALYZING RECURRING DEMAND' },
  { id: 'SUPPLY_GAP', label: 'ANALYZING ASSET SHORTAGES / GAPS' },
  { id: 'COMMERCIAL_USE', label: 'MAPPING COMMERCIAL USE' },
  { id: 'LONGEVITY', label: 'CHECKING EVERGREEN LONGEVITY' },
  { id: 'SCORING', label: 'SCORING OPPORTUNITIES' },
  { id: 'PDF_ANALYSIS', label: 'ANALYZING ATTACHED PDF & VISUAL DIRECTIVES' },
  { id: 'PREPARING_PHOTOS', label: 'PREPARING PHOTO OPPORTUNITIES (SEO TITLES & 25 TAGS)' },
  { id: 'PREPARING_VIDEOS', label: 'PREPARING VIDEO OPPORTUNITIES (SEO TITLES & 25 TAGS)' },
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

  // Platform Data Switch state (Default: ON)
  const [platformDataEnabled, setPlatformDataEnabled] = useState<boolean>(true);

  // Live Sources Probe & Stream state
  const [probeData, setProbeData] = useState<any | null>(null);
  const [isProbing, setIsProbing] = useState<boolean>(false);
  const [probeFilter, setProbeFilter] = useState<string>('ALL');
  const [probeSearch, setProbeSearch] = useState<string>('');

  // Raw Evidence Modal state
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

  // PDF Reference Document & Directives state
  const [pdfConfig, setPdfConfig] = useState<{
    hasPdf: boolean;
    fileName: string;
    fileSize: number;
    instructions: string;
    uploadedAt: string;
  }>({
    hasPdf: false,
    fileName: '',
    fileSize: 0,
    instructions: '',
    uploadedAt: ''
  });
  const [pdfDirectivesInput, setPdfDirectivesInput] = useState<string>('');
  const [pendingPdfFile, setPendingPdfFile] = useState<{
    name: string;
    size: number;
    mimeType: string;
    base64: string;
  } | null>(null);
  const [isSavingPdf, setIsSavingPdf] = useState<boolean>(false);
  const [isClearingPdf, setIsClearingPdf] = useState<boolean>(false);
  const [pdfUploadError, setPdfUploadError] = useState<string | null>(null);

  // Toast banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Evidence open toggles
  const [openEvidenceMap, setOpenEvidenceMap] = useState<Record<string, boolean>>({});

  // System Config
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('');
  const [sourcesStatus, setSourcesStatus] = useState<Record<string, string>>({
    Reddit: 'NOT CHECKED',
    Discord: 'NOT CHECKED'
  });

  // Reddit Configuration State
  const [redditConfig, setRedditConfig] = useState<RedditConfig>({
    clientId: '',
    clientSecret: '',
    userAgent: 'AS-Radar-X/2.0 (by /u/saradagreats)',
    subreddits: [
      'StockPhotography',
      'AdobeStock',
      'Shutterstock',
      'graphic_design',
      'VideoEditing',
      'editors',
      'Midjourney',
      'blender',
      'vfx'
    ],
    timeframe: '24h',
    collectPosts: true,
    collectComments: true,
    connected: false,
    collectedCount: 0
  });

  // Discord Configuration State
  const [discordConfig, setDiscordConfig] = useState<DiscordConfig>({
    botToken: '',
    guilds: [],
    timeframe: '24h',
    collectMessages: true,
    collectThreads: true,
    connected: false,
    collectedCount: 0
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

  // Initial Data Loading
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

    loadPlatformData();
    loadRedditConfig();
    loadDiscordConfig();
    loadInstructions();
    loadRejectedContent();
    loadSourcesStatus();
    loadHistory();
    loadGeminiConfig();
    loadPdfConfig();

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

  // Load Platform Data Switch
  const loadPlatformData = async () => {
    try {
      const res = await fetch(getApiUrl('/api/platform-data'));
      if (res.ok) {
        const data = await res.json();
        setPlatformDataEnabled(data.enabled ?? true);
      }
    } catch {
      // ignore
    }
  };

  const handleTogglePlatformData = async () => {
    const nextVal = !platformDataEnabled;
    setPlatformDataEnabled(nextVal);
    try {
      const res = await fetch(getApiUrl('/api/platform-data'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextVal })
      });
      if (res.ok) {
        showToast(
          nextVal
            ? 'Platform Data ENABLED: Collecting live Reddit & Discord discussion data.'
            : 'Platform Data DISABLED: Running in pure Gemini AI intelligence and historical memory mode.'
        );
        loadSourcesStatus();
      }
    } catch (err: any) {
      showToast(`Failed to update toggle: ${err.message}`);
    }
  };

  // Load Reddit Config
  const loadRedditConfig = async () => {
    try {
      const res = await fetch(getApiUrl('/api/reddit/config'));
      if (res.ok) {
        const data = await res.json();
        setRedditConfig(data);
      }
    } catch {
      // ignore
    }
  };

  const handleSaveRedditConfig = async (updated: Partial<RedditConfig>) => {
    const res = await fetch(getApiUrl('/api/reddit/config'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
    if (res.ok) {
      const data = await res.json();
      setRedditConfig(data.config);
      loadSourcesStatus();
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  };

  // Load Discord Config
  const loadDiscordConfig = async () => {
    try {
      const res = await fetch(getApiUrl('/api/discord/config'));
      if (res.ok) {
        const data = await res.json();
        setDiscordConfig(data);
      }
    } catch {
      // ignore
    }
  };

  const handleSaveDiscordConfig = async (updated: Partial<DiscordConfig>) => {
    const res = await fetch(getApiUrl('/api/discord/config'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
    if (res.ok) {
      const data = await res.json();
      setDiscordConfig(data.config);
      loadSourcesStatus();
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  };

  // Instructions
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
        body: JSON.stringify({ instructions: instructionsText.slice(0, 1000) })
      });
      if (res.ok) {
        showToast('Analyst instructions saved successfully.');
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

  // PDF Reference Document & Directives Handlers
  const loadPdfConfig = async () => {
    try {
      const res = await fetch(getApiUrl('/api/pdf-instruction'));
      if (res.ok) {
        const data = await res.json();
        setPdfConfig({
          hasPdf: !!data.hasPdf,
          fileName: data.fileName || '',
          fileSize: data.fileSize || 0,
          instructions: data.instructions || '',
          uploadedAt: data.uploadedAt || ''
        });
        if (data.instructions) {
          setPdfDirectivesInput(data.instructions);
        }
      }
    } catch {
      // ignore
    }
  };

  const handlePdfFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPdfUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setPdfUploadError('Please select a valid PDF document (.pdf).');
      return;
    }

    if (file.size > 30 * 1024 * 1024) {
      setPdfUploadError('PDF file size exceeds 30MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      setPendingPdfFile({
        name: file.name,
        size: file.size,
        mimeType: 'application/pdf',
        base64
      });
      showToast(`PDF loaded: ${file.name} (${Math.round(file.size / 1024)} KB). Click "Save PDF & Directives" to save.`);
    };
    reader.onerror = () => {
      setPdfUploadError('Failed to read the local PDF file. Check permissions.');
    };
    reader.readAsDataURL(file);
  };

  const handleSavePdfConfig = async () => {
    setIsSavingPdf(true);
    setPdfUploadError(null);
    try {
      if (!pendingPdfFile && !pdfConfig.hasPdf) {
        setPdfUploadError('Please select a PDF file before saving.');
        setIsSavingPdf(false);
        return;
      }

      const payload: any = {
        instructions: pdfDirectivesInput.slice(0, 3000)
      };

      if (pendingPdfFile) {
        payload.fileName = pendingPdfFile.name;
        payload.fileSize = pendingPdfFile.size;
        payload.mimeType = pendingPdfFile.mimeType;
        payload.base64Data = pendingPdfFile.base64;
      } else {
        payload.fileName = pdfConfig.fileName;
        payload.fileSize = pdfConfig.fileSize;
        payload.mimeType = 'application/pdf';
      }

      const res = await fetch(getApiUrl('/api/pdf-instruction'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setPdfConfig({
          hasPdf: true,
          fileName: data.fileName || pendingPdfFile?.name || pdfConfig.fileName,
          fileSize: data.fileSize || pendingPdfFile?.size || pdfConfig.fileSize,
          instructions: pdfDirectivesInput,
          uploadedAt: data.uploadedAt || new Date().toISOString()
        });
        setPendingPdfFile(null);
        showToast('PDF document and directives saved successfully.');
      } else {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
    } catch (err: any) {
      setPdfUploadError(err.message || 'Failed saving PDF');
      showToast(`Error: ${err.message}`);
    } finally {
      setIsSavingPdf(false);
    }
  };

  const handleClearPdfConfig = async () => {
    setIsClearingPdf(true);
    try {
      const res = await fetch(getApiUrl('/api/pdf-instruction'), { method: 'DELETE' });
      if (res.ok) {
        setPdfConfig({
          hasPdf: false,
          fileName: '',
          fileSize: 0,
          instructions: '',
          uploadedAt: ''
        });
        setPendingPdfFile(null);
        setPdfDirectivesInput('');
        showToast('PDF document and directives cleared.');
      }
    } catch (err: any) {
      showToast(`Error clearing PDF: ${err.message}`);
    } finally {
      setIsClearingPdf(false);
    }
  };

  // Rejected Content
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
        if (data.platformDataEnabled !== undefined) {
          setPlatformDataEnabled(data.platformDataEnabled);
        }
      }
    } catch {
      // ignore
    }
  };

  // Run Real Live Probe of Reddit and Discord
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
          showToast(`Live probe finished! Inspected ${data.totalEvidenceCount || 0} discussion signals.`);
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

  // Open Raw Evidence Modal
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
      const body: any = { model: selectedModelInput };
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
          message: data.error || 'Failed to authenticate with Gemini API.'
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
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] font-sans antialiased pb-20 selection:bg-[var(--accent-amber)] selection:text-black">
      <div className="grid-bg"></div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 py-2.5 px-4 bg-[var(--bg-panel)] border border-[var(--accent-amber)] text-[var(--text-main)] rounded shadow-2xl font-mono text-xs animate-fade-in flex items-center gap-2">
          <i className="fa-solid fa-bell text-[var(--accent-amber)]"></i>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        {/* Top Header Bar */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 mb-6 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold font-brand tracking-wider uppercase text-[var(--text-main)]">
                  AS-RADAR-X
                </h1>
                <span className="text-[0.65rem] px-2 py-0.5 rounded bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-[var(--accent-amber)]">
                  v2.0 DISCUSSIONS
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] font-mono">
                Stock Opportunity Intelligence Backed by Reddit &amp; Discord Human Discussions
              </p>
            </div>
          </div>

          {/* Quick Status Badges & Theme Toggle */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            {/* Platform Data Toggle Badge */}
            <button
              onClick={handleTogglePlatformData}
              className={`py-1.5 px-3 rounded flex items-center gap-1.5 border transition ${
                platformDataEnabled
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400'
              }`}
              title="Click to toggle Platform Data collection mode"
            >
              <i className={`fa-solid ${platformDataEnabled ? 'fa-toggle-on text-emerald-400' : 'fa-toggle-off'}`}></i>
              <span className="text-[0.68rem] font-bold">PLATFORM DATA: {platformDataEnabled ? 'ON' : 'OFF'}</span>
            </button>

            {/* Reddit Status Badge */}
            <span
              className={`py-1.5 px-2.5 rounded flex items-center gap-1.5 border text-[0.68rem] font-bold uppercase ${
                !platformDataEnabled
                  ? 'bg-zinc-800 border-zinc-700 text-zinc-500'
                  : redditConfig.connected
                  ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                  : 'bg-zinc-800/80 border-zinc-700 text-zinc-400'
              }`}
            >
              <i className="fa-brands fa-reddit text-orange-400"></i>
              <span>REDDIT: {!platformDataEnabled ? 'DISABLED' : redditConfig.connected ? 'READY' : 'UNCONFIGURED'}</span>
            </span>

            {/* Discord Status Badge */}
            <span
              className={`py-1.5 px-2.5 rounded flex items-center gap-1.5 border text-[0.68rem] font-bold uppercase ${
                !platformDataEnabled
                  ? 'bg-zinc-800 border-zinc-700 text-zinc-500'
                  : discordConfig.connected
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                  : 'bg-zinc-800/80 border-zinc-700 text-zinc-400'
              }`}
            >
              <i className="fa-brands fa-discord text-indigo-400"></i>
              <span>DISCORD: {!platformDataEnabled ? 'DISABLED' : discordConfig.connected ? 'READY' : 'UNCONFIGURED'}</span>
            </span>

            {/* Gemini AI Status Badge */}
            <span
              className={`py-1.5 px-2.5 rounded flex items-center gap-1.5 border text-[0.68rem] font-bold uppercase ${
                geminiConfig.hasKey
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}
            >
              <i className="fa-solid fa-brain"></i>
              <span>GEMINI: {geminiConfig.hasKey ? 'ACTIVE' : 'NO KEY'}</span>
            </span>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="py-1.5 px-2.5 bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] rounded text-[var(--text-main)] transition"
              title="Toggle theme"
            >
              <i className={`fa-solid ${theme === 'dark' ? 'fa-sun text-amber-400' : 'fa-moon text-indigo-400'}`}></i>
            </button>
          </div>
        </header>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-2 border-b border-[var(--border-color)] mb-6 overflow-x-auto pb-1">
          {[
            { id: 'research', label: 'RESEARCH PIPELINE', icon: 'fa-microscope' },
            { id: 'sources', label: 'HUMAN SOURCES', icon: 'fa-comments' },
            { id: 'instructions', label: 'INSTRUCTIONS & REJECTIONS', icon: 'fa-sliders' },
            { id: 'history', label: 'HISTORY', icon: 'fa-clock-rotate-left' },
            { id: 'settings', label: 'SYSTEM CONFIG', icon: 'fa-gear' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2 px-4 rounded-t font-mono text-xs font-bold tracking-wider uppercase transition flex items-center gap-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-[var(--bg-card)] border-t-2 border-x border-b-0 border-t-[var(--accent-amber)] border-x-[var(--border-color)] text-[var(--accent-amber)] shadow'
                  : 'text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-input)]'
              }`}
            >
              <i className={`fa-solid ${tab.icon}`}></i>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* ========================================================
             TAB 1: RESEARCH PIPELINE
             ======================================================== */}
        {activeTab === 'research' && (
          <div className="space-y-6">
            {/* Control Bar */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                {/* Photo Count */}
                <div>
                  <label className="block text-[0.68rem] font-bold font-mono tracking-wider text-[var(--text-dim)] uppercase mb-1">
                    Photo Opportunities
                  </label>
                  <select
                    value={photoCount}
                    disabled={isResearching}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setPhotoCount(v);
                      localStorage.setItem('as_radar_x_photo_count', String(v));
                    }}
                    className="bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded py-1.5 px-3 text-xs font-mono text-[var(--text-main)] outline-none"
                  >
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>
                        {n} Photos
                      </option>
                    ))}
                  </select>
                </div>

                {/* Video Count */}
                <div>
                  <label className="block text-[0.68rem] font-bold font-mono tracking-wider text-[var(--text-dim)] uppercase mb-1">
                    Video Opportunities
                  </label>
                  <select
                    value={videoCount}
                    disabled={isResearching}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setVideoCount(v);
                      localStorage.setItem('as_radar_x_video_count', String(v));
                    }}
                    className="bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded py-1.5 px-3 text-xs font-mono text-[var(--text-main)] outline-none"
                  >
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>
                        {n} Videos
                      </option>
                    ))}
                  </select>
                </div>

                {/* Mode Indicator */}
                <div className="hidden lg:block pl-2 border-l border-[var(--border-subtle)]">
                  <span className="text-[0.65rem] text-[var(--text-dim)] font-mono block">Data Pipeline Mode</span>
                  <span className="text-xs font-mono font-bold text-[var(--accent-amber)]">
                    {platformDataEnabled ? 'Reddit & Discord Discussions + Gemini' : 'Pure AI Intelligence & Historical Memory'}
                  </span>
                </div>
              </div>

              {/* Start Button */}
              <div className="flex items-center gap-3">
                {isResearching && (
                  <div className="font-mono text-xs text-[var(--text-dim)]">
                    Elapsed: <span className="text-[var(--accent-amber)] font-bold">{formatTimer(elapsedSeconds)}</span>
                  </div>
                )}
                <button
                  onClick={handleStartResearch}
                  disabled={isResearching || (photoCount === 0 && videoCount === 0)}
                  className="py-2.5 px-6 bg-[var(--accent-amber)] hover:bg-[var(--accent-amber-hover)] disabled:opacity-50 text-black font-bold font-mono text-xs uppercase tracking-wider rounded shadow-md transition flex items-center gap-2"
                >
                  <i className={`fa-solid ${isResearching ? 'fa-spinner fa-spin' : 'fa-play'}`}></i>
                  <span>{isResearching ? 'RESEARCHING...' : 'RUN RESEARCH PIPELINE'}</span>
                </button>
              </div>
            </div>

            {/* Error Banner */}
            {errorInfo && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-xs font-mono text-red-300 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-red-200">
                    <i className="fa-solid fa-triangle-exclamation text-red-400"></i>
                    <span>{errorInfo.message}</span>
                  </div>
                  {errorInfo.details && (
                    <button
                      onClick={() => setShowTechDetails(!showTechDetails)}
                      className="text-[0.65rem] underline text-red-300 hover:text-red-100"
                    >
                      {showTechDetails ? 'Hide technical details' : 'Show technical details'}
                    </button>
                  )}
                </div>
                {showTechDetails && errorInfo.details && (
                  <pre className="p-3 bg-black/50 rounded overflow-x-auto text-[0.68rem] text-red-200 whitespace-pre-wrap leading-relaxed">
                    {errorInfo.details}
                  </pre>
                )}
              </div>
            )}

            {/* In-Progress Pipeline Card */}
            {isResearching && (
              <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg space-y-4 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[var(--accent-amber)] font-bold uppercase">
                    <span className="w-2 h-2 rounded-full bg-[var(--accent-amber)] animate-ping"></span>
                    <span>{progressMessage}</span>
                  </div>
                  <span className="text-[var(--text-dim)]">{progressPercent}%</span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2 bg-[var(--bg-input)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent-amber)] transition-all duration-300 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>

                {/* Stage Steps */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 pt-2">
                  {RESEARCH_STAGES.map((st) => {
                    const isDone = RESEARCH_STAGES.findIndex((s) => s.id === researchStage) > RESEARCH_STAGES.findIndex((s) => s.id === st.id);
                    const isCurrent = researchStage === st.id;
                    return (
                      <div
                        key={st.id}
                        className={`p-2 rounded text-[0.62rem] border transition flex items-center gap-1.5 ${
                          isDone
                            ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
                            : isCurrent
                            ? 'bg-amber-500/10 border-amber-500/30 text-[var(--accent-amber)] font-bold'
                            : 'bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-dim)]'
                        }`}
                      >
                        <i
                          className={`fa-solid ${
                            isDone ? 'fa-check text-emerald-400' : isCurrent ? 'fa-spinner fa-spin text-[var(--accent-amber)]' : 'fa-circle text-[0.4rem]'
                          }`}
                        ></i>
                        <span className="truncate">{st.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Report Display */}
            {currentReport && !isResearching && (
              <div className="space-y-6 animate-fade-in">
                {/* Report Header Card */}
                <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b border-[var(--border-subtle)] gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                          {currentReport.status}
                        </span>
                        <h2 className="text-base font-bold font-brand uppercase tracking-wider text-[var(--text-main)]">
                          Market Intelligence Report ({currentReport.date})
                        </h2>
                      </div>
                      <span className="text-[0.68rem] text-[var(--text-dim)] font-mono">
                        Job: {currentReport.job_id} &bull; Duration: {currentReport.duration}
                      </span>
                    </div>

                    <button
                      onClick={() => handleOpenJobEvidence(currentReport.job_id)}
                      className="py-1.5 px-3 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] hover:border-[var(--accent-amber)] rounded font-mono text-xs text-[var(--text-main)] flex items-center gap-2 transition"
                    >
                      <i className="fa-solid fa-database text-[var(--accent-amber)]"></i>
                      <span>Inspect Raw SQLite Evidence</span>
                    </button>
                  </div>

                  {/* Summary */}
                  <p className="text-xs text-[var(--text-muted)] font-mono leading-relaxed mb-4">
                    {currentReport.evidence_summary}
                  </p>

                  {/* Warnings */}
                  {currentReport.warnings && currentReport.warnings.length > 0 && (
                    <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded font-mono text-xs text-amber-200/90 space-y-1">
                      <div className="font-bold text-[0.68rem] uppercase flex items-center gap-1.5 text-amber-300">
                        <i className="fa-solid fa-triangle-exclamation"></i>
                        <span>Research &amp; Evidence Observations:</span>
                      </div>
                      {currentReport.warnings.map((w, idx) => (
                        <div key={idx} className="text-[0.68rem] pl-4">
                          &bull; {w}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Photo Opportunities List */}
                {currentReport.photos && currentReport.photos.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold font-brand uppercase tracking-wider text-[var(--text-main)] flex items-center gap-2">
                        <i className="fa-solid fa-camera text-[var(--accent-amber)]"></i>
                        <span>Photo Opportunities ({currentReport.photos.length})</span>
                      </h3>
                    </div>

                    <div className="space-y-4">
                      {currentReport.photos.map((photo, pIdx) => (
                        <PhotoCard
                          key={photo.id || pIdx}
                          photo={photo}
                          index={pIdx + 1}
                          isOpen={!!openEvidenceMap[`p-${pIdx}`]}
                          onToggleEvidence={() =>
                            setOpenEvidenceMap((prev) => ({
                              ...prev,
                              [`p-${pIdx}`]: !prev[`p-${pIdx}`]
                            }))
                          }
                          copiedKey={copiedKey}
                          onCopy={copyToClipboard}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Video Opportunities List */}
                {currentReport.videos && currentReport.videos.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold font-brand uppercase tracking-wider text-[var(--text-main)] flex items-center gap-2">
                        <i className="fa-solid fa-video text-[var(--accent-cyan)]"></i>
                        <span>Video Opportunities ({currentReport.videos.length})</span>
                      </h3>
                    </div>

                    <div className="space-y-4">
                      {currentReport.videos.map((video, vIdx) => (
                        <VideoCard
                          key={video.id || vIdx}
                          video={video}
                          index={vIdx + 1}
                          isOpen={!!openEvidenceMap[`v-${vIdx}`]}
                          onToggleEvidence={() =>
                            setOpenEvidenceMap((prev) => ({
                              ...prev,
                              [`v-${vIdx}`]: !prev[`v-${vIdx}`]
                            }))
                          }
                          copiedKey={copiedKey}
                          onCopy={copyToClipboard}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Empty State */}
            {!currentReport && !isResearching && (
              <div className="p-12 text-center bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg font-mono space-y-3">
                <i className="fa-solid fa-compass text-3xl text-[var(--accent-amber)]/60 mb-2"></i>
                <h3 className="text-sm font-bold font-brand text-[var(--text-main)] uppercase">
                  Ready to Extract Market Signals
                </h3>
                <p className="text-xs text-[var(--text-dim)] max-w-lg mx-auto leading-relaxed">
                  Configure photo and video targets above, verify your Reddit/Discord sources in Settings, and click{' '}
                  <strong className="text-[var(--accent-amber)]">&quot;RUN RESEARCH PIPELINE&quot;</strong> to generate data-driven stock content opportunities.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ========================================================
             TAB 2: HUMAN SOURCES (REDDIT & DISCORD)
             ======================================================== */}
        {activeTab === 'sources' && (
          <div className="space-y-6">
            {/* Top Overview Card */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold font-brand uppercase tracking-wider text-[var(--text-main)] flex items-center gap-2">
                  <i className="fa-solid fa-comments text-[var(--accent-amber)]"></i>
                  <span>Live Human Discussion Sources (Reddit &amp; Discord)</span>
                </h3>
                <p className="text-xs text-[var(--text-dim)] font-mono mt-0.5">
                  Direct inspection of community subreddits and Discord bot channel streams.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => runSourcesProbe(true)}
                  disabled={isProbing}
                  className="py-2 px-4 bg-[var(--accent-amber)] hover:bg-[var(--accent-amber-hover)] disabled:opacity-50 text-black font-bold font-mono text-xs uppercase rounded transition flex items-center gap-2"
                >
                  <i className={`fa-solid ${isProbing ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'}`}></i>
                  <span>{isProbing ? 'PROBING...' : 'PROBE LIVE DATA'}</span>
                </button>
              </div>
            </div>

            {/* Sources Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Reddit Card */}
              <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    <i className="fa-brands fa-reddit text-orange-500 text-lg"></i>
                    <span className="font-bold font-brand text-sm uppercase text-[var(--text-main)]">REDDIT COMMUNITIES</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[0.62rem] font-bold uppercase ${
                      !platformDataEnabled
                        ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                        : redditConfig.connected
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                    }`}
                  >
                    {!platformDataEnabled ? 'DISABLED' : redditConfig.connected ? 'CONNECTED' : 'NOT CONNECTED'}
                  </span>
                </div>

                <div className="space-y-1.5 text-[0.72rem]">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-dim)]">Monitored Subreddits:</span>
                    <span className="text-[var(--text-main)] font-bold">{redditConfig.subreddits?.length || 0} subreddits</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-dim)]">Research Timeframe:</span>
                    <span className="text-[var(--accent-amber)] font-bold">{redditConfig.timeframe || '24h'} window</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-dim)]">Extracted Discussions:</span>
                    <span className="text-emerald-400 font-bold">{redditConfig.collectedCount || 0} records</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-dim)]">Last Harvest:</span>
                    <span className="text-[var(--text-muted)]">
                      {redditConfig.lastCollectedAt ? new Date(redditConfig.lastCollectedAt).toLocaleTimeString() : 'Pending'}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap gap-1">
                  {(redditConfig.subreddits || []).slice(0, 6).map((sub) => (
                    <span key={sub} className="py-0.5 px-2 bg-[var(--bg-input)] rounded text-[0.65rem] text-[var(--text-muted)]">
                      r/{sub}
                    </span>
                  ))}
                  {(redditConfig.subreddits || []).length > 6 && (
                    <span className="text-[0.65rem] text-[var(--text-dim)] p-0.5">
                      +{(redditConfig.subreddits || []).length - 6} more
                    </span>
                  )}
                </div>
              </div>

              {/* Discord Card */}
              <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    <i className="fa-brands fa-discord text-indigo-400 text-lg"></i>
                    <span className="font-bold font-brand text-sm uppercase text-[var(--text-main)]">DISCORD BOT STREAMS</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[0.62rem] font-bold uppercase ${
                      !platformDataEnabled
                        ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                        : discordConfig.connected
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                    }`}
                  >
                    {!platformDataEnabled ? 'DISABLED' : discordConfig.connected ? 'CONNECTED' : 'NOT CONNECTED'}
                  </span>
                </div>

                <div className="space-y-1.5 text-[0.72rem]">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-dim)]">Configured Guilds / Servers:</span>
                    <span className="text-[var(--text-main)] font-bold">{discordConfig.guilds?.length || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-dim)]">Monitored Channels:</span>
                    <span className="text-[var(--text-main)] font-bold">
                      {discordConfig.guilds?.[0]?.channels?.length || 0} channels
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-dim)]">Research Timeframe:</span>
                    <span className="text-[var(--accent-cyan)] font-bold">{discordConfig.timeframe || '24h'} window</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-dim)]">Extracted Messages:</span>
                    <span className="text-emerald-400 font-bold">{discordConfig.collectedCount || 0} messages</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap gap-1">
                  {(discordConfig.guilds?.[0]?.channels || []).map((ch: any) => (
                    <span key={ch.id} className="py-0.5 px-2 bg-[var(--bg-input)] rounded text-[0.65rem] text-[var(--text-muted)]">
                      #{ch.name || ch.id}
                    </span>
                  ))}
                  {!(discordConfig.guilds?.[0]?.channels || []).length && (
                    <span className="text-[0.65rem] text-[var(--text-dim)]">No channels configured in Settings.</span>
                  )}
                </div>
              </div>
            </div>

            {/* Extracted Signals Stream */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-4 mb-4 border-b border-[var(--border-subtle)]">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold font-brand uppercase text-[var(--text-main)]">
                    <i className="fa-solid fa-stream text-[var(--accent-amber)]"></i>
                    Discussion Signal Stream
                  </div>
                  <span className="text-[0.68rem] text-[var(--text-dim)] font-mono">
                    Real extracted human discussion points feeding the Gemini market intelligence analyst.
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  <div className="flex items-center gap-1 bg-[var(--bg-input)] border border-[var(--border-color)] rounded p-1">
                    {['ALL', 'Reddit', 'Discord'].map((f) => (
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
                    const descMatch = (item.raw_description || '').toLowerCase().includes(term);
                    const kwMatch = (item.raw_keywords || []).some((k: string) => k.toLowerCase().includes(term));
                    return titleMatch || descMatch || kwMatch;
                  }
                  return true;
                });

                if (isProbing) {
                  return (
                    <div className="py-12 text-center text-xs font-mono text-[var(--accent-amber)]">
                      <i className="fa-solid fa-spinner fa-spin text-xl mb-2"></i>
                      <div>Probing live Reddit &amp; Discord endpoints and extracting discussion tokens...</div>
                    </div>
                  );
                }

                if (!filtered.length) {
                  return (
                    <div className="p-8 text-center bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded font-mono text-xs text-[var(--text-dim)]">
                      {probeData
                        ? 'No discussions matched your filter criteria.'
                        : 'No live probe executed yet. Click "PROBE LIVE DATA" above to inspect live signals.'}
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
                                item.source === 'Reddit'
                                  ? 'text-orange-400 bg-orange-500/10 border border-orange-500/20'
                                  : 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20'
                              }`}
                            >
                              {item.source}
                            </span>
                            <span className="text-[0.62rem] text-[var(--text-dim)] uppercase">
                              {item.evidence_type?.replace(/_/g, ' ') || 'Discussion'}
                            </span>
                          </div>

                          <h4 className="text-xs font-semibold text-[var(--text-main)] mb-1.5 leading-relaxed">
                            {item.raw_title}
                          </h4>

                          {item.raw_description && (
                            <p className="text-[0.7rem] text-[var(--text-muted)] mb-2 line-clamp-3 leading-normal">
                              {item.raw_description}
                            </p>
                          )}
                        </div>

                        <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[0.62rem] text-[var(--text-dim)]">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-[var(--accent-amber)] truncate max-w-[200px]"
                          >
                            {item.url}
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
             TAB 3: INSTRUCTIONS & REJECTIONS
             ======================================================== */}
        {activeTab === 'instructions' && (
          <div className="space-y-6 max-w-4xl">
            {/* Custom Instructions */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <div>
                  <h3 className="text-sm font-bold font-brand uppercase tracking-wider text-[var(--text-main)] flex items-center gap-2">
                    <i className="fa-solid fa-sliders text-[var(--accent-amber)]"></i>
                    <span>Analyst Guidance &amp; Niche Directives</span>
                  </h3>
                  <span className="text-[0.66rem] text-[var(--text-dim)] font-mono">
                    Direct Gemini toward specific industries, visual styles, or buyer personas.
                  </span>
                </div>
              </div>

              <textarea
                value={instructionsText}
                onChange={(e) => setInstructionsText(e.target.value)}
                placeholder="e.g. Focus heavily on authentic video editing b-roll, modern sustainable warehouse logistics, clean Scandinavian healthcare aesthetic..."
                rows={4}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded p-3 text-xs font-mono text-[var(--text-main)] outline-none leading-relaxed"
              ></textarea>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveInstructions}
                  className="py-2 px-4 bg-[var(--accent-amber)] hover:bg-[var(--accent-amber-hover)] text-black font-bold font-mono text-xs uppercase rounded transition"
                >
                  Save Instructions
                </button>
                <button
                  onClick={handleClearInstructions}
                  className="py-2 px-3 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] rounded font-mono text-xs text-[var(--text-main)] transition"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Reference PDF Document & Visual Directives */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[var(--border-subtle)] gap-2">
                <div>
                  <h3 className="text-sm font-bold font-brand uppercase tracking-wider text-[var(--text-main)] flex items-center gap-2">
                    <i className="fa-solid fa-file-pdf text-rose-400"></i>
                    <span>Reference PDF Document &amp; Visual Directives</span>
                  </h3>
                  <span className="text-[0.66rem] text-[var(--text-dim)] font-mono">
                    Upload a PDF document for Gemini to inspect pages, photography, composition, and visual guidelines directly.
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[0.65rem] font-mono font-bold uppercase ${
                      pdfConfig.hasPdf
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : pendingPdfFile
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        pdfConfig.hasPdf ? 'bg-emerald-400' : pendingPdfFile ? 'bg-amber-400 animate-pulse' : 'bg-zinc-500'
                      }`}
                    ></span>
                    {pdfConfig.hasPdf
                      ? 'ATTACHED & PERSISTED'
                      : pendingPdfFile
                      ? 'READY TO SAVE'
                      : 'NO PDF ATTACHED'}
                  </span>
                </div>
              </div>

              {/* Upload Zone / Document details */}
              <div className="p-4 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg font-mono text-xs space-y-3">
                {pdfConfig.hasPdf || pendingPdfFile ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[var(--bg-panel)] border border-[var(--border-color)] rounded">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 text-lg shrink-0">
                        <i className="fa-solid fa-file-pdf"></i>
                      </div>
                      <div>
                        <div className="font-bold text-[var(--text-main)] text-xs flex items-center gap-2">
                          <span>{pendingPdfFile ? pendingPdfFile.name : pdfConfig.fileName}</span>
                          {pendingPdfFile && (
                            <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 text-[0.60rem] rounded font-mono">
                              UNSAVED
                            </span>
                          )}
                        </div>
                        <div className="text-[0.68rem] text-[var(--text-dim)] mt-0.5">
                          Size:{' '}
                          {Math.round(
                            (pendingPdfFile ? pendingPdfFile.size : pdfConfig.fileSize) / 1024
                          )}{' '}
                          KB &bull;{' '}
                          {pdfConfig.uploadedAt
                            ? `Attached on ${new Date(pdfConfig.uploadedAt).toLocaleDateString()}`
                            : 'Ready to save'}
                        </div>
                      </div>
                    </div>

                    <label className="py-1.5 px-3 bg-[var(--bg-input)] hover:border-[var(--accent-amber)] border border-[var(--border-color)] rounded text-[0.68rem] font-mono text-[var(--text-muted)] cursor-pointer text-center">
                      <i className="fa-solid fa-arrow-rotate-right mr-1.5"></i>
                      Change PDF
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={handlePdfFileSelect}
                        className="hidden"
                      />
                    </label>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-[var(--border-color)] hover:border-[var(--accent-amber)] rounded-lg cursor-pointer transition bg-[var(--bg-panel)]/40 hover:bg-[var(--bg-panel)]/80">
                    <i className="fa-solid fa-cloud-arrow-up text-2xl text-[var(--accent-amber)] mb-2"></i>
                    <span className="text-xs font-bold text-[var(--text-main)] mb-1">
                      Click or drag a PDF document here to attach
                    </span>
                    <span className="text-[0.66rem] text-[var(--text-dim)] text-center">
                      PDF pages, photos, and visual specifications will be visually analyzed by Gemini during research (Max 30MB)
                    </span>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handlePdfFileSelect}
                      className="hidden"
                    />
                  </label>
                )}

                {pdfUploadError && (
                  <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded text-red-300 text-[0.72rem] flex items-center gap-2">
                    <i className="fa-solid fa-triangle-exclamation text-red-400"></i>
                    <span>{pdfUploadError}</span>
                  </div>
                )}
              </div>

              {/* Directives for this specific PDF */}
              <div>
                <label className="block text-[0.68rem] text-[var(--text-dim)] uppercase font-mono font-bold mb-1.5 flex items-center justify-between">
                  <span>PDF Specific Analysis Directives &amp; Instructions</span>
                  <span className="text-[0.60rem] lowercase text-[var(--text-dim)] font-normal">
                    (tells Gemini what to examine inside this PDF)
                  </span>
                </label>
                <textarea
                  value={pdfDirectivesInput}
                  onChange={(e) => setPdfDirectivesInput(e.target.value)}
                  placeholder="e.g. Inspect the clinical equipment on pages 4-7, examine the lighting and camera framing in the photo spread, extract missing b-roll opportunities, avoid plastic packaging shown on page 10..."
                  rows={4}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded p-3 text-xs font-mono text-[var(--text-main)] outline-none leading-relaxed"
                ></textarea>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleSavePdfConfig}
                  disabled={isSavingPdf || (!pendingPdfFile && !pdfConfig.hasPdf)}
                  className="py-2 px-4 bg-[var(--accent-amber)] hover:bg-[var(--accent-amber-hover)] disabled:opacity-40 text-black font-bold font-mono text-xs uppercase rounded transition flex items-center gap-1.5 cursor-pointer"
                >
                  <i className={`fa-solid ${isSavingPdf ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i>
                  <span>{isSavingPdf ? 'SAVING...' : 'SAVE PDF & DIRECTIVES'}</span>
                </button>

                {(pdfConfig.hasPdf || pendingPdfFile) && (
                  <button
                    onClick={handleClearPdfConfig}
                    disabled={isClearingPdf}
                    className="py-2 px-3.5 bg-[var(--bg-panel)] hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-300 border border-[var(--border-color)] rounded font-mono text-xs text-[var(--text-main)] transition flex items-center gap-1.5 cursor-pointer"
                    title="Clear attached PDF and directives"
                  >
                    <i className={`fa-solid ${isClearingPdf ? 'fa-spinner fa-spin' : 'fa-trash-can'}`}></i>
                    <span>CLEAR PDF</span>
                  </button>
                )}
              </div>
            </div>

            {/* Rejection / Exclusion Memory */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg space-y-4">
              <div className="pb-3 border-b border-[var(--border-subtle)]">
                <h3 className="text-sm font-bold font-brand uppercase tracking-wider text-[var(--text-main)] flex items-center gap-2">
                  <i className="fa-solid fa-ban text-red-400"></i>
                  <span>Exclusion &amp; Anti-Cliché Memory</span>
                </h3>
                <span className="text-[0.66rem] text-[var(--text-dim)] font-mono">
                  Concepts, styles, or clichés strictly blocked from appearing in generated opportunities.
                </span>
              </div>

              <div className="space-y-2">
                {rejectedItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => handleAddOrUpdateRejection(idx, e.target.value)}
                      className="flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded py-1.5 px-3 text-xs font-mono text-[var(--text-main)] outline-none"
                    />
                    <button
                      onClick={() => handleDeleteRejection(idx)}
                      className="py-1.5 px-3 bg-[var(--bg-panel)] hover:bg-red-500/20 text-[var(--text-dim)] hover:text-red-400 border border-[var(--border-color)] rounded text-xs transition"
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </div>
                ))}

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="text"
                    value={newRejectionInput}
                    onChange={(e) => setNewRejectionInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddOrUpdateRejection(rejectedItems.length, newRejectionInput);
                      }
                    }}
                    placeholder="Add concept to exclude (e.g. plastic ai smiles, generic handshakes)..."
                    className="flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded py-1.5 px-3 text-xs font-mono text-[var(--text-main)] outline-none"
                  />
                  <button
                    onClick={() => handleAddOrUpdateRejection(rejectedItems.length, newRejectionInput)}
                    className="py-1.5 px-4 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] rounded font-mono text-xs font-bold text-[var(--text-main)] transition"
                  >
                    + Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
             TAB 4: HISTORY
             ======================================================== */}
        {activeTab === 'history' && (
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-sm font-bold font-brand uppercase tracking-wider text-[var(--text-main)] flex items-center gap-2">
                  <i className="fa-solid fa-clock-rotate-left text-[var(--accent-amber)]"></i>
                  <span>Research History (SQLite Store)</span>
                </h3>
                <span className="text-[0.66rem] text-[var(--text-dim)] font-mono">
                  Previously completed market research reports and evidence sets.
                </span>
              </div>

              <button
                onClick={loadHistory}
                disabled={isLoadingHistory}
                className="py-1 px-3 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] rounded font-mono text-xs text-[var(--text-main)] transition flex items-center gap-1.5"
              >
                <i className={`fa-solid fa-arrows-rotate ${isLoadingHistory ? 'fa-spin' : ''}`}></i>
                <span>Refresh</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-color)] text-[var(--text-dim)] uppercase text-[0.65rem]">
                    <th className="p-3">Job ID</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Photos / Videos</th>
                    <th className="p-3">Major Discussion Topics</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {!historyList.length ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-[var(--text-dim)]">
                        No previous research jobs found in database.
                      </td>
                    </tr>
                  ) : (
                    historyList.map((rec) => (
                      <tr key={rec.job_id} className="hover:bg-[var(--bg-input)] transition">
                        <td className="p-3 font-bold text-[var(--accent-amber)]">{rec.job_id}</td>
                        <td className="p-3 text-[var(--text-muted)]">{rec.date}</td>
                        <td className="p-3">
                          {rec.photo_count}P / {rec.video_count}V
                        </td>
                        <td className="p-3 text-[var(--text-main)] max-w-xs truncate">
                          {(rec.major_topics || []).join(', ') || 'General Commercial'}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[0.62rem] font-bold ${
                              rec.status === 'COMPLETED'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}
                          >
                            {rec.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleLoadHistoricalReport(rec.job_id)}
                            className="py-1 px-3 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] hover:border-[var(--accent-amber)] rounded text-xs transition"
                          >
                            View
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
             TAB 5: SYSTEM CONFIG
             ======================================================== */}
        {activeTab === 'settings' && (
          <div className="space-y-6 max-w-4xl">
            {/* PLATFORM DATA MASTER SWITCH */}
            <div className="bg-[var(--bg-card)] border-2 border-[var(--accent-amber)]/40 rounded-lg p-5 shadow-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold font-brand uppercase tracking-wider text-[var(--text-main)] flex items-center gap-2">
                    <i className="fa-solid fa-network-wired text-[var(--accent-amber)]"></i>
                    <span>PLATFORM DATA (REDDIT &amp; DISCORD LIVE EXTRACTION)</span>
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] font-mono mt-1 leading-relaxed">
                    Controls whether AS-Radar-X connects to Reddit &amp; Discord to harvest raw human discussion needs, creator complaints, and missing assets.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleTogglePlatformData}
                  className={`py-2 px-5 rounded font-mono text-xs font-bold uppercase tracking-wider transition flex items-center gap-2 shadow-md ${
                    platformDataEnabled
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-black'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-600'
                  }`}
                >
                  <i className={`fa-solid ${platformDataEnabled ? 'fa-toggle-on text-base' : 'fa-toggle-off text-base'}`}></i>
                  <span>PLATFORM DATA: {platformDataEnabled ? 'ON' : 'OFF'}</span>
                </button>
              </div>

              <div className="p-3 bg-[var(--bg-input)] rounded border border-[var(--border-subtle)] font-mono text-xs text-[var(--text-dim)]">
                {platformDataEnabled ? (
                  <span className="text-emerald-400">
                    &bull; <strong>ON (Default):</strong> Research pipeline extracts discussions from your configured subreddits &amp; Discord channels and feeds real human signals into Gemini.
                  </span>
                ) : (
                  <span className="text-amber-400">
                    &bull; <strong>OFF:</strong> Skips Reddit &amp; Discord network calls. Operates using Gemini strategic AI intelligence, historical database memory, and custom instructions.
                  </span>
                )}
              </div>
            </div>

            {/* REDDIT RESEARCH SOURCES SECTION */}
            <RedditConfigSection
              config={redditConfig}
              onSave={handleSaveRedditConfig}
              showToast={showToast}
              getApiUrl={getApiUrl}
            />

            {/* DISCORD RESEARCH SOURCES SECTION */}
            <DiscordConfigSection
              config={discordConfig}
              onSave={handleSaveDiscordConfig}
              showToast={showToast}
              getApiUrl={getApiUrl}
            />

            {/* GEMINI STRATEGIC ENGINE CONFIGURATION */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[var(--border-subtle)] gap-2">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-brain text-[var(--accent-amber)] text-lg"></i>
                  <div>
                    <h3 className="text-sm font-bold font-brand uppercase tracking-wider text-[var(--text-main)]">
                      GEMINI STRATEGIC ANALYST CONFIGURATION
                    </h3>
                    <span className="text-[0.66rem] text-[var(--text-dim)] font-mono">
                      @google/genai SDK &bull; Grounded Market Intelligence &amp; Creative Direction
                    </span>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[0.65rem] font-mono font-bold uppercase ${
                    geminiConfig.hasKey
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-red-500/10 text-red-400 border border-red-500/30'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${geminiConfig.hasKey ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                  {geminiConfig.hasKey ? 'ACTIVE KEY CONFIGURED' : 'KEY MISSING'}
                </span>
              </div>

              {/* Status Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-2.5 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded">
                  <span className="text-[0.65rem] text-[var(--text-dim)] uppercase block">Active Masked Key</span>
                  <span className="font-bold text-[var(--text-main)] tracking-wider">
                    {geminiConfig.activeKeyMasked}
                  </span>
                </div>
                <div className="p-2.5 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded">
                  <span className="text-[0.65rem] text-[var(--text-dim)] uppercase block">Selected Model</span>
                  <span className="font-bold text-[var(--accent-amber)]">{geminiConfig.activeModel}</span>
                </div>
              </div>

              {/* Feedback Message */}
              {geminiTestFeedback && (
                <div
                  className={`p-3 rounded border font-mono text-xs flex items-start gap-2 ${
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

              {/* Model Selector & Key Input */}
              <div className="space-y-3 font-mono text-xs">
                <div>
                  <label className="block text-[0.68rem] text-[var(--text-dim)] uppercase font-bold mb-1">
                    Select Gemini Model
                  </label>
                  <select
                    value={selectedModelInput}
                    onChange={(e) => setSelectedModelInput(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded p-2 text-xs text-[var(--text-main)] outline-none"
                  >
                    <option value="auto">auto (Auto: Detect &amp; Optimize Best Active Model)</option>
                    <option value="gemini-3.8-flash">gemini-3.8-flash (Latest: High-speed market synthesis)</option>
                    <option value="gemini-3.7-flash">gemini-3.7-flash (Balanced speed &amp; strategic analysis)</option>
                    <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview (Advanced complex reasoning)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[0.68rem] text-[var(--text-dim)] uppercase font-bold mb-1 flex justify-between">
                    <span>Enter Custom Gemini API Key</span>
                    <button
                      type="button"
                      onClick={() => setShowApiKeyText(!showApiKeyText)}
                      className="text-[0.62rem] text-[var(--accent-cyan)] hover:underline capitalize"
                    >
                      {showApiKeyText ? 'Hide Key' : 'Show Key'}
                    </button>
                  </label>
                  <input
                    type={showApiKeyText ? 'text' : 'password'}
                    value={geminiApiKeyInput}
                    onChange={(e) => setGeminiApiKeyInput(e.target.value)}
                    placeholder="Enter key to update, or leave blank to keep current..."
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded p-2 text-xs text-[var(--text-main)] outline-none"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleTestGemini}
                  disabled={isTestingGemini}
                  className="py-2 px-4 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] hover:border-[var(--accent-amber)] rounded font-mono text-xs font-bold text-[var(--text-main)] flex items-center gap-2 transition disabled:opacity-50"
                >
                  <i className={`fa-solid ${isTestingGemini ? 'fa-spinner fa-spin' : 'fa-plug'} text-emerald-400`}></i>
                  <span>{isTestingGemini ? 'Testing...' : 'TEST CONNECTION'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveGeminiConfig}
                  disabled={isSavingGemini}
                  className="py-2 px-5 bg-[var(--accent-amber)] hover:bg-[var(--accent-amber-hover)] text-black font-bold font-mono text-xs uppercase rounded flex items-center gap-2 shadow transition disabled:opacity-50"
                >
                  <i className="fa-solid fa-floppy-disk"></i>
                  <span>{isSavingGemini ? 'Saving...' : 'SAVE SETTINGS'}</span>
                </button>

                {geminiConfig.hasCustomKey && (
                  <button
                    type="button"
                    onClick={handleClearCustomApiKey}
                    className="py-2 px-3 text-[var(--text-dim)] hover:text-red-400 font-mono text-xs transition"
                  >
                    Clear Custom Key
                  </button>
                )}
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
        AS-RADAR-X &bull; STOCK CONTENT MARKET INTELLIGENCE &bull; REDDIT &amp; DISCORD HUMAN SIGNALS
      </footer>
    </div>
  );
}
