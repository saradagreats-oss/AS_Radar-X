import React, { useState } from 'react';
import type { RedditConfig } from '../../server/types.js';

const SUGGESTED_SUBREDDITS = [
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

interface RedditConfigSectionProps {
  config: RedditConfig;
  onSave: (updated: Partial<RedditConfig>) => Promise<void>;
  showToast: (msg: string) => void;
  getApiUrl: (path: string) => string;
}

export function RedditConfigSection({
  config,
  onSave,
  showToast,
  getApiUrl
}: RedditConfigSectionProps) {
  const [clientId, setClientId] = useState(config.clientId || '');
  const [clientSecret, setClientSecret] = useState(config.clientSecret || '');
  const [userAgent, setUserAgent] = useState(config.userAgent || 'AS-Radar-X/2.0 (by /u/saradagreats)');
  const [subreddits, setSubreddits] = useState<string[]>(config.subreddits || [...SUGGESTED_SUBREDDITS]);
  const [timeframe, setTimeframe] = useState<'24h' | '7d'>(config.timeframe || '24h');
  const [collectPosts, setCollectPosts] = useState(config.collectPosts ?? true);
  const [collectComments, setCollectComments] = useState(config.collectComments ?? true);

  const [newSubInput, setNewSubInput] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);

  // Sync state if config changes from server
  React.useEffect(() => {
    setClientId(config.clientId || '');
    setClientSecret(config.clientSecret || '');
    setUserAgent(config.userAgent || 'AS-Radar-X/2.0 (by /u/saradagreats)');
    if (config.subreddits && config.subreddits.length > 0) setSubreddits(config.subreddits);
    if (config.timeframe) setTimeframe(config.timeframe);
    if (config.collectPosts !== undefined) setCollectPosts(config.collectPosts);
    if (config.collectComments !== undefined) setCollectComments(config.collectComments);
  }, [config]);

  const handleAddSubreddit = () => {
    const clean = newSubInput.replace(/^r\//i, '').trim();
    if (!clean) return;
    if (!subreddits.includes(clean)) {
      setSubreddits([...subreddits, clean]);
      setNewSubInput('');
      showToast(`Added r/${clean} to research list.`);
    } else {
      showToast(`r/${clean} is already in the list.`);
    }
  };

  const handleRemoveSubreddit = (sub: string) => {
    setSubreddits(subreddits.filter((s) => s !== sub));
  };

  const handleRestoreSuggestions = () => {
    const merged = Array.from(new Set([...subreddits, ...SUGGESTED_SUBREDDITS]));
    setSubreddits(merged);
    showToast('Suggested communities added.');
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(getApiUrl('/api/reddit/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          clientSecret,
          userAgent
        })
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        showToast('Reddit API connection verified!');
      } else {
        showToast('Reddit connection failed. Check credentials.');
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Network error while testing Reddit API.'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        clientId,
        clientSecret,
        userAgent,
        subreddits,
        timeframe,
        collectPosts,
        collectComments
      });
      showToast('Reddit research sources saved successfully.');
    } catch (err: any) {
      showToast(`Failed to save: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[var(--border-subtle)] gap-2">
        <div className="flex items-center gap-2">
          <i className="fa-brands fa-reddit text-orange-500 text-lg"></i>
          <div>
            <h3 className="text-sm font-bold font-brand uppercase tracking-wider text-[var(--text-main)]">
              REDDIT RESEARCH SOURCES
            </h3>
            <span className="text-[0.66rem] text-[var(--text-dim)] font-mono">
              OAuth Discussion &amp; Comment Extraction (Zero initial keyword filtering)
            </span>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[0.65rem] font-mono font-bold uppercase ${
              config.connected
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'bg-red-500/10 text-red-400 border border-red-500/30'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${config.connected ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
            {config.connected ? 'CONNECTED' : 'NOT CONNECTED'}
          </span>
        </div>
      </div>

      {/* Stats Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
        <div className="p-2.5 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded">
          <span className="text-[0.65rem] text-[var(--text-dim)] uppercase block">Last Successful Collection</span>
          <span className="font-bold text-[var(--text-main)]">
            {config.lastCollectedAt ? new Date(config.lastCollectedAt).toLocaleString() : 'No collection yet'}
          </span>
        </div>
        <div className="p-2.5 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded">
          <span className="text-[0.65rem] text-[var(--text-dim)] uppercase block">Total Posts/Comments Extracted</span>
          <span className="font-bold text-[var(--accent-amber)]">
            {config.collectedCount || 0} discussion records
          </span>
        </div>
      </div>

      {/* Test Result Message */}
      {testResult && (
        <div
          className={`p-3 rounded border font-mono text-xs flex items-start gap-2 ${
            testResult.success
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          <i
            className={`fa-solid ${
              testResult.success ? 'fa-circle-check text-emerald-400' : 'fa-circle-xmark text-red-400'
            } mt-0.5`}
          ></i>
          <div className="flex-1 leading-relaxed">
            <strong>{testResult.success ? 'Connected: ' : 'Error: '}</strong>
            {testResult.message}
          </div>
        </div>
      )}

      {/* Credentials Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
        <div>
          <label className="block text-[0.68rem] text-[var(--text-dim)] uppercase font-bold mb-1">
            Reddit Client ID
          </label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="e.g. 14-char script app ID"
            className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded p-2 text-xs text-[var(--text-main)] outline-none"
          />
        </div>

        <div>
          <label className="block text-[0.68rem] text-[var(--text-dim)] uppercase font-bold mb-1 flex justify-between">
            <span>Reddit Client Secret</span>
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="text-[0.62rem] text-[var(--accent-cyan)] hover:underline capitalize"
            >
              {showSecret ? 'Hide' : 'Show'}
            </button>
          </label>
          <input
            type={showSecret ? 'text' : 'password'}
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded p-2 text-xs text-[var(--text-main)] outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-[0.68rem] text-[var(--text-dim)] uppercase font-bold mb-1 font-mono">
          User Agent
        </label>
        <input
          type="text"
          value={userAgent}
          onChange={(e) => setUserAgent(e.target.value)}
          placeholder="AS-Radar-X/2.0 (by /u/username)"
          className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded p-2 text-xs font-mono text-[var(--text-main)] outline-none"
        />
      </div>

      {/* Research Period & Collection Controls */}
      <div className="p-3 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded space-y-3 font-mono text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-[0.7rem] text-[var(--text-dim)] uppercase font-bold">Research Window:</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTimeframe('24h')}
              className={`py-1 px-3 rounded text-xs font-bold transition ${
                timeframe === '24h'
                  ? 'bg-[var(--accent-amber)] text-black'
                  : 'bg-[var(--bg-panel)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              24 Hours
            </button>
            <button
              type="button"
              onClick={() => setTimeframe('7d')}
              className={`py-1 px-3 rounded text-xs font-bold transition ${
                timeframe === '7d'
                  ? 'bg-[var(--accent-amber)] text-black'
                  : 'bg-[var(--bg-panel)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              7 Days
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-[var(--border-subtle)]">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={collectPosts}
              onChange={(e) => setCollectPosts(e.target.checked)}
              className="accent-[var(--accent-amber)] w-4 h-4 cursor-pointer"
            />
            <span className="text-xs text-[var(--text-main)]">Collect Posts (Hot / Top)</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={collectComments}
              onChange={(e) => setCollectComments(e.target.checked)}
              className="accent-[var(--accent-amber)] w-4 h-4 cursor-pointer"
            />
            <span className="text-xs text-[var(--text-main)]">Collect Discussion Comments</span>
          </label>
        </div>
      </div>

      {/* Subreddit List Manager */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[0.68rem] text-[var(--text-dim)] uppercase font-bold font-mono">
            Monitored Subreddits ({subreddits.length})
          </label>
          <button
            type="button"
            onClick={handleRestoreSuggestions}
            className="text-[0.62rem] text-[var(--accent-amber)] hover:underline font-mono"
          >
            + Add Suggested Default Communities
          </button>
        </div>

        {/* Badges List */}
        <div className="flex flex-wrap gap-1.5 p-2.5 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded min-h-[50px]">
          {subreddits.map((sub) => (
            <span
              key={sub}
              className="inline-flex items-center gap-1.5 py-1 px-2.5 bg-[var(--bg-panel)] border border-[var(--border-color)] rounded text-xs font-mono text-[var(--text-main)] shadow-sm"
            >
              <i className="fa-brands fa-reddit text-orange-400 text-[0.7rem]"></i>
              <span>r/{sub}</span>
              <button
                type="button"
                onClick={() => handleRemoveSubreddit(sub)}
                className="text-[var(--text-dim)] hover:text-red-400 font-bold ml-1"
                title="Remove subreddit"
              >
                &times;
              </button>
            </span>
          ))}
          {!subreddits.length && (
            <span className="text-xs text-[var(--text-dim)] font-mono p-1">
              No subreddits added. Add below or click &quot;Add Suggested Default Communities&quot;.
            </span>
          )}
        </div>

        {/* Add Subreddit Input */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-2 text-xs font-mono text-[var(--text-dim)]">r/</span>
            <input
              type="text"
              value={newSubInput}
              onChange={(e) => setNewSubInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddSubreddit();
                }
              }}
              placeholder="e.g. cinema4d, AfterEffects, filmmaker..."
              className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-amber)] rounded py-1.5 pl-7 pr-2.5 text-xs font-mono text-[var(--text-main)] outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleAddSubreddit}
            className="py-1.5 px-4 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] hover:border-[var(--accent-amber)] rounded font-mono text-xs font-bold text-[var(--text-main)] transition"
          >
            Add
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={isTesting}
          className="py-2 px-4 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] hover:border-[var(--accent-amber)] rounded font-mono text-xs font-bold text-[var(--text-main)] flex items-center gap-2 transition disabled:opacity-50"
        >
          <i className={`fa-solid ${isTesting ? 'fa-spinner fa-spin' : 'fa-plug'} text-orange-400`}></i>
          <span>{isTesting ? 'Testing...' : 'TEST CONNECTION'}</span>
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="py-2 px-5 bg-[var(--accent-amber)] hover:bg-[var(--accent-amber-hover)] text-black font-bold font-mono text-xs uppercase rounded flex items-center gap-2 shadow transition disabled:opacity-50"
        >
          <i className="fa-solid fa-floppy-disk"></i>
          <span>{isSaving ? 'Saving...' : 'SAVE SETTINGS'}</span>
        </button>
      </div>
    </div>
  );
}
