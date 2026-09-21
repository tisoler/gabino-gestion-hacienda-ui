import { useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import api from '../lib/api'
import SelectAutocomplete from './SelectAutocomplete'
import {
  SeleccionAnimalesPesos,
  type DatosSeleccionPesos,
  type FilaSeleccionPesos,
} from './SeleccionAnimalesPesos'
import type { LoteDetalle, Animal } from '../pages/LoteDetalle'
import type { PesajeDto } from '../lib/pesos'

const inputCls =
  'px-2.5 py-1.5 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors w-full'

const hoyIso = (): string => {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const inicialDatos = (): DatosSeleccionPesos => ({
  seleccion: [],
  pesos: {},
  desbastes: {},
})

/**
 * Dar salida a animales NO muertos del lote. Alcances: Lote / Partida /
 * Animales, con la misma entrada de pesos unificada (totales + tabla). El
 * grupo que sale debe tener peso final: si no lo tiene, se pide ingresarlo.
 */
export function SalidaModal({
  lote,
  onClose,
  onSaved,
}: {
  lote: LoteDetalle
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const partidas = lote.partidas ?? []
  const esMulti = partidas.length > 1
  const pesajeFinalPorAnimal = useMemo(() => {
    const m = new Map<number, PesajeDto>()
    for (const p of lote.pesajes ?? []) if (p.tipo === 'final') m.set(p.animalId, p)
    return m
  }, [lote])

  // Animales vivos (sano/enfermo): los que pueden salir.
  const vivos = useMemo(
    () => (lote.animales ?? []).filter((a) => a.estado === 'sano' || a.estado === 'enfermo'),
    [lote],
  )

  const [tipo, setTipo] = useState<'lote' | 'partida' | 'animales'>('lote')
  const [idPartida, setIdPartida] = useState<string | number>('')
  const [fecha, setFecha] = useState(hoyIso())
  const [hora, setHora] = useState('12:00')
  const [datos, setDatos] = useState<DatosSeleccionPesos>(inicialDatos)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Candidatos por alcance (para Lote/Partida entran todos; Animales elige).
  const candidatos = useMemo(() => {
    const aFila = (a: Animal): FilaSeleccionPesos => {
      const fin = pesajeFinalPorAnimal.get(a.id)
      return {
        id: a.id,
        nAnimal: a.nAnimal,
        caravana: a.caravana,
        tieneFinal: !!fin,
        pesoFinal: fin?.peso ?? null,
      }
    }
    if (tipo === 'lote') return vivos.map(aFila)
    if (tipo === 'partida') {
      const id = Number(idPartida)
      return id ? vivos.filter((a) => a.idPartida === id).map(aFila) : []
    }
    return vivos.map(aFila)
  }, [tipo, idPartida, vivos, pesajeFinalPorAnimal])

  // Grupo que sale: para Animales = los seleccionados.
  const grupo: Animal[] = useMemo(() => {
    if (tipo === 'lote') return vivos
    if (tipo === 'partida') {
      const id = Number(idPartida)
      return id ? vivos.filter((a) => a.idPartida === id) : []
    }
    return vivos.filter((a) => datos.seleccion.includes(a.id))
  }, [tipo, idPartida, datos.seleccion, vivos])

  const sinFinal = useMemo(
    () => grupo.filter((a) => !pesajeFinalPorAnimal.has(a.id)),
    [grupo, pesajeFinalPorAnimal],
  )

  const faltanPesos = sinFinal.some((a) => !(datos.pesos[a.id] > 0))
  const listo =
    grupo.length > 0 && !faltanPesos && (tipo !== 'partida' || idPartida !== '') && !!fecha

  const submit = async () => {
    setError('')
    if (!listo) return
    setBusy(true)
    try {
      const animales = grupo.map((a) => {
        const tieneFinal = pesajeFinalPorAnimal.has(a.id)
        const item: { animalId: number; pesoFinal?: number; desbaste?: number } = { animalId: a.id }
        if (!tieneFinal) {
          if (datos.pesos[a.id] != null) item.pesoFinal = datos.pesos[a.id]
          if (datos.desbastes[a.id] != null) item.desbaste = datos.desbastes[a.id]
        }
        return item
      })
      await api.post(`/lotes/${lote.id}/salidas`, {
        fecha,
        hora,
        tipo,
        ...(tipo === 'partida' ? { idPartida: Number(idPartida) } : {}),
        animales,
      })
      await onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'No se pudo registrar la salida.',
      )
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-2xl bg-card border border-border rounded-lg shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Dar salida</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Salen animales vivos (sano/enfermo). Los que no tienen peso final deben cargarlo aquí;
          se registra el pesaje final y la diferencia de peso del grupo.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Opción *</label>
            <div className="grid grid-cols-3 gap-1 rounded-md bg-muted/40 p-0.5">
              {(
                [
                  { value: 'lote', label: 'Lote' },
                  { value: 'partida', label: 'Partida' },
                  { value: 'animales', label: 'Animales' },
                ] as const
              ).map((op) => (
                <button
                  key={op.value}
                  onClick={() => setTipo(op.value)}
                  disabled={op.value === 'partida' && !esMulti}
                  className={`rounded px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${tipo === op.value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>
          {tipo === 'partida' ? (
            <SelectAutocomplete
              label="Partida *"
              placeholder="Elegir partida..."
              value={idPartida}
              onChange={setIdPartida}
              options={partidas.map((p) => ({ value: p.id, label: `${p.nombre} (${p.nAnimales} animales)` }))}
              clearable={false}
            />
          ) : (
            <div />
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Fecha de la salida *</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Hora *</label>
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* Entrada de pesos unificada (totales + tabla) */}
        <SeleccionAnimalesPesos
          key={`${tipo}-${idPartida}`}
          animales={candidatos}
          seleccionable={tipo === 'animales'}
          titulo={tipo === 'animales' ? 'Seleccioná los animales' : 'Animales que salen'}
          onDatos={setDatos}
        />

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={busy || !listo}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Dar salida ({grupo.length})
          </button>
        </div>
      </div>
    </div>
  )
}