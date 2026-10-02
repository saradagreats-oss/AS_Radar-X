import React from 'react';
import type { VideoOpportunity } from '../../server/types.js';

interface VideoCardProps {
  video: VideoOpportunity;
  index: number;
  isOpen: boolean;
  onToggleEvidence: () => void;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}

export function VideoCard({ video, index, isOpen, onToggleEvidence, copiedKey, onCopy }: VideoCardProps) {
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
          <div className="text-[0.64rem] font-bold font-mono uppercase tracking-wider text-[var(--accent-cyan)] mb-1">Differentiation Strategy</div>
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
            <i className="fa-solid fa-comments text-[var(--accent-cyan)]"></i>
            <span>{isOpen ? 'Hide Discussion Evidence' : 'View Human Discussion Evidence & Context'}</span>
          </button>

          {isOpen && (
            <div className="mt-3 p-3 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded font-mono text-xs space-y-1.5">
              <div className="text-[0.66rem] font-bold uppercase tracking-wider text-[var(--accent-cyan)] mb-1">
                Human Discussion Traceability
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
