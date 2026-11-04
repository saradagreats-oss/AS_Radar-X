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

function VideoScore({ score }: { score: VideoOpportunity['score'] }) {
  if (!score) return <span className="text-[0.68rem] text-[var(--text-dim)]">No evidence score available.</span>;
  const labels: Record<string, string> = { recurring_demand: 'Demand', commercial_use: 'Commercial use', marketplace_evidence: 'Marketplace evidence', supply_gap: 'Supply gap', longevity: 'Longevity', production_feasibility: 'Production feasibility' };
  return <div className="space-y-2">
    <div className="flex justify-between items-center"><b className="text-sm text-[var(--text-main)]">Evidence priority</b><b className="text-xl text-[var(--accent-cyan)]">{score.score}/100</b></div>
    <div className="text-[0.63rem] text-[var(--text-dim)]">{score.confidence} confidence · Not a sales forecast</div>
    {Object.entries(score.breakdown).map(([key, part]) => <div key={key} className="grid grid-cols-[minmax(100px,1fr)_40px] gap-2">
      <div><div className="text-[0.68rem] text-[var(--text-main)]">{labels[key] || key}</div><div className="h-1 bg-[var(--bg-input)] rounded-full overflow-hidden mt-1"><div className="h-full bg-[var(--accent-cyan)]" style={{width:`${part.score}%`}} /></div><div className="text-[0.62rem] text-[var(--text-dim)] mt-1">{part.reason}</div>{part.evidence_ids?.length>0 && <div className="text-[0.60rem] text-[var(--accent-cyan)]">Sources: {part.evidence_ids.join(', ')}</div>}</div>
      <b className="text-right text-xs text-[var(--text-main)]">{part.score}</b>
    </div>)}
    <div className="text-[0.62rem] text-[var(--text-dim)] border-t border-[var(--border-subtle)] pt-2">{score.formula}</div>
  </div>;
}

export function VideoCard({ video, index, isOpen, onToggleEvidence, copiedKey, onCopy }: VideoCardProps) {
  const tags = Array.isArray(video.tags) ? video.tags : [];
  const key = `v-${index}`;
  const copy = (value: string, suffix: string) => onCopy(value, `${key}-${suffix}`);
  return <article className="relative bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 pl-6 shadow-md overflow-hidden before:content-[''] before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-[var(--accent-cyan)]">
    <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-3">
      <div className="flex-1 min-w-0"><div className="flex flex-wrap items-center gap-2 mb-1.5"><span className="px-2 py-0.5 rounded bg-[var(--accent-cyan-soft)] text-[var(--accent-cyan)] text-[0.68rem] font-bold font-mono">#{index} VIDEO</span>{video.score && <span className="px-2 py-0.5 rounded bg-[var(--bg-input)] text-[var(--text-muted)] text-[0.62rem] font-mono">{video.score.score}/100 · {video.score.confidence}</span>}</div><h3 className="text-base font-bold text-[var(--text-main)] leading-relaxed">{video.title || 'Untitled Stock Video Opportunity'}</h3></div>
      <button onClick={() => copy(video.title || '', 'title')} className="py-1.5 px-3 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-md text-[0.68rem] font-mono text-[var(--text-muted)] shrink-0"><i className={`fa-regular ${copiedKey === `${key}-title` ? 'fa-check' : 'fa-copy'} mr-1`}></i>{copiedKey === `${key}-title` ? 'COPIED' : 'COPY TITLE'}</button>
    </div>
    {video.prompt && <div className="p-4 bg-[var(--code-bg)] border border-[var(--border-color)] rounded-lg mb-4"><div className="flex items-center justify-between gap-2 mb-2"><span className="text-[0.68rem] font-bold font-mono uppercase text-[var(--accent-cyan)]"><i className="fa-solid fa-clapperboard mr-1.5"></i>Production prompt</span><button onClick={() => copy(video.prompt, 'prompt')} className="text-[0.65rem] font-mono text-[var(--text-muted)]"><i className="fa-regular fa-copy mr-1"></i>{copiedKey === `${key}-prompt` ? 'COPIED' : 'COPY'}</button></div><p className="font-mono text-xs text-[var(--text-main)] whitespace-pre-wrap leading-relaxed select-all bg-[var(--bg-input)]/40 p-3 rounded">{video.prompt}</p></div>}
    <div className="bg-[var(--bg-input)]/60 border border-[var(--border-subtle)] rounded-lg p-3.5"><div className="flex justify-between items-center gap-2 mb-2.5"><span className="text-[0.68rem] font-bold font-mono uppercase text-[var(--text-main)]"><i className="fa-solid fa-tags text-[var(--accent-cyan)] mr-1.5"></i>Relevant tags ({tags.length})</span>{tags.length>0 && <button onClick={() => copy(tags.join(', '), 'tags')} className="text-[0.65rem] font-mono text-[var(--text-muted)]"><i className="fa-regular fa-copy mr-1"></i>{copiedKey === `${key}-tags` ? 'COPIED' : 'COPY TAGS'}</button>}</div><div className="flex flex-wrap gap-1.5">{tags.map((tag,i)=><span key={`${tag}-${i}`} className={`inline-flex items-center gap-1 py-0.5 px-2 rounded text-[0.68rem] font-mono ${i<10?'bg-cyan-500/10 border border-cyan-500/30 text-[var(--accent-cyan)]':'bg-[var(--bg-panel)] border border-[var(--border-color)] text-[var(--text-muted)]'}`}><span className="text-[0.55rem] opacity-60">#{i+1}</span>{tag}</span>)}</div><div className="text-[0.60rem] text-[var(--text-dim)] mt-2">First 10 tags are ranked as the strongest search terms.</div></div>
    <div className="mt-3.5 border-t border-[var(--border-subtle)] pt-3 space-y-2"><div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[0.68rem]">{video.buyer_use_case && <div><span className="text-[var(--text-dim)]">BUYER USE: </span><span className="text-[var(--text-main)]">{video.buyer_use_case}</span></div>}{video.commercial_use && <div><span className="text-[var(--text-dim)]">COMMERCIAL USE: </span><span className="text-[var(--text-main)]">{video.commercial_use}</span></div>}{video.motion_value && <div><span className="text-[var(--text-dim)]">WHY MOTION: </span><span className="text-[var(--text-main)]">{video.motion_value}</span></div>}{video.loop_potential && <div><span className="text-[var(--text-dim)]">LOOP POTENTIAL: </span><span className="text-[var(--text-main)]">{video.loop_potential}</span></div>}</div>
      <details><summary className="cursor-pointer text-[0.68rem] font-mono text-[var(--text-muted)] hover:text-[var(--text-main)]">RESEARCH REASONING & SCORE BREAKDOWN</summary><div className="mt-3 p-3 rounded bg-[var(--bg-panel)] border border-[var(--border-subtle)] space-y-3">{video.why_selected && <p className="text-xs text-[var(--text-main)]">{video.why_selected}</p>}{video.supply_gap && <p className="text-[0.68rem]"><b className="text-[var(--text-dim)]">Supply gap: </b><span className="text-[var(--text-main)]">{video.supply_gap}</span></p>}{video.longevity && <p className="text-[0.68rem]"><b className="text-[var(--text-dim)]">Longevity: </b><span className="text-[var(--text-main)]">{video.longevity}</span></p>}{video.risk_notes && <p className="text-[0.68rem]"><b className="text-[var(--text-dim)]">Risk notes: </b><span className="text-[var(--text-main)]">{video.risk_notes}</span></p>}<VideoScore score={video.score}/></div></details>
      {video.evidence && <details><summary className="cursor-pointer text-[0.68rem] font-mono text-[var(--text-muted)] hover:text-[var(--text-main)]">SOURCE EVIDENCE</summary><div className="mt-2 p-3 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded text-xs space-y-2">{Array.isArray(video.evidence.observed_facts)&&video.evidence.observed_facts.map((fact:string,i:number)=><p key={i} className="text-[var(--text-main)]"><b className="text-[var(--text-dim)]">Observed: </b>{fact}</p>)}{Array.isArray(video.evidence.inferences)&&video.evidence.inferences.map((fact:string,i:number)=><p key={i} className="text-[var(--text-muted)]"><b>Inference: </b>{fact}</p>)}{Array.isArray(video.evidence.source_refs)&&video.evidence.source_refs.map((source:any)=><a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="block text-[var(--accent-cyan)] hover:underline break-all">[{source.id}] {source.title||source.url}</a>)}</div></details>}</div>
  </article>;
}
