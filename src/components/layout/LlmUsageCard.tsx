import { useEffect, useState } from 'react'
import {
  estimateUsd,
  formatTokens,
  getLastLlmUsage,
  getLlmUsageDay,
  subscribeLlmUsage,
  type LlmUsage,
  type LlmUsageDay,
} from '../../lib/llmUsage'

export function LlmUsageCard() {
  const [day, setDay] = useState<LlmUsageDay>(() => getLlmUsageDay())
  const [last, setLast] = useState<LlmUsage | null>(() => getLastLlmUsage())

  useEffect(() => {
    const sync = () => {
      setDay(getLlmUsageDay())
      setLast(getLastLlmUsage())
    }
    sync()
    return subscribeLlmUsage(sync)
  }, [])

  const usd = estimateUsd(day.promptTokens, day.completionTokens)

  return (
    <div className="mb-6 rounded-2xl border border-line bg-canvas p-4">
      <p className="mb-1 text-sm font-medium">Расход модели сегодня</p>
      <p className="mb-3 text-sm text-muted">
        Считает токены с каждого ответа API. На Free это $0; оценка ниже — «как на платном тарифе».
      </p>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-surface px-3 py-2">
          <p className="text-muted">Запросы</p>
          <p className="font-medium">{day.requests}</p>
        </div>
        <div className="rounded-xl bg-surface px-3 py-2">
          <p className="text-muted">Всего токенов</p>
          <p className="font-medium">{formatTokens(day.totalTokens)}</p>
        </div>
        <div className="rounded-xl bg-surface px-3 py-2">
          <p className="text-muted">Вход</p>
          <p className="font-medium">{formatTokens(day.promptTokens)}</p>
        </div>
        <div className="rounded-xl bg-surface px-3 py-2">
          <p className="text-muted">Ответ</p>
          <p className="font-medium">{formatTokens(day.completionTokens)}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">
        Оценка gpt-oss-20b: ~${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(3)}
      </p>
      {last ? (
        <p className="mt-2 text-xs text-muted">
          Последний ответ: {formatTokens(last.totalTokens)} ток.
          {last.model ? ` · ${last.model}` : ''}
          {last.provider ? ` · ${last.provider}` : ''}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">Пока не было запросов в этом браузере сегодня.</p>
      )}
    </div>
  )
}