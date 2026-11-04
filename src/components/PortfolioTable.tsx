import React, { useEffect, useState } from 'react';

interface PortfolioTableProps { refreshKey: number; }

export function PortfolioTable({ refreshKey }: PortfolioTableProps) {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<any | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch('/api/portfolio/assets')
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => { if (active) { setAssets(Array.isArray(data.assets) ? data.assets : []); setSnapshot(data.snapshot || null); setError(''); } })
      .catch((err) => { if (active) setError(err.message || 'Unable to load portfolio data.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey]);

  const knownDownloads = assets.filter((asset) => asset.downloads !== null && asset.downloads !== undefined && Number.isFinite(Number(asset.downloads)));
  const counts = {
    accepted: snapshot?.accepted ?? assets.filter((asset) => asset.status === 'ACCEPTED').length,
    rejected: snapshot?.rejected ?? assets.filter((asset) => asset.status === 'REJECTED').length,
    pending: snapshot?.pending ?? assets.filter((asset) => asset.status === 'PENDING').length,
    downloads: snapshot?.totalDownloads ?? (knownDownloads.length ? knownDownloads.reduce((sum, asset) => sum + Number(asset.downloads), 0) : null),
    synced: snapshot?.rowCount ?? assets.length
  };

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Accepted', counts.accepted, 'text-emerald-400'],
          ['Rejected', counts.rejected, 'text-rose-400'],
          ['In Review', counts.pending, 'text-amber-300'],
          ['Recorded Downloads', counts.downloads == null ? '—' : counts.downloads, 'text-[var(--accent-amber)]']
        ].map(([label, value, color]) => (
          <div key={String(label)} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4">
            <div className="text-[0.64rem] font-mono uppercase text-[var(--text-dim)]">{label}</div>
            <div className={`text-xl font-bold mt-1 ${color}`}>{value == null ? '—' : String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</div>
          </div>
        ))}
      </div>
      <div className="text-[0.64rem] text-[var(--text-dim)]">Last portfolio sync: {snapshot?.capturedAt ? new Date(snapshot.capturedAt).toLocaleString() : 'Not yet captured'} · {counts.synced} records visible in last snapshot</div>
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg overflow-hidden">
        <div className="flex justify-between items-center px-4 py-3 border-b border-[var(--border-subtle)]">
          <div>
            <div className="text-sm font-bold text-[var(--text-main)]">Locally Stored Adobe Portfolio Records</div>
            <div className="text-[0.65rem] text-[var(--text-dim)] mt-1">Only details visible during a browser session are stored. Unknown values are not converted to zero.</div>
          </div>
          <span className="text-xs font-mono text-[var(--text-dim)]">{assets.length} records</span>
        </div>
        {loading ? <div className="p-6 text-xs text-[var(--text-dim)]">Loading portfolio records…</div>
        : error ? <div className="p-6 text-xs text-rose-300">{error}</div>
        : assets.length === 0 ? <div className="p-6 text-xs text-[var(--text-dim)]">No portfolio records have been captured yet. Run research with Adobe Contributor signed in in the embedded browser.</div>
        : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-input)] text-[var(--text-dim)]">
                <tr><th className="p-3">Asset</th><th className="p-3">Status</th><th className="p-3">Rejection reason</th><th className="p-3 text-right">Downloads</th><th className="p-3">Last checked</th></tr>
              </thead>
              <tbody>
                {assets.map((asset, index) => (
                  <tr key={asset.assetId || asset.href || asset.title || index} className="border-t border-[var(--border-subtle)] align-top">
                    <td className="p-3 min-w-[220px]">
                      <div className="font-semibold text-[var(--text-main)]">{asset.title || 'Untitled portfolio item'}</div>
                      {asset.assetId && <div className="text-[0.62rem] text-[var(--text-dim)] font-mono mt-1">{asset.assetId}</div>}
                      {asset.href && <a href={asset.href} target="_blank" rel="noreferrer" className="text-[0.62rem] text-[var(--accent-amber)] hover:underline mt-1 inline-block">Open visible asset record</a>}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded text-[0.62rem] font-bold ${asset.status === 'ACCEPTED' ? 'bg-emerald-500/10 text-emerald-400' : asset.status === 'REJECTED' ? 'bg-rose-500/10 text-rose-400' : asset.status === 'PENDING' ? 'bg-amber-500/10 text-amber-300' : 'bg-zinc-500/10 text-[var(--text-dim)]'}`}>{asset.status || 'UNKNOWN'}</span>
                    </td>
                    <td className="p-3 text-[var(--text-muted)] min-w-[180px]">{asset.rejectionReason || '—'}</td>
                    <td className="p-3 text-right tabular-nums text-[var(--text-main)]">{asset.downloads == null ? '—' : Number(asset.downloads).toLocaleString()}</td>
                    <td className="p-3 whitespace-nowrap text-[var(--text-dim)]">{asset.lastSeenAt ? new Date(asset.lastSeenAt).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
