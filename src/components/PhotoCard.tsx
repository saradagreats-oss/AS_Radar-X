import React from 'react';
import type { PhotoOpportunity } from '../../server/types.js';

interface PhotoCardProps {
  photo: PhotoOpportunity;
  index: number;
  isOpen: boolean;
  onToggleEvidence: () => void;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}

export function PhotoCard({ photo, index, isOpen, onToggleEvidence, copiedKey, onCopy }: PhotoCardProps) {
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
          <div className="text-[0.64rem] font-bold font-mono uppercase tracking-wider text-emerald-400 mb-1">Differentiation Strategy</div>
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
            <i className="fa-solid fa-comments text-[var(--accent-amber)]"></i>
            <span>{isOpen ? 'Hide Discussion Evidence' : 'View Human Discussion Evidence & Context'}</span>
          </button>

          {isOpen && (
            <div className="mt-3 p-3 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded font-mono text-xs space-y-1.5">
              <div className="text-[0.66rem] font-bold uppercase tracking-wider text-[var(--accent-amber)] mb-1">
                Human Discussion Traceability
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
