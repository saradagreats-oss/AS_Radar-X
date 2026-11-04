import React, { useEffect, useRef, useState } from 'react';

interface ResearchBrowserPanelProps {
  jobId: string | null;
  events: any[];
  paused: boolean;
  visible: boolean;
  onContinue: () => void;
  onClose: () => void;
}

export function ResearchBrowserPanel({ jobId, events, paused, visible, onContinue, onClose }: ResearchBrowserPanelProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [browserStatus, setBrowserStatus] = useState<any>({ available: false, visible: false, url: '', title: '' });

  useEffect(() => {
    if (!visible || !window.asRadarDesktop?.isDesktop) return;
    const syncBounds = () => {
      const el = hostRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      window.asRadarDesktop?.setBrowserBounds({
        x: Math.max(0, Math.round(r.left)),
        y: Math.max(0, Math.round(r.top)),
        width: Math.max(0, Math.round(r.width)),
        height: Math.max(0, Math.round(r.height))
      });
    };
    syncBounds();
    const observer = typeof ResizeObserver !== 'undefined' && hostRef.current ? new ResizeObserver(syncBounds) : null;
    if (hostRef.current && observer) observer.observe(hostRef.current);
    window.addEventListener('resize', syncBounds);
    window.addEventListener('scroll', syncBounds, true);
    const timer = window.setInterval(syncBounds, 700);
    window.asRadarDesktop.browserStatus().then(setBrowserStatus).catch(() => undefined);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncBounds);
      window.removeEventListener('scroll', syncBounds, true);
      window.clearInterval(timer);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !window.asRadarDesktop?.isDesktop) return;
    const unsubscribe = window.asRadarDesktop.onBrowserEvent((event) => {
      setBrowserStatus((previous: any) => ({ ...previous, ...event }));
    });
    return unsubscribe;
  }, [visible]);

  const latestPage = [...events].reverse().find((event) => event.type === 'page_visited');
  const latestUrl = latestPage?.url || browserStatus.url || '';
  const latestTitle = latestPage?.message || browserStatus.title || 'Research browser';
  const latestActivity = [...events].filter((event) => ['agent_intent','browser_action','human_handoff','portfolio_synced'].includes(event.type)).slice(-5).reverse();

  if (!visible) return null;

  return (
    <section className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-main)]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            LIVE RESEARCH BROWSER
          </div>
          <div className="text-[0.68rem] text-[var(--text-dim)] truncate mt-1">{latestTitle}</div>
          <div className="text-[0.62rem] text-[var(--text-dim)] truncate font-mono max-w-[75vw]">{latestUrl}</div>
        </div>
        <div className="flex items-center gap-2">
          {paused && (
            <button onClick={onContinue} className="py-2 px-3 rounded bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold">
              <i className="fa-solid fa-play mr-1"></i> DONE / CONTINUE
            </button>
          )}
          <button onClick={onClose} className="p-2 rounded border border-[var(--border-color)] text-[var(--text-dim)] hover:text-[var(--text-main)]" title="Hide browser">
            <i className="fa-solid fa-eye-slash"></i>
          </button>
        </div>
      </div>
      <div ref={hostRef} className="relative min-h-[350px] h-[min(54vh,560px)] bg-[#101319]">
        {!window.asRadarDesktop?.isDesktop && (
          <div className="absolute inset-0 grid place-items-center p-6 text-sm text-center text-[var(--text-dim)]">
            The live embedded research browser is available in the Windows desktop EXE.
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-4 py-3 border-t border-[var(--border-subtle)] text-[0.66rem] font-mono">
        <div><span className="text-[var(--text-dim)]">PAGES</span><div className="text-[var(--text-main)] font-bold">{events.filter((e) => e.type === 'page_visited').length}</div></div>
        <div><span className="text-[var(--text-dim)]">ACTIONS</span><div className="text-[var(--text-main)] font-bold">{events.filter((e) => e.type === 'browser_action').length}</div></div>
        <div><span className="text-[var(--text-dim)]">SCREENSHOTS</span><div className="text-[var(--text-main)] font-bold">{events.filter((e) => e.type === 'browser_action' && e.details?.screenshot).length}</div></div>
        <div><span className="text-[var(--text-dim)]">PORTFOLIO</span><div className="text-[var(--text-main)] font-bold">{events.filter((e) => e.type === 'portfolio_synced').slice(-1)[0]?.details?.assetsFound ?? '—'} records</div></div>
      </div>
      {latestActivity.length > 0 && (
        <details className="border-t border-[var(--border-subtle)] px-4 py-2">
          <summary className="cursor-pointer text-[0.68rem] font-bold text-[var(--text-muted)]">RECENT AGENT ACTIVITY</summary>
          <div className="pt-2 space-y-1.5">
            {latestActivity.map((event) => (
              <div key={event.id} className="text-[0.66rem] text-[var(--text-dim)] flex gap-2">
                <span className="text-[var(--accent-amber)] shrink-0">{new Date(event.at).toLocaleTimeString()}</span>
                <span className="break-words">{event.message}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
