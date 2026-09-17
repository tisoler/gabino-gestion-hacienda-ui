import { useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import api from '../lib/api'
import SelectAutocomplete from './SelectAutocomplete'
import type { LoteDetalle, Animal } from '../pages/LoteDetalle'
import type { PesajeDto } from '../lib/pesos'

const inputCls =
  'px-2.5 py-1.5 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors w-full'

const parseNum = (s: string): number | null => {
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? null : n
}

const hoyIso = (): string => {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const labelAnimal = (a: Animal) => (a.caravana ? `Caravana ${a.caravana}` : `Animal ${a.nAnimal ?? a.id}`)

/**
 * Dar salida a animales NO muertos del lote. Opciones: lote completo, partida
 * completa (si tiene partidas) o selección. El grupo que sale debe tener peso
 * final: si no lo tiene, se pide ingresarlo en el modal.
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
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  const [fecha, setFecha] = useState(hoyIso())
  // Peso final por animal (sólo para los que no lo tienen).
  const [pesos, setPesos] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Grupo según la opción elegida.
  const grupo: Animal[] = useMemo(() => {
    if (tipo === 'lote') return vivos
    if (tipo === 'partida') {
      const id = Number(idPartida)
      return id ? vivos.filter((a) => a.idPartida === id) : []
    }
    return vivos.filter((a) => seleccion.has(a.id))
  }, [tipo, idPartida, seleccion, vivos])

  const toggleAnimal = (id: number) => {
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const faltanPesos = grupo.some(
    (a) => !pesajeFinalPorAnimal.has(a.id) && (parseNum(pesos[a.id] ?? '') ?? 0) <= 0,
  )
  const listo =
    grupo.length > 0 && !faltanPesos && (tipo !== 'partida' || idPartida !== '') && !!fecha

  const submit = async () => {
    setError('')
    if (!listo) return
    setBusy(true)
    try {
      const animales = grupo.map((a) => {
        const tieneFinal = pesajeFinalPorAnimal.has(a.id)
        const item: { animalId: number; pesoFinal?: number } = { animalId: a.id }
        if (!tieneFinal) {
          const p = parseNum(pesos[a.id] ?? '')
          if (p != null) item.pesoFinal = p
        }
        return item
      })
      await api.post(`/lotes/${lote.id}/salidas`, {
        fecha,
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

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Fecha de la salida *</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
        </div>

        {/* Lista: para 'animales' se muestran TODOS los vivos (se eligen con checkbox);
        para 'lote'/'partida' el grupo completo. */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            {tipo === 'animales'
              ? `Seleccioná los animales (${seleccion.size} de ${vivos.length})`
              : `Animales que salen (${grupo.length})`}
          </label>
          <div className="border border-border rounded-md divide-y divide-border max-h-60 overflow-y-auto">
            {vivos.length === 0 && (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                No hay animales vivos en el lote para dar salida.
              </p>
            )}
            {(tipo === 'animales' ? vivos : grupo).map((a) => {
              const fin = pesajeFinalPorAnimal.get(a.id)
              const tiene = !!fin
              return (
                <div key={a.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {tipo === 'animales' && (
                      <input
                        type="checkbox"
                        checked={seleccion.has(a.id)}
                        onChange={() => toggleAnimal(a.id)}
                        className="size-4 accent-primary shrink-0 cursor-pointer"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{labelAnimal(a)}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.estado === 'enfermo' ? 'Enfermo · ' : ''}
                        {tiene ? `Peso final registrado: ${fin!.peso} kg` : 'Sin peso final'}
                      </p>
                    </div>
                  </div>
                  {tiene ? (
                    <span className="text-xs text-success shrink-0">Tiene final</span>
                  ) : (
                    <div className="w-80 shrink-0">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={pesos[a.id] ?? ''}
                        onChange={(e) => setPesos((prev) => ({ ...prev, [a.id]: e.target.value }))}
                        className={inputCls}
                        placeholder="Peso final (kg)"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {tipo === 'animales' && (
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setSeleccion(new Set(vivos.map((a) => a.id)))}
              className="text-primary hover:underline cursor-pointer"
            >
              Seleccionar todos
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              onClick={() => setSeleccion(new Set())}
              className="text-primary hover:underline cursor-pointer"
            >
              Limpiar
            </button>
          </div>
        )}

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