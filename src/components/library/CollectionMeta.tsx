import { sectionMeta } from '../../lib/languages'
import type { CollectionAdvice, CollectionStats } from '../../lib/collectionAdvice'

export function CollectionMeta({ stats, advice }: { stats: CollectionStats; advice?: CollectionAdvice }) {
  const ratio = stats.total > 0 ? Math.min(100, Math.round((stats.known / stats.total) * 100)) : 0

  return (
    <div className="mt-4 space-y-3">
      <div>
        <div className="mb-1 flex justify-between text-[11px] text-muted">
          <span>
            Общее {stats.known} · повторю {stats.review} · из {stats.total}
          </span>
          <span>{ratio}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-canvas">
          <div className="progress-bar h-full" style={{ width: `${ratio}%` }} />
        </div>
        <p className="mt-1 text-[10px] text-muted">Общая оценка — минимум среди игр</p>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {stats.games.map((game) => (
          <div key={game.kind} className="rounded-lg bg-canvas px-2 py-1.5 text-[11px]">
            <p className="text-muted">{sectionMeta(game.kind).label}</p>
            <p className="text-ink">
              {game.known}/{stats.total}
              {game.review ? ` · повт. ${game.review}` : ''}
            </p>
          </div>
        ))}
      </div>
      {advice && (
        <div className="rounded-xl bg-canvas px-3 py-2.5 text-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-terracotta">Аналитика</p>
          <p className="mt-1 text-ink">{advice.insight}</p>
        </div>
      )}
    </div>
  )
}
