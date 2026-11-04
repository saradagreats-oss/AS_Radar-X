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

function ScoreDetails({ score }: { score: PhotoOpportunity['score'] }) {
  if (!score) return <div className="text-[0.68rem] text-[var(--text-dim)]">No score was calculated for this item.</div>;
  const labels: Record<string, string> = {
    recurring_demand: 'Recurring demand',
    commercial_use: 'Commercial use',
    marketplace_evidence: 'Marketplace evidence',
    supply_gap: 'Supply / angle gap',
    longevity: 'Longevity',
    production_feasibility: 'Production feasibility'
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-[var(--text-main)]">Evidence priority score</div>
        <div className="text-xl font-black text-[var(--accent-amber)] tabular-nums">{score.score}/100</div>
      </div>
      <div className="flex items-center gap-2 text-[0.65rem] text-[var(--text-dim)]">
        <span className="px-2 py-0.5 rounded bg-[var(--bg-input)] border border-[var(--border-color)]">{score.confidence} EVIDENCE CONFIDENCE</span>
        <span>Not a probability of sales.</span>
      </div>
      <div className="space-y-2">
        {Object.entries(score.breakdown).map(([key, component]) => (
          <div key={key} className="grid grid-cols-[minmax(115px,1fr)_46px] gap-2 items-start">
            <div>
              <div className="text-[0.68rem] font-semibold text-[var(--text-main)]">{labels[key] || key}</div>
              <div className="h-1.5 bg-[var(--bg-input)] rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-[var(--accent-amber)]" style={{ width: `${Math.max(0, Math.min(100, component.score))}%` }} />
              </div>
              <div className="text-[0.62rem] text-[var(--text-dim)] mt-1">{component.reason}</div>
              {component.evidence_ids?.length > 0 && <div className="text-[0.60rem] text-[var(--accent-amber)] mt-0.5">Sources: {component.evidence_ids.join(', ')}</div>}
            </div>
            <div className="text-right font-mono text-xs font-bold text-[var(--text-main)]">{component.score}</div>
          </div>
        ))}
      </div>
      <div className="text-[0.62rem] leading-relaxed text-[var(--text-dim)] border-t border-[var(--border-subtle)] pt-2">{score.formula}</div>
    </div>
  );
}

export function PhotoCard({ photo, index, isOpen, onToggleEvidence, copiedKey, onCopy }: PhotoCardProps) {
  const tags = Array.isArray(photo.tags) ? photo.tags : [];
  const key = `p-${index}`;
  const copy = (value: string, suffix: string) => onCopy(value, `${key}-${suffix}`);
  return (
    <article className="relative bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 pl-6 shadow-md overflow-hidden before:content-[''] before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-[var(--accent-amber)] transition-all hover:border-[var(--accent-amber)]/40">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-[var(--accent-amber)] text-[0.68rem] font-bold font-mono">#{index} PHOTO</span>
            {photo.score && <span className="px-2 py-0.5 rounded bg-[var(--bg-input)] text-[var(--text-muted)] text-[0.62rem] font-mono">{photo.score.score}/100 · {photo.score.confidence}</span>}
          </div>
          <h3 className="text-base font-bold text-[var(--text-main)] leading-relaxed">{photo.title || 'Untitled Stock Photo Opportunity'}</h3>
        </div>
        <button onClick={() => copy(photo.title || '', 'title')} className="py-1.5 px-3 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-md text-[0.68rem] font-mono text-[var(--text-muted)] shrink-0">
          <i className={`fa-regular ${copiedKey === `${key}-title` ? 'fa-check' : 'fa-copy'} mr-1`}></i>{copiedKey === `${key}-title` ? 'COPIED' : 'COPY TITLE'}
        </button>
      </div>
      {photo.prompt && <div className="p-4 bg-[var(--code-bg)] border border-[var(--border-color)] rounded-lg mb-4">
        <div className="flex justify-between items-center gap-2 mb-2">
          <span className="text-[0.68rem] font-bold font-mono uppercase text-[var(--accent-amber)]"><i className="fa-solid fa-wand-magic-sparkles mr-1.5"></i>Production prompt</span>
          <button onClick={() => copy(photo.prompt, 'prompt')} className="text-[0.65rem] font-mono text-[var(--text-muted)]"><i className="fa-regular fa-copy mr-1"></i>{copiedKey === `${key}-prompt` ? 'COPIED' : 'COPY'}</button>
        </div>
        <p className="font-mono text-xs text-[var(--text-main)] whitespace-pre-wrap leading-relaxed select-all bg-[var(--bg-input)]/40 p-3 rounded">{photo.prompt}</p>
      </div>}
      <div className="bg-[var(--bg-input)]/60 border border-[var(--border-subtle)] rounded-lg p-3.5">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="text-[0.68rem] font-bold font-mono uppercase text-[var(--text-main)]"><i className="fa-solid fa-tags text-[var(--accent-amber)] mr-1.5"></i>Relevant tags ({tags.length})</span>
          {tags.length > 0 && <button onClick={() => copy(tags.join(', '), 'tags')} className="text-[0.65rem] font-mono text-[var(--text-muted)]"><i className="fa-regular fa-copy mr-1"></i>{copiedKey === `${key}-tags` ? 'COPIED' : 'COPY TAGS'}</button>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag, i) => <span key={`${tag}-${i}`} className={`inline-flex items-center gap-1 py-0.5 px-2 rounded text-[0.68rem] font-mono ${i < 10 ? 'bg-amber-500/10 border border-amber-500/30 text-[var(--accent-amber)]' : 'bg-[var(--bg-panel)] border border-[var(--border-color)] text-[var(--text-muted)]'}`}><span className="text-[0.55rem] opacity-60">#{i+1}</span>{tag}</span>)}
        </div>
        <div className="text-[0.60rem] text-[var(--text-dim)] mt-2">First 10 tags are ranked as the strongest search terms.</div>
      </div>
      <div className="mt-3.5 border-t border-[var(--border-subtle)] pt-3 space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[0.68rem]">
          {photo.buyer_use_case && <div><span className="text-[var(--text-dim)]">BUYER USE: </span><span className="text-[var(--text-main)]">{photo.buyer_use_case}</span></div>}
          {photo.commercial_use && <div><span className="text-[var(--text-dim)]">COMMERCIAL USE: </span><span className="text-[var(--text-main)]">{photo.commercial_use}</span></div>}
        </div>
        <details>
          <summary className="cursor-pointer text-[0.68rem] font-mono text-[var(--text-muted)] hover:text-[var(--text-main)]">RESEARCH REASONING & SCORE BREAKDOWN</summary>
          <div className="mt-3 p-3 rounded bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3">
            {photo.why_selected && <p className="text-xs text-[var(--text-main)]">{photo.why_selected}</p>}
            {photo.visual_angle && <p className="text-[0.68rem]"><b className="text-[var(--text-dim)]">Visual gap: </b><span className="text-[var(--text-main)]">{photo.visual_angle}</span></p>}
            {photo.supply_gap && <p className="text-[0.68rem]"><b className="text-[var(--text-dim)]">Supply: </b><span className="text-[var(--text-main)]">{photo.supply_gap}</span></p>}
            {photo.longevity && <p className="text-[0.68rem]"><b className="text-[var(--text-dim)]">Longevity: </b><span className="text-[var(--text-main)]">{photo.longevity}</span></p>}
            {photo.risk_notes && <p className="text-[0.68rem]"><b className="text-[var(--text-dim)]">Risk notes: </b><span className="text-[var(--text-main)]">{photo.risk_notes}</span></p>}
            <ScoreDetails score={photo.score} />
          </div>
        </details>
        {photo.evidence && <details>
          <summary className="cursor-pointer text-[0.68rem] font-mono text-[var(--text-muted)] hover:text-[var(--text-main)]">SOURCE EVIDENCE</summary>
          <div className="mt-2 p-3 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded text-xs space-y-2">
            {Array.isArray(photo.evidence.observed_facts) && photo.evidence.observed_facts.map((fact: string, i: number) => <p key={i} className="text-[var(--text-main)]"><b className="text-[var(--text-dim)]">Observed: </b>{fact}</p>)}
            {Array.isArray(photo.evidence.inferences) && photo.evidence.inferences.map((fact: string, i: number) => <p key={i} className="text-[var(--text-muted)]"><b>Inference: </b>{fact}</p>)}
            {Array.isArray(photo.evidence.source_refs) && photo.evidence.source_refs.map((source: any) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="block text-[var(--accent-amber)] hover:underline break-all">[{source.id}] {source.title || source.url}</a>)}
          </div>
        </details>}
      </div>
    </article>
  );
}
