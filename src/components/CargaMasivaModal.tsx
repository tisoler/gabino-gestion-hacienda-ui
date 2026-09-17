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
  peso?: number
  desbaste?: number
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

const parseNum = (s: string): number | undefined => {
  const v = parseFloat(s.replace(',', '.'))
  return isNaN(v) ? undefined : v
}

/**
 * Carga masiva de animales (una tanda = una partida). Los pesajes se cargan
 * aparte; sólo se piden pesos aquí si se une la tanda a una partida que ya
 * tiene pesaje inicial (para no distorsionar la gráfica).
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
  /** Partidas existentes del lote (para decidir nueva vs unir). */
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
  const [pesos, setPesos] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // ¿El lote ya tiene animales con pesaje inicial? → hay que decidir partida.
  const hayPesadas = partidas.some((p) => p.tieneInicial)
  const [destino, setDestino] = useState<'nueva' | 'existente'>('nueva')
  const [idPartida, setIdPartida] = useState<string | number>('')
  const partidaElegida = partidas.find((p) => p.id === Number(idPartida))
  // Al unir a una partida ya pesada, hay que dar el peso de cada animal nuevo.
  const requierePesos = hayPesadas && destino === 'existente' && !!partidaElegida?.tieneInicial

  const n = parseInt(cantidad, 10)
  const cantidadOk = !isNaN(n) && n > 0 && n <= 500
  // Sólo la cantidad es requerida; raza/categoría/pelaje son opcionales y se
  // pueden completar/editar después (por animal o en masa por partida/lote).
  const requeridosOk = cantidadOk && (!hayPesadas || (destino === 'nueva' || !!idPartida))

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
    if (requierePesos && rows.some((r) => parseNum(pesos[r.nAnimal] ?? '') == null)) {
      return setError('La partida elegida ya está pesada: ingresá el peso de cada animal nuevo.')
    }
    setBusy(true)
    try {
      await onOk({
        ...(idRaza ? { idRaza: Number(idRaza) } : {}),
        ...(idPelaje ? { idPelaje: Number(idPelaje) } : {}),
        ...(idCategoria ? { idCategoria: Number(idCategoria) } : {}),
        cantidad: n,
        ...(hayPesadas && destino === 'nueva' ? { nuevaPartida: true } : {}),
        ...(destino === 'existente' && idPartida ? { idPartida: Number(idPartida) } : {}),
        observaciones: observaciones.trim() || undefined,
        animales: rows.map((r) => ({
          nAnimal: r.nAnimal,
          caravana: r.caravana,
          ...(requierePesos
            ? { peso: parseNum(pesos[r.nAnimal] ?? '') }
            : {}),
        })),
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

        {/* Partida: sólo si el lote ya tiene animales con pesaje inicial */}
        {hayPesadas && (
          <div className="space-y-3 border border-border rounded-md p-4">
            <div className="text-sm font-medium text-foreground">Partida</div>
            <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
              {(['nueva', 'existente'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDestino(d)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${destino === d
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  {d === 'nueva' ? 'Nueva partida' : 'Partida existente'}
                </button>
              ))}
            </div>
            {destino === 'existente' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Partida *</label>
                <select
                  value={idPartida}
                  onChange={(e) => setIdPartida(e.target.value ? Number(e.target.value) : '')}
                  className={`${inputCls} w-full cursor-pointer`}
                >
                  <option value="">Elegir partida...</option>
                  {partidas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} · {p.fecha} · {p.nAnimales} animales{p.tieneInicial ? ' · pesada' : ''}
                    </option>
                  ))}
                </select>
                {requierePesos && (
                  <p className="text-xs text-muted-foreground">
                    Esta partida ya tiene pesaje inicial: ingresá el peso de cada
                    animal nuevo (a la fecha de la partida).
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Observaciones (para todos)</label>
          <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} className={`${inputCls} w-full resize-y`} />
        </div>

        {requeridosOk && (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Users className="size-3.5" strokeWidth={2} /> Preview · {n} animales
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
                  {requierePesos && (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={pesos[p.nAnimal] ?? ''}
                      onChange={(e) => setPesos((s) => ({ ...s, [p.nAnimal]: e.target.value }))}
                      placeholder="Peso kg *"
                      className={`${inputCls} w-28 shrink-0`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {!requeridosOk && (
          <p className="text-xs text-muted-foreground">
            {hayPesadas && destino === 'existente' && !idPartida
              ? 'Elegí la partida existente.'
              : 'Ingresá la cantidad para ver el preview.'}
          </p>
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
