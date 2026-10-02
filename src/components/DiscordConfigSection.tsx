import React, { useState } from 'react';
import type { DiscordConfig } from '../../server/types.js';

interface DiscordConfigSectionProps {
  config: DiscordConfig;
  onSave: (updated: Partial<DiscordConfig>) => Promise<void>;
  showToast: (msg: string) => void;
  getApiUrl: (path: string) => string;
}

export function DiscordConfigSection({
  config,
  onSave,
  showToast,
  getApiUrl
}: DiscordConfigSectionProps) {
  const [botToken, setBotToken] = useState(config.botToken || '');
  const [guildId, setGuildId] = useState(config.guilds?.[0]?.id || '');
  const [channels, setChannels] = useState<Array<{ id: string; name?: string }>>(
    config.guilds?.[0]?.channels || []
  );
  const [timeframe, setTimeframe] = useState<'24h' | '7d'>(config.timeframe || '24h');
  const [collectMessages, setCollectMessages] = useState(config.collectMessages ?? true);
  const [collectThreads, setCollectThreads] = useState(config.collectThreads ?? true);

  const [newChannelInput, setNewChannelInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    botUser?: any;
    channelsVerified?: any[];
  } | null>(null);

  React.useEffect(() => {
    setBotToken(config.botToken || '');
    if (config.guilds?.[0]) {
      setGuildId(config.guilds[0].id || '');
      setChannels(config.guilds[0].channels || []);
    }
    if (config.timeframe) setTimeframe(config.timeframe);
    if (config.collectMessages !== undefined) setCollectMessages(config.collectMessages);
    if (config.collectThreads !== undefined) setCollectThreads(config.collectThreads);
  }, [config]);

  const handleAddChannel = () => {
    const cleanId = newChannelInput.replace(/[^0-9]/g, '').trim();
    if (!cleanId) return;
    if (!channels.some((c) => c.id === cleanId)) {
      setChannels([...channels, { id: cleanId, name: `channel-${cleanId.slice(-4)}` }]);
      setNewChannelInput('');
      showToast(`Channel ID ${cleanId} added.`);
    } else {
      showToast('This channel is already in the list.');
    }
  };

  const handleRemoveChannel = (chId: string) => {
    setChannels(channels.filter((c) => c.id !== chId));
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(getApiUrl('/api/discord/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken,
          guilds: [
            {
              id: guildId.trim(),
              channels
            }
          ]
        })
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        showToast('Discord Bot verified and connected!');
      } else {
        showToast('Discord Bot test failed. Check token.');
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Network error while testing Discord bot.'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        botToken,
        guilds: [
          {
            id: guildId.trim(),
            channels
          }
        ],
        timeframe,
        collectMessages,
        collectThreads
      });
      showToast('Discord research sources saved successfully.');
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
          <i className="fa-brands fa-discord text-indigo-400 text-lg"></i>
          <div>
            <h3 className="text-sm font-bold font-brand uppercase tracking-wider text-[var(--text-main)]">
              DISCORD RESEARCH SOURCES
            </h3>
            <span className="text-[0.66rem] text-[var(--text-dim)] font-mono">
              Bot REST API History Extraction (No self-bots &bull; Real server/channel messages)
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
          <span className="text-[0.65rem] text-[var(--text-dim)] uppercase block">Total Messages Extracted</span>
          <span className="font-bold text-[var(--accent-cyan)]">
            {config.collectedCount || 0} discussion messages
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

      {/* Bot Token Input */}
      <div>
        <label className="block text-[0.68rem] text-[var(--text-dim)] uppercase font-bold mb-1 font-mono flex justify-between">
          <span>Discord Bot Token</span>
          <button
            type="button"
            onClick={() => setShowToken(!showToken)}
            className="text-[0.62rem] text-[var(--accent-cyan)] hover:underline capitalize"
          >
            {showToken ? 'Hide' : 'Show'}
          </button>
        </label>
        <input
          type={showToken ? 'text' : 'password'}
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
          placeholder="••••••••"
          className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-cyan)] rounded p-2 text-xs font-mono text-[var(--text-main)] outline-none"
        />
        <span className="text-[0.62rem] text-[var(--text-dim)] font-mono mt-1 block">
          From Discord Developer Portal &gt; Applications &gt; Bot &gt; Reset/Copy Token. (Stored securely in database).
        </span>
      </div>

      {/* Guild ID & Channel IDs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
        <div>
          <label className="block text-[0.68rem] text-[var(--text-dim)] uppercase font-bold mb-1">
            Server / Guild ID
          </label>
          <input
            type="text"
            value={guildId}
            onChange={(e) => setGuildId(e.target.value)}
            placeholder="e.g. 104829384920384920"
            className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-cyan)] rounded p-2 text-xs text-[var(--text-main)] outline-none"
          />
        </div>

        <div>
          <label className="block text-[0.68rem] text-[var(--text-dim)] uppercase font-bold mb-1">
            Add Channel ID
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newChannelInput}
              onChange={(e) => setNewChannelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddChannel();
                }
              }}
              placeholder="e.g. 984928472910482910"
              className="flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-[var(--accent-cyan)] rounded p-2 text-xs text-[var(--text-main)] outline-none"
            />
            <button
              type="button"
              onClick={handleAddChannel}
              className="py-2 px-3 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] hover:border-[var(--accent-cyan)] rounded font-bold text-xs text-[var(--text-main)] transition"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Channel Badges List */}
      <div>
        <label className="text-[0.68rem] text-[var(--text-dim)] uppercase font-bold font-mono block mb-1">
          Configured Channels to Inspect ({channels.length})
        </label>
        <div className="flex flex-wrap gap-1.5 p-2.5 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded min-h-[44px]">
          {channels.map((ch) => (
            <span
              key={ch.id}
              className="inline-flex items-center gap-1.5 py-1 px-2.5 bg-[var(--bg-panel)] border border-[var(--border-color)] rounded text-xs font-mono text-[var(--text-main)] shadow-sm"
            >
              <i className="fa-solid fa-hashtag text-indigo-400 text-[0.7rem]"></i>
              <span>{ch.name || ch.id}</span>
              <button
                type="button"
                onClick={() => handleRemoveChannel(ch.id)}
                className="text-[var(--text-dim)] hover:text-red-400 font-bold ml-1"
                title="Remove channel"
              >
                &times;
              </button>
            </span>
          ))}
          {!channels.length && (
            <span className="text-xs text-[var(--text-dim)] font-mono p-1">
              No channels added yet. Enter a Discord Channel ID above to monitor message history.
            </span>
          )}
        </div>
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
                  ? 'bg-[var(--accent-cyan)] text-black'
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
                  ? 'bg-[var(--accent-cyan)] text-black'
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
              checked={collectMessages}
              onChange={(e) => setCollectMessages(e.target.checked)}
              className="accent-[var(--accent-cyan)] w-4 h-4 cursor-pointer"
            />
            <span className="text-xs text-[var(--text-main)]">Collect Channel Messages</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={collectThreads}
              onChange={(e) => setCollectThreads(e.target.checked)}
              className="accent-[var(--accent-cyan)] w-4 h-4 cursor-pointer"
            />
            <span className="text-xs text-[var(--text-main)]">Collect Threads / Replies</span>
          </label>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={isTesting}
          className="py-2 px-4 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] hover:border-[var(--accent-cyan)] rounded font-mono text-xs font-bold text-[var(--text-main)] flex items-center gap-2 transition disabled:opacity-50"
        >
          <i className={`fa-solid ${isTesting ? 'fa-spinner fa-spin' : 'fa-plug'} text-indigo-400`}></i>
          <span>{isTesting ? 'Testing...' : 'TEST CONNECTION'}</span>
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="py-2 px-5 bg-[var(--accent-cyan)] hover:bg-cyan-400 text-black font-bold font-mono text-xs uppercase rounded flex items-center gap-2 shadow transition disabled:opacity-50"
        >
          <i className="fa-solid fa-floppy-disk"></i>
          <span>{isSaving ? 'Saving...' : 'SAVE SETTINGS'}</span>
        </button>
      </div>
    </div>
  );
}
