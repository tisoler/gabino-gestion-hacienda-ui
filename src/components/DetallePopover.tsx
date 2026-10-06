import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

/**
 * Celda resumida con detalle en popover (portal, fijo) anclado a la celda:
 * muestra la etiqueta como link y, al hacer click, el contenido de detalle.
 * Cierra al click afuera, al scrollear fuera del panel o con resize. El
 * scroll DENTRO del panel no lo cierra.
 */
export function DetallePopover({
  etiqueta,
  titulo,
  ancho = 320,
  classNameBoton,
  children,
}: {
  etiqueta: ReactNode
  titulo?: string
  ancho?: number
  /** Clases del botón disparador (default: link). */
  classNameBoton?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // Timestamp de la última rueda/touch SOBRE el panel: si el scroll viene de
  // ahí (el panel no tiene barra propia y scrollea la página), no se cierra.
  const ultimaRuedaRef = useRef(0)

  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect()
      const left = Math.max(12, Math.min(r.left, window.innerWidth - ancho - 12))
      setPos({ top: r.bottom + 4, left })
    }
    setOpen((v) => !v)
  }

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      if (panelRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return
      if (Date.now() - ultimaRuedaRef.current < 200) return
      setOpen(false)
    }
    const marcar = () => {
      ultimaRuedaRef.current = Date.now()
    }
    const panel = panelRef.current
    panel?.addEventListener('wheel', marcar, { passive: true })
    panel?.addEventListener('touchstart', marcar, { passive: true })
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      panel?.removeEventListener('wheel', marcar)
      panel?.removeEventListener('touchstart', marcar)
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={toggle}
        className={classNameBoton ?? 'inline-flex items-center gap-1.5 text-sm text-primary hover:underline cursor-pointer'}
      >
        {etiqueta}
        <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: ancho, zIndex: 9999 }}
            className="bg-card border border-border rounded-md shadow-lg max-h-72 overflow-y-auto overscroll-contain p-3 space-y-1.5"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {titulo && (
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {titulo}
              </p>
            )}
            {children}
          </div>,
          document.body,
        )}
    </>
  )
}
