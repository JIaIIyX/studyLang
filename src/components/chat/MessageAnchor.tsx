export function MessageAnchor({
  n,
  attached,
  dark,
  onAttach,
}: {
  n: number
  attached?: boolean
  dark?: boolean
  onAttach: () => void
}) {
  return (
    <button
      type="button"
      onClick={onAttach}
      title="Прикрепить к следующему сообщению"
      className={
        dark
          ? `rounded-md px-1.5 py-0.5 font-mono text-[11px] ${
              attached ? 'bg-terracotta text-white' : 'text-white/45 hover:bg-white/10 hover:text-white'
            }`
          : `rounded-md px-1.5 py-0.5 font-mono text-[11px] ${
              attached ? 'bg-terracotta text-white' : 'text-muted hover:bg-hover hover:text-ink'
            }`
      }
    >
      #{n}
    </button>
  )
}
