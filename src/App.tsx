import React, { useEffect, useRef, useState } from 'react';
import type { HistoryRecord, PhotoOpportunity, ResearchReport, ResearchStage, VideoOpportunity } from '../server/types.js';
import { PhotoCard } from './components/PhotoCard.js';
import { VideoCard } from './components/VideoCard.js';
import { EvidenceModal } from './components/EvidenceModal.js';
import { ResearchBrowserPanel } from './components/ResearchBrowserPanel.js';
import { PortfolioTable } from './components/PortfolioTable.js';

const RESEARCH_STAGES: Array<{ id: ResearchStage; label: string }> = [
  { id: 'PLANNING', label: 'PLAN RESEARCH' },
  { id: 'BROWSER_RESEARCH', label: 'LIVE MARKET RESEARCH' },
  { id: 'PAUSED_FOR_USER', label: 'USER VERIFICATION' },
  { id: 'PORTFOLIO_SYNC', label: 'SYNC ADOBE PORTFOLIO' },
  { id: 'NORMALIZING', label: 'NORMALIZE EVIDENCE' },
  { id: 'FINAL_ANALYSIS', label: 'ANALYZE OPPORTUNITIES' },
  { id: 'SCORING', label: 'CALCULATE SCORES' },
  { id: 'COMPLETE', label: 'REPORT READY' }
];

export default function App() {
  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Navigation state
  const [activeTab, setActiveTab] = useState<'research' | 'portfolio' | 'instructions' | 'history' | 'proxy' | 'settings'>('research');

  // Controls state
  const [photoCount, setPhotoCount] = useState<number>(5);
  const [videoCount, setVideoCount] = useState<number>(3);
  const [isResearching, setIsResearching] = useState<boolean>(false);
  const [researchStage, setResearchStage] = useState<ResearchStage>('PLANNING');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressMessage, setProgressMessage] = useState<string>('Ready for deep research.');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [researchNiche, setResearchNiche] = useState<string>('');
  const [titleInstructions, setTitleInstructions] = useState<string>('');
  const [tagCount, setTagCount] = useState<number>(25);
  const [researchEvents, setResearchEvents] = useState<any[]>([]);
  const [showBrowser, setShowBrowser] = useState<boolean>(false);
  const [portfolioRefreshKey, setPortfolioRefreshKey] = useState<number>(0);

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
    availableModels: ['auto']
  });
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState<string>('');
  const [selectedModelInput, setSelectedModelInput] = useState<string>('auto');
  const [showApiKeyText, setShowApiKeyText] = useState<boolean>(false);
  const [isTestingGemini, setIsTestingGemini] = useState<boolean>(false);
  const [isSavingGemini, setIsSavingGemini] = useState<boolean>(false);
  const [isRefreshingGeminiModels, setIsRefreshingGeminiModels] = useState<boolean>(false);
  const [lastSuccessfulGeminiModel, setLastSuccessfulGeminiModel] = useState<string>('');
  const [geminiTestFeedback, setGeminiTestFeedback] = useState<{ success: boolean; message: string; durationMs?: number } | null>(null);

  // Copy feedback state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Desktop proxy and connectivity state
  const [proxyConfig, setProxyConfig] = useState<{
    enabled: boolean; protocol: 'http' | 'socks5'; host: string; port: number;
    username: string; hasPassword: boolean;
  }>({ enabled: false, protocol: 'http', host: '127.0.0.1', port: 10809, username: '', hasPassword: false });
  const [proxyPasswordInput, setProxyPasswordInput] = useState<string>('');
  const [isSavingProxy, setIsSavingProxy] = useState<boolean>(false);
  const [isTestingProxy, setIsTestingProxy] = useState<boolean>(false);
  const [proxyTestFeedback, setProxyTestFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [networkOnline, setNetworkOnline] = useState<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [isHistoricalReport, setIsHistoricalReport] = useState<boolean>(false);
  const priorCurrentReportRef = useRef<ResearchReport | null>(null);

  // Clean All History state
  const [isClearingHistory, setIsClearingHistory] = useState<boolean>(false);
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState<boolean>(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const eventPollRef = useRef<NodeJS.Timeout | null>(null);
  const eventOffsetRef = useRef<number>(0);

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
    const savedNiche = localStorage.getItem('as_radar_x_research_niche');
    if (savedNiche) setResearchNiche(savedNiche);
    const savedTitle = localStorage.getItem('as_radar_x_title_instructions');
    if (savedTitle) setTitleInstructions(savedTitle);
    const savedTags = Number(localStorage.getItem('as_radar_x_tag_count') || 25);
    if (Number.isInteger(savedTags) && savedTags >= 1 && savedTags <= 50) setTagCount(savedTags);

    const savedApiBase = localStorage.getItem('as_radar_x_api_base');
    if (savedApiBase) setApiBaseUrl(savedApiBase);

    loadInstructions();
    loadRejectedContent();
    loadHistory();
    loadGeminiConfig();
    loadPdfConfig();
    loadProxyConfig();

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
      setShowBrowser(true);
      loadResearchEvents(storedJobId, true);
      pollJobStatus(storedJobId);
    }
  }, []);

  useEffect(() => {
    const updateConnectivity = () => setNetworkOnline(navigator.onLine);
    window.addEventListener('online', updateConnectivity);
    window.addEventListener('offline', updateConnectivity);
    return () => {
      window.removeEventListener('online', updateConnectivity);
      window.removeEventListener('offline', updateConnectivity);
    };
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

  useEffect(() => {
    if (isResearching && activeJobId) {
      eventPollRef.current = setInterval(() => { void loadResearchEvents(activeJobId); }, 1400);
    } else if (eventPollRef.current) {
      clearInterval(eventPollRef.current);
    }
    return () => { if (eventPollRef.current) clearInterval(eventPollRef.current); };
  }, [isResearching, activeJobId]);

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

  // Open Raw Evidence Modal
  const handleOpenJobEvidence = async (jobId: string) => {
    setEvidenceModal({
      isOpen: true,
      jobId,
      items: [],
      isLoading: true
    });
    try {
      const res = await fetch(getApiUrl(`/api/research/events/${encodeURIComponent(jobId)}`));
      if (res.ok) {
        const data = await res.json();
        setEvidenceModal({
          isOpen: true,
          jobId,
          items: data.events || [],
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

  // Proxy controls: the backend applies the proxy to outbound API and research traffic.
  const loadProxyConfig = async () => {
    try {
      const res = await fetch(getApiUrl('/api/proxy/config'));
      if (!res.ok) return;
      const data = await res.json();
      setProxyConfig({
        enabled: !!data.enabled,
        protocol: data.protocol === 'socks5' ? 'socks5' : 'http',
        host: data.host || '127.0.0.1',
        port: Number(data.port) || (data.protocol === 'socks5' ? 10808 : 10809),
        username: data.username || '',
        hasPassword: !!data.hasPassword
      });
    } catch {
      // A proxy may be unavailable while the local engine is starting.
    }
  };

  const handleToggleProxy = async () => {
    const nextEnabled = !proxyConfig.enabled;
    try {
      const res = await fetch(getApiUrl('/api/proxy/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      setProxyConfig((prev) => ({ ...prev, ...data.config }));
      showToast(nextEnabled ? 'Proxy routing enabled for supported outbound requests.' : 'Proxy routing disabled.');
      setProxyTestFeedback(null);
    } catch (err: any) {
      showToast(`Could not change proxy state: ${err.message || 'Unknown error'}`);
    }
  };

  const handleSaveProxyConfig = async () => {
    setIsSavingProxy(true);
    setProxyTestFeedback(null);
    try {
      const payload: any = { ...proxyConfig, port: Number(proxyConfig.port) };
      if (proxyPasswordInput.trim()) payload.password = proxyPasswordInput;
      const res = await fetch(getApiUrl('/api/proxy/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      setProxyConfig((prev) => ({ ...prev, ...data.config }));
      setProxyPasswordInput('');
      showToast('Proxy settings saved on this device.');
    } catch (err: any) {
      showToast(`Proxy save failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSavingProxy(false);
    }
  };

  const handleTestProxy = async () => {
    setIsTestingProxy(true);
    setProxyTestFeedback(null);
    try {
      const payload: any = { ...proxyConfig, port: Number(proxyConfig.port) };
      if (proxyPasswordInput.trim()) payload.password = proxyPasswordInput;
      const res = await fetch(getApiUrl('/api/proxy/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      setProxyTestFeedback({ success: true, message: `Connection successful in ${data.latencyMs} ms (HTTP ${data.status}).` });
      showToast('Proxy test succeeded.');
    } catch (err: any) {
      const message = err.message || 'Could not reach the internet through this proxy.';
      setProxyTestFeedback({ success: false, message });
    } finally {
      setIsTestingProxy(false);
    }
  };

  // Gemini Config Handlers
  const loadGeminiConfig = async () => {
    try {
      const res = await fetch(getApiUrl('/api/gemini/config'));
      if (res.ok) {
        const data = await res.json();
        setGeminiConfig(data);
        if (data.lastSuccessfulModel) setLastSuccessfulGeminiModel(data.lastSuccessfulModel);
        if (data.activeModel) {
          setSelectedModelInput(data.activeModel);
        }
      }
    } catch {
      // ignore
    }
  };

  const handleRefreshGeminiModels = async () => {
    setIsRefreshingGeminiModels(true);
    setGeminiTestFeedback(null);
    try {
      const body: any = {};
      if (geminiApiKeyInput.trim()) body.apiKey = geminiApiKeyInput.trim();
      const res = await fetch(getApiUrl('/api/gemini/models'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      const models = Array.isArray(data.models) ? data.models.filter((model: unknown) => typeof model === 'string') : [];
      setGeminiConfig((prev) => ({ ...prev, availableModels: [...new Set(['auto', ...models])] }));
      if (selectedModelInput !== 'auto' && !models.includes(selectedModelInput)) setSelectedModelInput('auto');
      showToast(`Loaded ${models.length} Gemini models from Google.`);
    } catch (err: any) {
      showToast(`Model refresh failed: ${err.message || 'Google API request failed.'}`);
    } finally {
      setIsRefreshingGeminiModels(false);
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
        if (data.resolvedModel) setLastSuccessfulGeminiModel(data.resolvedModel);
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

  // Clean All History
  const handleCleanAllHistory = async () => {
    setIsClearingHistory(true);
    try {
      const res = await fetch(getApiUrl('/api/history'), { method: 'DELETE' });
      if (res.ok) {
        setHistoryList([]);
        setCurrentReport(null);
        setIsHistoricalReport(false);
        priorCurrentReportRef.current = null;
        setShowClearHistoryConfirm(false);
        showToast('All research history and content records have been cleared. Instructions preserved.');
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
    } catch (err: any) {
      showToast(`Failed to clean history: ${err.message}`);
    } finally {
      setIsClearingHistory(false);
    }
  };

  // Load live browser events and normalized evidence records.
  const loadResearchEvents = async (jobId: string, reset = false) => {
    try {
      if (reset) {
        eventOffsetRef.current = 0;
        setResearchEvents([]);
      }
      const offset = eventOffsetRef.current;
      const res = await fetch(getApiUrl('/api/research/events/' + encodeURIComponent(jobId) + '?after=' + offset));
      if (!res.ok) return;
      const data = await res.json();
      const next = Array.isArray(data.events) ? data.events : [];
      if (next.length) {
        eventOffsetRef.current = offset + next.length;
        setResearchEvents((previous) => reset ? next : [...previous, ...next]);
      }
    } catch {
      // Status polling remains the source of truth if event polling briefly fails.
    }
  };

  const handleContinueResearch = async () => {
    if (!activeJobId) return;
    try {
      const res = await fetch(getApiUrl('/api/research/resume/' + encodeURIComponent(activeJobId)), { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || ('HTTP ' + res.status));
      showToast('Gemini has resumed browser research.');
    } catch (err: any) {
      showToast('Could not resume research: ' + err.message);
    }
  };

  // Start Research
  const handleStartResearch = async () => {
    if (isResearching) return;
    setIsHistoricalReport(false);
    priorCurrentReportRef.current = null;
    if (photoCount === 0 && videoCount === 0) {
      showToast('Please select at least one photo or video opportunity.');
      return;
    }

    setErrorInfo(null);
    setShowTechDetails(false);
    setIsResearching(true);
    setElapsedSeconds(0);
    setProgressPercent(5);
    setResearchStage('PLANNING');
    setProgressMessage('Gemini is planning the research...');
    eventOffsetRef.current = 0;
    setResearchEvents([]);
    setShowBrowser(true);

    try {
      const res = await fetch(getApiUrl('/api/research'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_count: photoCount, video_count: videoCount, niche: researchNiche, title_instructions: titleInstructions, tag_count: tagCount })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const jobId = data.job_id;
      setActiveJobId(jobId);
      setShowBrowser(true);
      loadResearchEvents(jobId);
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
      setResearchStage(data.stage || 'PLANNING');
      setProgressPercent(data.progress || 10);
      setProgressMessage(data.message || 'Processing research pipeline...');
      await loadResearchEvents(jobId);
      if (data.stage === 'PAUSED_FOR_USER') setShowBrowser(true);

      if (data.status === 'COMPLETED') {
        const repRes = await fetch(getApiUrl(`/api/report/${encodeURIComponent(jobId)}`));
        if (repRes.ok) {
          const reportData = await repRes.json();
          setCurrentReport(reportData);
          setPortfolioRefreshKey((value) => value + 1);
          setIsHistoricalReport(false);
          priorCurrentReportRef.current = null;
          showToast('Research completed successfully.');
          try { if ('Notification' in window && Notification.permission === 'granted') new Notification('AS-Radar-X', { body: `Research completed: ${reportData.photos?.length || 0} photos and ${reportData.videos?.length || 0} videos.` }); } catch { /* Desktop notifications are optional. */ }

        }
        setIsResearching(false);
        setShowBrowser(false);
        window.asRadarDesktop?.hideBrowser().catch(() => undefined);
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
      setShowBrowser(false);
      window.asRadarDesktop?.hideBrowser().catch(() => undefined);
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
      if (!isHistoricalReport) priorCurrentReportRef.current = currentReport;
      setCurrentReport(report);
      setPortfolioRefreshKey((value) => value + 1);
      eventOffsetRef.current = 0;
      setResearchEvents([]);
      await loadResearchEvents(jobId, true);
      setIsHistoricalReport(true);
      setOpenEvidenceMap({});
      setActiveTab('research');
      showToast(`Loaded historical report from ${report.date || jobId}`);
    } catch (err: any) {
      showToast(`Failed loading historical report: ${err.message}`);
    }
  };

  const buildReportCopyText = (report: ResearchReport) => {
    const sections: string[] = [];
    (report.photos || []).forEach((photo, index) => {
      sections.push([
        `Opportunity ${index + 1} photo`,
        `Title - ${photo.title || ''}`,
        `Prompt - ${photo.prompt || ''}`,
        `Hashtag - ${Array.isArray(photo.tags) ? photo.tags.join(', ') : ''}`
      ].join('\n'));
    });
    (report.videos || []).forEach((video, index) => {
      sections.push([
        `Opportunity ${index + 1} video`,
        `Title - ${video.title || ''}`,
        `Prompt - ${video.prompt || ''}`,
        `Hashtag - ${Array.isArray(video.tags) ? video.tags.join(', ') : ''}`
      ].join('\n'));
    });
    return sections.join('\n\n');
  };

  const handleBackFromHistoricalReport = () => {
    setCurrentReport(priorCurrentReportRef.current);
    priorCurrentReportRef.current = null;
    setIsHistoricalReport(false);
    setOpenEvidenceMap({});
    setActiveTab('research');
  };

  // Copy helper
  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      if (key === 'report-all') showToast('Complete report copied to clipboard.');
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
                  AUTONOMOUS RESEARCH
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] font-mono">
                Evidence-driven stock market &amp; portfolio intelligence
              </p>
            </div>
          </div>

          {/* Quick Status Badges & Theme Toggle */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
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

            <span className={`py-1.5 px-2.5 rounded flex items-center gap-1.5 border text-[0.68rem] font-bold uppercase ${networkOnline ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
              <i className={`fa-solid ${networkOnline ? 'fa-wifi' : 'fa-wifi-slash'}`}></i>
              <span>{networkOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </span>

            <button
              onClick={handleToggleProxy}
              title="Toggle proxy routing for supported application requests"
              className={`py-1.5 px-2.5 rounded flex items-center gap-1.5 border transition text-[0.68rem] font-bold uppercase ${proxyConfig.enabled ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}
            >
              <i className={`fa-solid ${proxyConfig.enabled ? 'fa-shield-halved' : 'fa-shield'}`}></i>
              <span>PROXY {proxyConfig.enabled ? 'ON' : 'OFF'}</span>
            </button>

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
            { id: 'portfolio', label: 'ADOBE PORTFOLIO', icon: 'fa-images' },
            { id: 'instructions', label: 'INSTRUCTIONS & REJECTIONS', icon: 'fa-sliders' },
            { id: 'history', label: 'HISTORY', icon: 'fa-clock-rotate-left' },
            { id: 'proxy', label: 'PROXY', icon: 'fa-shield-halved' },
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
            {/* Research controls */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 shadow-lg space-y-4">
              <div>
                <label className="block text-[0.68rem] font-bold font-mono tracking-wider text-[var(--text-dim)] uppercase mb-1">Research objective / niche</label>
                <textarea value={researchNiche} disabled={isResearching} onChange={(e) => { setResearchNiche(e.target.value); localStorage.setItem('as_radar_x_research_niche', e.target.value); }} placeholder="Leave blank for autonomous discovery across industries, or describe the market question to investigate..." rows={2} className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded-lg p-3 text-xs font-mono text-[var(--text-main)] outline-none resize-y" />
                <p className="text-[0.64rem] text-[var(--text-dim)] mt-1">Gemini discovers its own search queries, sites, listings and follow-up pages. No fixed niche or URL watchlist.</p>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <div><label className="block text-[0.65rem] font-bold font-mono text-[var(--text-dim)] uppercase mb-1">Photo ideas</label><select value={photoCount} disabled={isResearching} onChange={(e) => { const v = Number(e.target.value); setPhotoCount(v); localStorage.setItem('as_radar_x_photo_count', String(v)); }} className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded py-2 px-3 text-xs font-mono text-[var(--text-main)]">{[0,1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
                <div><label className="block text-[0.65rem] font-bold font-mono text-[var(--text-dim)] uppercase mb-1">Video ideas</label><select value={videoCount} disabled={isResearching} onChange={(e) => { const v = Number(e.target.value); setVideoCount(v); localStorage.setItem('as_radar_x_video_count', String(v)); }} className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded py-2 px-3 text-xs font-mono text-[var(--text-main)]">{[0,1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
                <div><label className="block text-[0.65rem] font-bold font-mono text-[var(--text-dim)] uppercase mb-1">Tags per idea</label><select value={tagCount} disabled={isResearching} onChange={(e) => { const v = Number(e.target.value); setTagCount(v); localStorage.setItem('as_radar_x_tag_count', String(v)); }} className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded py-2 px-3 text-xs font-mono text-[var(--text-main)]">{[5,10,15,20,25,30,35,40,50].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
                <details className="flex-1 min-w-[230px]"><summary className="cursor-pointer text-[0.68rem] font-mono text-[var(--text-muted)] py-2">Optional title instructions</summary><textarea value={titleInstructions} disabled={isResearching} onChange={(e) => { setTitleInstructions(e.target.value); localStorage.setItem('as_radar_x_title_instructions', e.target.value); }} rows={2} placeholder="Leave blank to infer style from marketplace titles observed during this research." className="w-full mt-1 bg-[var(--bg-input)] border border-[var(--border-color)] rounded p-2 text-xs font-mono text-[var(--text-main)]" /></details>
                <div className="ml-auto flex items-center gap-3">{isResearching && <div className="font-mono text-xs text-[var(--text-dim)]">Elapsed <b className="text-[var(--accent-amber)]">{formatTimer(elapsedSeconds)}</b></div>}<button onClick={handleStartResearch} disabled={isResearching || (photoCount === 0 && videoCount === 0)} className="py-2.5 px-6 bg-[var(--accent-amber)] hover:bg-[var(--accent-amber-hover)] disabled:opacity-50 text-black font-bold font-mono text-xs uppercase tracking-wider rounded shadow-md transition flex items-center gap-2"><i className={'fa-solid ' + (isResearching ? 'fa-spinner fa-spin' : 'fa-play')}></i><span>{isResearching ? 'RESEARCHING...' : 'START DEEP RESEARCH'}</span></button></div>
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

            {isResearching && (
              <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4 shadow-lg space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-[var(--accent-amber)] font-bold text-xs"><span className="w-2 h-2 rounded-full bg-[var(--accent-amber)] animate-pulse"></span>{progressMessage}</div><span className="font-mono text-xs text-[var(--text-dim)]">{progressPercent}% · {formatTimer(elapsedSeconds)}</span></div>
                <div className="w-full h-2 bg-[var(--bg-input)] rounded-full overflow-hidden"><div className="h-full bg-[var(--accent-amber)] transition-all" style={{ width: progressPercent + '%' }} /></div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[0.64rem] text-[var(--text-dim)] font-mono"><span>Stage: {RESEARCH_STAGES.find(stage => stage.id === researchStage)?.label || researchStage}</span><span>{researchEvents.filter(event => event.type === 'page_visited').length} pages · {researchEvents.filter(event => event.type === 'browser_action').length} browser actions</span></div>
              </div>
            )}
            <ResearchBrowserPanel jobId={activeJobId || currentReport?.job_id || null} events={researchEvents} paused={researchStage === 'PAUSED_FOR_USER'} visible={showBrowser} onContinue={handleContinueResearch} onClose={() => { setShowBrowser(false); window.asRadarDesktop?.hideBrowser().catch(() => undefined); }} />
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

                    <div className="flex flex-wrap items-center gap-2 justify-end">
                      {isHistoricalReport && (
                        <button
                          onClick={handleBackFromHistoricalReport}
                          className="py-1.5 px-3 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] hover:border-[var(--accent-amber)] rounded font-mono text-xs text-[var(--text-main)] flex items-center gap-2 transition"
                        >
                          <i className="fa-solid fa-arrow-left text-[var(--accent-amber)]"></i>
                          <span>Back to Research</span>
                        </button>
                      )}
                      <button
                        onClick={() => copyToClipboard(buildReportCopyText(currentReport), 'report-all')}
                        className="py-2 px-4 bg-rose-500 hover:bg-rose-400 text-white border border-rose-400 rounded font-mono text-xs font-bold uppercase flex items-center gap-2 shadow-md transition"
                        title="Copy all photo and video titles, prompts, and tags in this report"
                      >
                        <i className={`fa-regular ${copiedKey === 'report-all' ? 'fa-check' : 'fa-copy'}`}></i>
                        <span>{copiedKey === 'report-all' ? 'Copied All Report' : 'Copy All Report'}</span>
                      </button>
                      <button
                        onClick={() => handleOpenJobEvidence(currentReport.job_id)}
                        className="py-1.5 px-3 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] hover:border-[var(--accent-amber)] rounded font-mono text-xs text-[var(--text-main)] flex items-center gap-2 transition"
                      >
                        <i className="fa-solid fa-database text-[var(--accent-amber)]"></i>
                        <span>Inspect Research Audit Log</span>
                      </button>
                    </div>
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
                  Ready for Deep Market Research
                </h3>
                <p className="text-xs text-[var(--text-dim)] max-w-lg mx-auto leading-relaxed">
                  Set photo/video targets above, leave Adobe Contributor signed in when the browser opens, then click{' '}
                  <strong className="text-[var(--accent-amber)]">&quot;START DEEP RESEARCH&quot;</strong> to generate data-driven stock content opportunities.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'portfolio' && (
          <div className="space-y-4">
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4">
              <h2 className="text-sm font-bold text-[var(--text-main)] uppercase">Adobe Contributor Portfolio</h2>
              <p className="text-[0.68rem] text-[var(--text-dim)] mt-1">Visible portfolio records, accepted/rejected/pending statuses and any displayed performance fields are synced automatically during research. Unknown values stay blank rather than being guessed.</p>
            </div>
            <PortfolioTable refreshKey={portfolioRefreshKey} />
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
                    <th className="p-3">Research Focus</th>
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
             TAB 5: PROXY SETTINGS
             ======================================================== */}
        {activeTab === 'proxy' && (
          <div className="space-y-6 max-w-4xl">
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                <div>
                  <h3 className="text-sm font-bold font-brand uppercase tracking-wider text-[var(--text-main)] flex items-center gap-2">
                    <i className="fa-solid fa-shield-halved text-[var(--accent-amber)]"></i>
                    <span>V2Ray / Local Proxy Configuration</span>
                  </h3>
                  <p className="text-[0.68rem] text-[var(--text-dim)] font-mono mt-1">
                    Route supported backend requests (Gemini, source collection and research) through your local V2Ray HTTP or SOCKS5 proxy.
                  </p>
                </div>
                <button
                  onClick={handleToggleProxy}
                  className={`py-2 px-4 rounded font-mono text-xs font-bold uppercase border transition ${proxyConfig.enabled ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-zinc-800 text-zinc-300 border-zinc-600'}`}
                >
                  <i className={`fa-solid ${proxyConfig.enabled ? 'fa-toggle-on' : 'fa-toggle-off'} mr-2`}></i>
                  Proxy {proxyConfig.enabled ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[0.68rem] uppercase font-mono font-bold text-[var(--text-dim)] mb-1">Proxy protocol</label>
                  <select
                    value={proxyConfig.protocol}
                    onChange={(e) => setProxyConfig((prev) => ({ ...prev, protocol: e.target.value as 'http' | 'socks5', port: e.target.value === 'socks5' ? 10808 : 10809 }))}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded p-2 text-xs font-mono text-[var(--text-main)] outline-none"
                  >
                    <option value="http">HTTP / V2Ray mixed proxy</option>
                    <option value="socks5">SOCKS5 (V2Ray)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[0.68rem] uppercase font-mono font-bold text-[var(--text-dim)] mb-1">Proxy host / IP</label>
                  <input value={proxyConfig.host} onChange={(e) => setProxyConfig((prev) => ({ ...prev, host: e.target.value }))} placeholder="127.0.0.1" className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded p-2 text-xs font-mono text-[var(--text-main)] outline-none" />
                </div>
                <div>
                  <label className="block text-[0.68rem] uppercase font-mono font-bold text-[var(--text-dim)] mb-1">Local proxy port</label>
                  <input type="number" min={1} max={65535} value={proxyConfig.port} onChange={(e) => setProxyConfig((prev) => ({ ...prev, port: Number(e.target.value) }))} className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded p-2 text-xs font-mono text-[var(--text-main)] outline-none" />
                </div>
                <div>
                  <label className="block text-[0.68rem] uppercase font-mono font-bold text-[var(--text-dim)] mb-1">Username (optional)</label>
                  <input value={proxyConfig.username} onChange={(e) => setProxyConfig((prev) => ({ ...prev, username: e.target.value }))} placeholder="Proxy username" autoComplete="off" className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded p-2 text-xs font-mono text-[var(--text-main)] outline-none" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[0.68rem] uppercase font-mono font-bold text-[var(--text-dim)] mb-1">Password (optional)</label>
                  <input type="password" value={proxyPasswordInput} onChange={(e) => setProxyPasswordInput(e.target.value)} placeholder={proxyConfig.hasPassword ? 'Saved password (leave blank to keep it)' : 'Proxy password'} autoComplete="new-password" className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded p-2 text-xs font-mono text-[var(--text-main)] outline-none" />
                  <p className="text-[0.65rem] font-mono text-[var(--text-dim)] mt-1">
                    {proxyConfig.hasPassword ? 'A proxy password is already saved locally. Leave blank to keep the saved password.' : 'Credentials are stored in the local app database.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button onClick={handleSaveProxyConfig} disabled={isSavingProxy} className="py-2 px-4 bg-[var(--accent-amber)] hover:bg-[var(--accent-amber-hover)] disabled:opacity-50 text-black font-bold font-mono text-xs uppercase rounded transition">
                  <i className={`fa-solid ${isSavingProxy ? 'fa-spinner fa-spin' : 'fa-floppy-disk'} mr-1.5`}></i>Save Proxy Settings
                </button>
                <button onClick={handleTestProxy} disabled={isTestingProxy} className="py-2 px-4 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] rounded font-mono text-xs text-[var(--text-main)] transition">
                  <i className={`fa-solid ${isTestingProxy ? 'fa-spinner fa-spin' : 'fa-plug'} mr-1.5`}></i>{isTestingProxy ? 'Testing...' : 'Test Connection'}
                </button>
              </div>

              {proxyTestFeedback && (
                <div className={`p-3 rounded border font-mono text-xs ${proxyTestFeedback.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
                  <i className={`fa-solid ${proxyTestFeedback.success ? 'fa-circle-check' : 'fa-triangle-exclamation'} mr-2`}></i>{proxyTestFeedback.message}
                </div>
              )}

              <div className="p-3 rounded border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[0.68rem] font-mono text-[var(--text-dim)] leading-relaxed">
                Note: V2Ray clients commonly expose HTTP/mixed and SOCKS5 listeners on different local ports. Use the address and port shown in your V2Ray client; defaults here are examples and may differ on your computer. Turning this toggle off returns supported backend requests to a direct connection. It does not change Windows' global proxy setting.
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
             TAB 6: SYSTEM CONFIG
             ======================================================== */}
        {activeTab === 'settings' && (
          <div className="space-y-6 max-w-4xl">
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
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="block text-[0.68rem] text-[var(--text-dim)] uppercase font-bold">Select Gemini Model</label>
                    <button type="button" onClick={handleRefreshGeminiModels} disabled={isRefreshingGeminiModels} className="py-1 px-2 rounded border border-[var(--border-color)] text-[var(--text-dim)] hover:text-[var(--accent-cyan)] disabled:opacity-50">
                      <i className={`fa-solid ${isRefreshingGeminiModels ? 'fa-spinner fa-spin' : 'fa-rotate'} mr-1`}></i>
                      {isRefreshingGeminiModels ? 'Refreshing...' : 'REFRESH MODELS'}
                    </button>
                  </div>
                  <select value={selectedModelInput} onChange={(e) => setSelectedModelInput(e.target.value)} className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded p-2 text-xs text-[var(--text-main)] outline-none">
                    {[...new Set(['auto', ...(geminiConfig.availableModels || []), selectedModelInput, geminiConfig.activeModel].filter((model): model is string => typeof model === 'string' && model.length > 0))].map((model) => (
                      <option key={model} value={model}>{model === 'auto' ? (lastSuccessfulGeminiModel ? `Auto (last successful: ${lastSuccessfulGeminiModel})` : 'Auto (try available models until one works)') : model}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[0.65rem] text-[var(--text-dim)]">Refresh fetches models available for the current API key. Auto tries models until one works and prioritizes the last successful model in future research.</p>
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

            {/* CONTENT & RESEARCH HISTORY CLEANUP */}
            <div className="bg-[var(--bg-card)] border border-red-500/30 rounded-lg p-5 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[var(--border-subtle)] gap-2">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-trash-can text-red-400 text-lg"></i>
                  <div>
                    <h3 className="text-sm font-bold font-brand uppercase tracking-wider text-[var(--text-main)]">
                      CONTENT &amp; RESEARCH HISTORY CLEANUP
                    </h3>
                    <span className="text-[0.66rem] text-[var(--text-dim)] font-mono">
                      Clean all stored research reports, generated content opportunities, and discussion evidence
                    </span>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[0.65rem] font-mono font-bold uppercase bg-red-500/10 text-red-400 border border-red-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                  {historyList.length} RECORD{historyList.length === 1 ? '' : 'S'} STORED
                </span>
              </div>

              <div className="p-3 bg-[var(--bg-input)] rounded border border-[var(--border-subtle)] font-mono text-xs text-[var(--text-dim)] leading-relaxed space-y-1.5">
                <p>
                  <strong className="text-[var(--text-main)]">Cleaned Data:</strong> All previous research history records, generated photo &amp; video opportunities, anti-duplication memory, and raw collected evidence.
                </p>
                <p className="text-emerald-400 flex items-center gap-1.5">
                  <i className="fa-solid fa-shield-halved"></i>
                  <span>
                    <strong className="text-emerald-300">Untouched &amp; Preserved:</strong> All Analyst Instructions, Exclusion &amp; Rejection memory, PDF instructions, and System credentials stay 100% untouched.
                  </span>
                </p>
              </div>

              {!showClearHistoryConfirm ? (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowClearHistoryConfirm(true)}
                    className="py-2.5 px-5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 hover:border-red-500 text-red-400 font-bold font-mono text-xs uppercase tracking-wider rounded transition flex items-center gap-2 shadow-sm"
                  >
                    <i className="fa-solid fa-trash-can"></i>
                    <span>CLEAN ALL HISTORY</span>
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-red-500/10 border border-red-500/40 rounded-lg space-y-3 font-mono text-xs">
                  <div className="flex items-start gap-2 text-red-300">
                    <i className="fa-solid fa-triangle-exclamation text-amber-400 mt-0.5"></i>
                    <div>
                      <strong>Are you sure you want to clean all history?</strong>
                      <div className="text-[0.68rem] text-[var(--text-muted)] mt-0.5">
                        This action will permanently delete all completed research runs ({historyList.length} records) and generated opportunities. Instructions and system settings will NOT be touched.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleCleanAllHistory}
                      disabled={isClearingHistory}
                      className="py-2 px-4 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold font-mono text-xs uppercase tracking-wider rounded transition flex items-center gap-2 shadow"
                    >
                      <i className={`fa-solid ${isClearingHistory ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
                      <span>{isClearingHistory ? 'CLEANING...' : 'YES, CLEAN ALL HISTORY'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowClearHistoryConfirm(false)}
                      disabled={isClearingHistory}
                      className="py-2 px-4 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] text-[var(--text-dim)] hover:text-[var(--text-main)] font-mono text-xs rounded transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
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
        AS-RADAR-X &bull; AUTONOMOUS STOCK MARKET RESEARCH &bull; LOCAL EVIDENCE ARCHIVE
      </footer>
    </div>
  );
}
