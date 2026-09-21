import { Check, Copy, Download, FolderOpen, LoaderCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'

type InstallResult = {
  ok: boolean
  path?: string
  version?: string
  name?: string
  error?: string
}

type Props = {
  compact?: boolean
  className?: string
}

async function downloadZip() {
  const response = await fetch('/api/extension.zip')
  if (!response.ok) throw new Error('zip')
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'studylang-clipper.zip'
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function installLocally() {
  const response = await fetch('/api/extension/install', { method: 'POST' })
  const data = (await response.json().catch(() => ({}))) as InstallResult
  if (!response.ok) throw new Error(data.error || 'install')
  return data
}

export function ExtensionInstallButton({ compact, className = '' }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          (compact
            ? 'flex h-10 items-center gap-2 rounded-xl px-2.5 text-sm font-medium hover:bg-hover'
            : 'flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-walnut text-sm font-medium text-cream hover:bg-ink')
        }
        aria-label="Скачать расширение"
      >
        <Download className="h-4 w-4 shrink-0" />
        {compact ? (
          <span className="hidden sm:inline">Скачать расширение</span>
        ) : (
          'Скачать и установить в Chrome'
        )}
      </button>
      {open ? <ExtensionInstallDialog onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function ExtensionInstallDialog({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(true)
  const [downloaded, setDownloaded] = useState(false)
  const [result, setResult] = useState<InstallResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setBusy(true)
      setError('')
      const jobs = await Promise.allSettled([downloadZip(), installLocally()])
      if (cancelled) return
      if (jobs[0].status === 'fulfilled') setDownloaded(true)
      if (jobs[1].status === 'fulfilled') setResult(jobs[1].value)
      if (jobs[0].status === 'rejected' && jobs[1].status === 'rejected') {
        setError('Не удалось скачать расширение. Проверьте, что запущен npm run dev.')
      } else if (jobs[1].status === 'rejected') {
        setError('Архив скачан. Откройте chrome://extensions и загрузите распакованную папку.')
      }
      setBusy(false)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const copyPath = async () => {
    if (!result?.path) return
    await navigator.clipboard.writeText(result.path)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-walnut/40" aria-label="Закрыть" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-terracotta">clipper</p>
            <h2 className="font-display text-3xl italic">Расширение Chrome</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-hover"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {busy ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Скачиваем архив…
          </p>
        ) : (
          <div className="space-y-3 text-sm leading-6">
            <p className={downloaded ? 'flex items-center gap-2 text-accent' : 'text-muted'}>
              <Check className="h-4 w-4 shrink-0" />
              {downloaded ? 'Архив studylang-clipper.zip скачан' : 'Архив не скачался — нажмите ещё раз'}
            </p>
            {error ? <p className="rounded-2xl bg-canvas px-4 py-3 text-muted">{error}</p> : null}
            <ol className="list-decimal space-y-1 pl-5 text-ink">
              <li>Включите «Режим разработчика» справа вверху</li>
              <li>Нажмите «Загрузить распакованное расширение»</li>
              <li>Выберите папку с файлом manifest.json</li>
            </ol>
            {result?.path ? (
              <div className="rounded-2xl bg-canvas px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-terracotta">Папка</p>
                <p className="mt-1 break-all font-print text-[12px]">{result.path}</p>
                <button
                  type="button"
                  onClick={() => void copyPath()}
                  className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-terracotta hover:underline"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Скопировано' : 'Скопировать путь'}
                </button>
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setBusy(true)
              void Promise.allSettled([downloadZip(), installLocally()]).then((jobs) => {
                if (jobs[0].status === 'fulfilled') setDownloaded(true)
                if (jobs[1].status === 'fulfilled') setResult(jobs[1].value)
                setBusy(false)
              })
            }}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-walnut text-sm font-medium text-cream hover:bg-ink"
          >
            <FolderOpen className="h-4 w-4" />
            Повторить установку
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl border border-line px-4 text-sm font-medium hover:bg-hover"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  )
}
