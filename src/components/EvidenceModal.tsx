import React from 'react';

export function EvidenceModal({
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
      <div className="relative w-full max-w-5xl max-h-[88vh] bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-panel)]">
          <div><h3 className="text-sm font-bold uppercase text-[var(--text-main)]">Research evidence & audit trail</h3><p className="text-[0.68rem] text-[var(--text-dim)] font-mono">Job {jobId} · {items.length} stored events</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-main)]"><i className="fa-solid fa-xmark"></i></button>
        </div>
        <div className="p-4 overflow-y-auto space-y-3">
          {isLoading ? <div className="py-12 text-center text-[var(--accent-amber)]"><i className="fa-solid fa-spinner fa-spin text-2xl mb-2"></i><div>Loading locally stored research observations…</div></div>
          : !items.length ? <div className="py-8 text-center text-[var(--text-dim)]">No audit events were recorded for this job.</div>
          : items.slice().reverse().map((event, index) => (
            <details key={event.id || index} className="p-3 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded">
              <summary className="cursor-pointer flex flex-wrap items-center justify-between gap-2">
                <span className="text-[0.68rem] font-bold text-[var(--text-main)] uppercase">{String(event.type || 'event').replace(/_/g, ' ')}</span>
                <span className="text-[0.62rem] text-[var(--text-dim)]">{event.at ? new Date(event.at).toLocaleString() : ''}</span>
              </summary>
              <p className="text-xs text-[var(--text-main)] mt-2">{event.message || ''}</p>
              {event.url && <a href={event.url} target="_blank" rel="noreferrer" className="block text-[0.66rem] text-[var(--accent-amber)] hover:underline break-all mt-2">{event.url}</a>}
              {event.details && <pre className="mt-2 p-2 rounded bg-[var(--bg-panel)] text-[0.63rem] leading-relaxed text-[var(--text-muted)] overflow-x-auto whitespace-pre-wrap break-words max-h-[420px]">{JSON.stringify(event.details, null, 2)}</pre>}
            </details>
          ))}
        </div>
        <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-panel)] flex justify-end"><button onClick={onClose} className="py-1.5 px-4 bg-[var(--accent-amber)] text-black font-bold text-xs uppercase rounded">Close</button></div>
      </div>
    </div>
  );
}
