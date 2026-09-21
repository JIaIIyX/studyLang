import { Volume2, VolumeX } from 'lucide-react'
import { clampVoiceVolume } from '../lib/speech'
import { useApp } from '../state/AppProvider'

type Props = {
  compact?: boolean
  dark?: boolean
}

export function VoiceVolumeSlider({ compact, dark }: Props) {
  const { voiceVolume, setVoiceVolume } = useApp()
  const percent = Math.round(clampVoiceVolume(voiceVolume) * 100)

  return (
    <label className={compact ? 'flex min-w-0 items-center gap-2' : 'mb-6 block'}>
      {compact ? (
        percent === 0 ? (
          <VolumeX className="h-4 w-4 shrink-0 opacity-70" />
        ) : (
          <Volume2 className="h-4 w-4 shrink-0 opacity-70" />
        )
      ) : (
        <>
          <span className="mb-2 block text-sm font-medium">Громкость диктора</span>
          <p className="mb-2 text-sm text-muted">Для голоса в диалоге и кнопки «прослушать».</p>
        </>
      )}
      <input
        type="range"
        min={0}
        max={100}
        value={percent}
        aria-label="Громкость диктора"
        onChange={(event) => setVoiceVolume(Number(event.target.value) / 100)}
        className={
          compact
            ? `h-1 w-20 accent-terracotta ${dark ? 'opacity-90' : ''}`
            : 'h-2 w-full accent-terracotta'
        }
      />
      {!compact ? <p className="mt-2 text-sm text-muted">{percent}%</p> : null}
    </label>
  )
}
