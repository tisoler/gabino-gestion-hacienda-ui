import { useState } from 'react'
import { Check, Loader2, Pencil, X } from 'lucide-react'

const fmtFecha = (f: string): string => {
  if (!f) return '—'
  const d = new Date(f.length === 10 ? f + 'T00:00:00' : f)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR')
}
/** 'HH:MM:SS' → 'HH:MM' para editar. */
const hhmm = (h?: string | null): string => (h ? h.slice(0, 5) : '12:00')

const btnCls =
  'p-1.5 rounded-md border border-border transition-colors cursor-pointer inline-flex items-center justify-center'

/**
 * Celda de fecha + hora editable in situ: al hacer click muestra un picker con
 * ambos valores (fecha y hora) y botones ✓ guardar / ✗ cancelar. Usada en
 * /salidas y /alimentacion.
 */
export function CeldaFechaHora({
  fecha,
  hora,
  puedeEscribir,
  onGuardar,
}: {
  fecha: string
  hora?: string | null
  puedeEscribir: boolean
  onGuardar: (fecha: string, hora: string) => Promise<void>
}) {
  const [editando, setEditando] = useState(false)
  const [vFecha, setVFecha] = useState(fecha)
  const [vHora, setVHora] = useState(hhmm(hora))
  const [busy, setBusy] = useState(false)

  if (!puedeEscribir)
    return (
      <span className="text-muted-foreground whitespace-nowrap">
        {fmtFecha(fecha)} · {hhmm(hora)}
      </span>
    )

  const abrir = () => {
    setVFecha(fecha)
    setVHora(hhmm(hora))
    setEditando(true)
  }
  const cerrar = () => setEditando(false)

  const guardar = async () => {
    if (!vFecha) return
    const nuevaHora = /^\d{2}:\d{2}:\d{2}$/.test(vHora)
      ? vHora
      : /^\d{2}:\d{2}$/.test(vHora)
        ? `${vHora}:00`
        : '12:00:00'
    if (vFecha === fecha && nuevaHora === (hora ?? '12:00:00')) {
      setEditando(false)
      return
    }
    setBusy(true)
    try {
      await onGuardar(vFecha, nuevaHora)
      setEditando(false)
    } catch {
      /* el padre mostró el error; sigue editando */
    } finally {
      setBusy(false)
    }
  }

  if (editando) {
    return (
      <div
        className="flex items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void guardar()
          if (e.key === 'Escape') cerrar()
        }}
      >
        <input
          type="date"
          autoFocus
          value={vFecha}
          disabled={busy}
          onChange={(e) => setVFecha(e.target.value)}
          className="px-2 py-1 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="time"
          value={vHora}
          disabled={busy}
          onChange={(e) => setVHora(e.target.value)}
          className="px-2 py-1 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={busy}
          title="Guardar"
          className={`${btnCls} text-success hover:bg-success-soft disabled:opacity-50`}
        >
          {busy ? <Loader2 className="size-4 animate-spin" strokeWidth={2} /> : <Check className="size-4" strokeWidth={2.5} />}
        </button>
        <button
          type="button"
          onClick={cerrar}
          disabled={busy}
          title="Cancelar"
          className={`${btnCls} text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50`}
        >
          <X className="size-4" strokeWidth={2.5} />
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={abrir}
      title="Editar fecha y hora"
      className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer group disabled:cursor-default whitespace-nowrap"
    >
      {fmtFecha(fecha)} · {hhmm(hora)}
      <Pencil className="size-3 opacity-60 group-hover:opacity-100 transition-opacity" strokeWidth={2} />
    </button>
  )
}