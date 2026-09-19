import { useMemo, useState } from 'react'
import { Loader2, Users, X } from 'lucide-react'
import CatalogoSelect from './CatalogoSelect'
import { CategoriaSelect, PelajeSelect, SexoDeCategoria } from './AnimalCatalogos'
import type { PartidaDto } from '../lib/pesos'

const inputCls =
  'px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

interface PreviewRow {
  nAnimal: number
  caravana: string
}

export interface CargaMasivaValues {
  idRaza?: number
  idPelaje?: number
  idCategoria?: number
  cantidad: number
  nuevaPartida?: boolean
  idPartida?: number
  observaciones?: string
  animales: PreviewRow[]
}

/**
 * Carga masiva de animales (una tanda). La partida se decide automáticamente:
 *  - si hay una partida ABIERTA (sin pesaje inicial) → se suman a ella;
 *  - si todas las partidas ya tienen peso inicial (o no hay partidas) → se crea
 *    una NUEVA partida.
 * El peso inicial se carga aparte, en la sección de pesajes.
 */
export function CargaMasivaModal({
  loteNombre,
  siguienteN,
  partidas,
  onClose,
  onOk,
}: {
  /** Nombre de lote: se usa para precargar las caravanas `{lote}-{i}`. */
  loteNombre: string
  siguienteN: number
  /** Partidas existentes del lote (para decidir unirse a la abierta o crear nueva). */
  partidas: PartidaDto[]
  onClose: () => void
  onOk: (vals: CargaMasivaValues) => Promise<void>
}) {
  const [idRaza, setIdRaza] = useState<string | number>('')
  const [idPelaje, setIdPelaje] = useState<string | number>('')
  const [idCategoria, setIdCategoria] = useState<string | number>('')
  const [cantidad, setCantidad] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [caravanas, setCaravanas] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Partida abierta = la más reciente sin pesaje inicial (a ella se suman).
  const partidaAbierta = [...partidas].reverse().find((p) => !p.tieneInicial) ?? null
  const nuevaPartida = !partidaAbierta

  const n = parseInt(cantidad, 10)
  const cantidadOk = !isNaN(n) && n > 0 && n <= 500
  // Sólo la cantidad es requerida; raza/categoría/pelaje son opcionales y se
  // pueden completar/editar después (por animal o en masa por partida/lote).
  const requeridosOk = cantidadOk

  const preview = useMemo<{ nAnimal: number }[]>(() => {
    if (!cantidadOk) return []
    return Array.from({ length: n }, (_, i) => ({ nAnimal: siguienteN + i }))
  }, [cantidadOk, n, siguienteN])

  // Caravana precargada `{loteNombre}-{i}` (1,2,3… n). El estado sólo guarda las
  // que el usuario modifica; si no hay override se usa el default derivado.
  const defaultCaravana = (i: number) => `${loteNombre}-${i + 1}`

  const rows = preview.map((p, i) => ({
    nAnimal: p.nAnimal,
    caravana: (caravanas[p.nAnimal] ?? defaultCaravana(i)).trim(),
  }))

  const submit = async () => {
    setError('')
    if (!cantidadOk) return setError('Ingresá una cantidad válida (1 a 500).')
    if (rows.length === 0) return
    if (rows.some((r) => !r.caravana)) {
      return setError('Completá la caravana de todos los animales del preview.')
    }
    const seen = new Set<string>()
    for (const r of rows) {
      const k = r.caravana.toLowerCase()
      if (seen.has(k)) return setError(`Caravana duplicada: "${r.caravana}".`)
      seen.add(k)
    }
    setBusy(true)
    try {
      await onOk({
        ...(idRaza ? { idRaza: Number(idRaza) } : {}),
        ...(idPelaje ? { idPelaje: Number(idPelaje) } : {}),
        ...(idCategoria ? { idCategoria: Number(idCategoria) } : {}),
        cantidad: n,
        // La partida la decide el server (partida abierta → unirse; si no → nueva).
        observaciones: observaciones.trim() || undefined,
        animales: rows.map((r) => ({ nAnimal: r.nAnimal, caravana: r.caravana })),
      })
    } catch (err) {
      console.error(err)
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'No se pudo crear la carga masiva.',
      )
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-2xl bg-card border border-border rounded-lg shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Cargar animales</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Crea una tanda de animales con estos datos compartidos. Raza, categoría y
          pelaje son <strong>opcionales</strong> (se pueden cargar o editar después,
          por animal o en masa por partida/lote). El peso inicial se carga aparte, en
          la sección de pesajes.
        </p>

        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          <CatalogoSelect
            tipo="raza"
            label="Raza (opcional)"
            placeholder="Buscar o agregar raza..."
            value={idRaza}
            onChange={setIdRaza}
          />
          <div className="flex items-end gap-2">
            <CategoriaSelect value={idCategoria} onChange={setIdCategoria} className="flex-1" />
            <SexoDeCategoria idCategoria={idCategoria} />
          </div>
          <PelajeSelect value={idPelaje} onChange={setIdPelaje} idRaza={idRaza} />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Cantidad *</label>
            <input
              type="number"
              min={1}
              max={500}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className={`${inputCls} w-full`}
              placeholder="Ej: 10"
            />
          </div>
        </div>

        {/* Partida: decisión automática, sólo informativa */}
        {partidas.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Se creará la <strong>primera partida</strong> del lote.
          </p>
        ) : partidaAbierta ? (
          <p className="text-xs text-muted-foreground">
            Se agregarán a la <strong>partida abierta</strong> ({partidaAbierta.nombre}), que aún
            no tiene pesaje inicial.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Todas las partidas ya tienen peso inicial: se creará una <strong>nueva
            partida</strong>.
          </p>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Observaciones (para todos)</label>
          <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} className={`${inputCls} w-full resize-y`} />
        </div>

        {requeridosOk && (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Users className="size-3.5" strokeWidth={2} /> Preview · {n} animales
              {nuevaPartida && partidas.length > 0 && ' · nueva partida'}
            </div>
            <div className="divide-y divide-border max-h-64 overflow-y-auto">
              {preview.map((p, i) => (
                <div key={p.nAnimal} className="flex items-center gap-2 px-3 py-2">
                  <span className="w-10 shrink-0 text-sm font-medium text-foreground">#{p.nAnimal}</span>
                  <input
                    type="text"
                    value={caravanas[p.nAnimal] ?? defaultCaravana(i)}
                    onChange={(e) => setCaravanas((s) => ({ ...s, [p.nAnimal]: e.target.value }))}
                    placeholder="Caravana *"
                    className={`${inputCls} flex-1 min-w-0`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {!requeridosOk && (
          <p className="text-xs text-muted-foreground">Ingresá la cantidad para ver el preview.</p>
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
            disabled={busy || !requeridosOk}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" strokeWidth={2} />}
            Agregar {cantidadOk ? n : ''} animales
          </button>
        </div>
      </div>
    </div>
  )
}