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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[85vh] bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-2xl flex flex-col overflow-hidden animate-fade-in">
        {/* Modal Header */}
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-panel)]">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-database text-[var(--accent-amber)]"></i>
            <div>
              <h3 className="text-sm font-bold font-brand uppercase tracking-wider text-[var(--text-main)]">
                Stored Community Discussion Signals (SQLite Store)
              </h3>
              <p className="text-[0.68rem] text-[var(--text-dim)] font-mono">
                Job ID: {jobId} · {items.length} stored raw conversation records
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
              No discussion signals found for this job ID in SQLite store.
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
                      it.source === 'Reddit'
                        ? 'text-orange-400 bg-orange-500/10 border border-orange-500/20'
                        : it.source === 'Discord'
                        ? 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20'
                        : 'text-cyan-300 bg-cyan-500/10 border border-cyan-500/20'
                    }`}
                  >
                    {it.source}
                  </span>
                  <span className="text-[0.62rem] text-[var(--text-dim)] uppercase">
                    {it.evidence_type?.replace(/_/g, ' ') || 'Discussion'}
                  </span>
                </div>

                <div className="font-semibold text-xs text-[var(--text-main)] mb-1">
                  {it.raw_title}
                </div>

                {it.raw_description && (
                  <p className="text-[0.7rem] text-[var(--text-muted)] mb-2 line-clamp-3">
                    {it.raw_description}
                  </p>
                )}

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
