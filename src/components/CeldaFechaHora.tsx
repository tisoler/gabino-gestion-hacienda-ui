import { useRef, useState } from 'react'
import { Loader2, Pencil } from 'lucide-react'

const fmtFecha = (f: string): string => {
  if (!f) return '—'
  const d = new Date(f.length === 10 ? f + 'T00:00:00' : f)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR')
}
/** 'HH:MM:SS' → 'HH:MM' para mostrar/editar. */
const hhmm = (h?: string | null): string => (h ? h.slice(0, 5) : '12:00')

/**
 * Celda de fecha + hora editable in situ. Click → inputs de fecha y hora;
 * al elegir una fecha/hora completas guarda (o con blur). Usada en /salidas y
 * /alimentacion.
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
  const guardandoRef = useRef(false)

  if (!puedeEscribir)
    return (
      <span className="text-muted-foreground whitespace-nowrap">
        {fmtFecha(fecha)} · {hhmm(hora)}
      </span>
    )

  const guardar = async () => {
    if (guardandoRef.current) return
    if (!vFecha) return
    const nuevaHora = /^\d{2}:\d{2}$/.test(vHora) ? `${vHora}:00` : '12:00:00'
    if (vFecha === fecha && nuevaHora === (hora ?? '12:00:00')) {
      setEditando(false)
      return
    }
    guardandoRef.current = true
    setBusy(true)
    try {
      await onGuardar(vFecha, nuevaHora)
      setEditando(false)
    } catch {
      /* el padre mostró el error; sigue editando */
    } finally {
      guardandoRef.current = false
      setBusy(false)
    }
  }

  if (editando && !busy) {
    return (
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="date"
          autoFocus
          value={vFecha}
          onChange={(e) => setVFecha(e.target.value)}
          className="px-2 py-1 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="time"
          value={vHora}
          onChange={(e) => {
            setVHora(e.target.value)
            // Con hora elegida, guarda al instante.
            if (/^\d{2}:\d{2}$/.test(e.target.value)) void guardar()
          }}
          className="px-2 py-1 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setVFecha(fecha)
        setVHora(hhmm(hora))
        setEditando(true)
      }}
      title="Editar fecha y hora"
      className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer group disabled:cursor-default whitespace-nowrap"
    >
      {fmtFecha(fecha)} · {hhmm(hora)}
      {busy ? (
        <Loader2 className="size-3.5 animate-spin text-primary" strokeWidth={2} />
      ) : (
        <Pencil className="size-3 opacity-60 group-hover:opacity-100 transition-opacity" strokeWidth={2} />
      )}
    </button>
  )
}