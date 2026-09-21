import type { DragEvent } from 'react'

let active: { kind: string; id: string } | null = null

export function beginDrag(event: DragEvent, kind: string, id: string) {
  active = { kind, id }
  event.dataTransfer.setData('text/plain', `${kind}:${id}`)
  event.dataTransfer.effectAllowed = 'move'
}

export function peekDrag(kind: string) {
  return active?.kind === kind ? active.id : null
}

export function takeDrag(event: DragEvent, kind: string) {
  event.preventDefault()
  const fromMemory = peekDrag(kind)
  const raw = event.dataTransfer.getData('text/plain')
  const fromData = raw.startsWith(`${kind}:`) ? raw.slice(kind.length + 1) : ''
  active = null
  return fromMemory || fromData || null
}

export function endDrag() {
  active = null
}

export function allowDrop(event: DragEvent) {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
}
