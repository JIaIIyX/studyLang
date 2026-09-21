import { useId } from 'react'

export function Mark({ className = 'h-10 w-10' }: { className?: string }) {
  const raw = useId().replace(/:/g, '')
  const a = `${raw}-a`
  const b = `${raw}-b`

  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={a} x1="8" y1="6" x2="40" y2="42">
          <stop stopColor="#1F6F5B" />
          <stop offset="1" stopColor="#3D6B8A" />
        </linearGradient>
        <linearGradient id={b} x1="18" y1="10" x2="36" y2="36">
          <stop stopColor="#C45C26" />
          <stop offset="1" stopColor="#C9A227" />
        </linearGradient>
      </defs>
      <rect x="7" y="8" width="26" height="32" rx="4" fill={`url(#${a})`} />
      <path d="M20 8h16a5 5 0 0 1 5 5v23a4 4 0 0 1-4 4H20V8Z" fill={`url(#${b})`} />
      <path d="M28 8v14l4.2-2.6L36.4 22V8H28Z" fill="#FFF8EE" />
    </svg>
  )
}
