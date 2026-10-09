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
  const primaryTags = tagsList.slice(0, 10);
  const secondaryTags = tagsList.slice(10);

  return (
    <article className="relative bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 pl-6 shadow-md overflow-hidden before:content-[''] before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-[var(--accent-amber)] transition-all hover:border-[var(--accent-amber)]/40">
      {/* Header with Card Number & Copy Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-block px-2 py-0.5 rounded bg-amber-500/10 text-[var(--accent-amber)] text-[0.68rem] font-bold font-mono tracking-wider">
              #{index} PHOTO OPPORTUNITY
            </span>
            <span className="inline-block px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[0.62rem] font-mono">
              SEO UNIFIED TITLE
            </span>
          </div>
          <h3 className="text-base font-bold text-[var(--text-main)] leading-relaxed font-sans">
            {photo.title || 'Untitled Stock Photo Opportunity'}
          </h3>
        </div>

        <button
          onClick={() => onCopy(photo.title, `p-title-${index}`)}
          className="inline-flex items-center gap-1.5 py-1.5 px-3 bg-[var(--bg-input)] hover:border-[var(--accent-amber)] hover:text-[var(--text-main)] border border-[var(--border-color)] rounded-md text-[0.68rem] font-mono text-[var(--text-muted)] transition shrink-0 cursor-pointer"
          title="Copy SEO Title"
        >
          <i className={`fa-regular ${copiedKey === `p-title-${index}` ? 'fa-check text-[var(--status-success)]' : 'fa-copy'}`}></i>
          <span>{copiedKey === `p-title-${index}` ? 'COPIED' : 'COPY SEO TITLE'}</span>
        </button>
      </div>

      {/* AI Image Generation Prompt Box (Top-Level with Textures & Realism) */}
      {photo.prompt && (
        <div className="p-4 bg-[var(--code-bg)] border border-[var(--border-color)] rounded-lg mb-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[0.68rem] font-bold font-mono uppercase tracking-wider text-[var(--accent-amber)] flex items-center gap-1.5">
              <i className="fa-solid fa-wand-magic-sparkles"></i>
              Top-Level AI Image Generation Prompt (Textures & Cinematography)
            </span>
            <button
              onClick={() => onCopy(photo.prompt, `p-prompt-${index}`)}
              className="inline-flex items-center gap-1.5 py-1 px-2.5 bg-[var(--bg-input)] hover:border-[var(--accent-amber)] hover:text-[var(--text-main)] border border-[var(--border-color)] rounded text-[0.65rem] font-mono text-[var(--text-muted)] transition cursor-pointer"
            >
              <i className={`fa-regular ${copiedKey === `p-prompt-${index}` ? 'fa-check text-[var(--status-success)]' : 'fa-copy'}`}></i>
              <span>{copiedKey === `p-prompt-${index}` ? 'COPIED' : 'COPY PROMPT'}</span>
            </button>
          </div>
          <p className="font-mono text-xs text-[var(--text-main)] whitespace-pre-wrap leading-relaxed select-all bg-[var(--bg-input)]/40 p-3 rounded border border-[var(--border-subtle)]">
            {photo.prompt}
          </p>
        </div>
      )}

      {/* 25 SEO Keywords / Tags Section */}
      <div className="bg-[var(--bg-input)]/60 border border-[var(--border-subtle)] rounded-lg p-3.5">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[0.68rem] font-bold font-mono uppercase tracking-wider text-[var(--text-main)] flex items-center gap-1.5">
              <i className="fa-solid fa-tags text-[var(--accent-amber)]"></i>
              25 Stock Keywords / Tags ({tagsList.length}/25)
            </span>
            <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-[var(--accent-amber)] text-[0.62rem] font-mono font-bold">
              Top 10 High-Impact SEO
            </span>
          </div>
          {tagsList.length > 0 && (
            <button
              onClick={() => onCopy(tagsCopyValue, `p-tags-${index}`)}
              className="inline-flex items-center gap-1.5 py-1 px-2.5 bg-[var(--bg-panel)] hover:border-[var(--accent-amber)] hover:text-[var(--text-main)] border border-[var(--border-color)] rounded text-[0.65rem] font-mono text-[var(--text-muted)] transition cursor-pointer"
            >
              <i className={`fa-regular ${copiedKey === `p-tags-${index}` ? 'fa-check text-[var(--status-success)]' : 'fa-copy'}`}></i>
              <span>{copiedKey === `p-tags-${index}` ? 'COPIED' : 'COPY ALL 25 TAGS'}</span>
            </button>
          )}
        </div>

        {/* Primary Top 10 High-Impact Tags */}
        <div className="mb-2">
          <div className="text-[0.60rem] uppercase font-mono tracking-wider text-[var(--text-dim)] font-semibold mb-1">
            Primary High-Impact SEO Tags (1–10):
          </div>
          <div className="flex flex-wrap gap-1.5">
            {primaryTags.map((tag, tIdx) => (
              <span
                key={tIdx}
                className="inline-flex items-center gap-1 py-0.5 px-2 bg-amber-500/10 border border-amber-500/30 text-[var(--accent-amber)] rounded text-[0.68rem] font-mono font-medium"
              >
                <span className="text-[0.55rem] opacity-60">#{tIdx + 1}</span>
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Secondary Contextual Tags 11-25 */}
        {secondaryTags.length > 0 && (
          <div>
            <div className="text-[0.60rem] uppercase font-mono tracking-wider text-[var(--text-dim)] font-semibold mb-1">
              Extended Commercial & Contextual Tags (11–25):
            </div>
            <div className="flex flex-wrap gap-1.5">
              {secondaryTags.map((tag, tIdx) => (
                <span
                  key={tIdx + 10}
                  className="inline-flex items-center gap-1 py-0.5 px-2 bg-[var(--bg-panel)] border border-[var(--border-color)] rounded text-[0.66rem] font-mono text-[var(--text-muted)]"
                >
                  <span className="text-[0.55rem] opacity-50">#{tIdx + 11}</span>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Discussion Evidence Accordion (Traceability) */}
      {photo.evidence && Object.keys(photo.evidence).length > 0 && (
        <div className="mt-3.5 pt-2.5 border-t border-dashed border-[var(--border-color)]">
          <button
            onClick={onToggleEvidence}
            className="inline-flex items-center gap-1.5 py-1 px-2.5 bg-[var(--bg-panel)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] rounded text-[0.68rem] font-mono text-[var(--text-muted)] hover:text-[var(--text-main)] transition cursor-pointer"
          >
            <i className="fa-solid fa-comments text-[var(--accent-amber)]"></i>
            <span>{isOpen ? 'Hide Discussion Evidence' : 'View Human Discussion Evidence'}</span>
          </button>

          {isOpen && (
            <div className="mt-2.5 p-3 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded font-mono text-xs space-y-1">
              <div className="text-[0.64rem] font-bold uppercase tracking-wider text-[var(--accent-amber)] mb-1">
                Human Discussion Traceability
              </div>
              {Object.entries(photo.evidence).map(([k, v]) => (
                <div key={k} className="text-[0.70rem] text-[var(--text-main)]">
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
