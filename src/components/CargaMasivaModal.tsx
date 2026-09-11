import { useMemo, useState } from 'react'
import { Loader2, Users, X } from 'lucide-react'
import CatalogoSelect from './CatalogoSelect'
import { CategoriaSelect, PelajeSelect, SexoDeCategoria } from './AnimalCatalogos'
import { round2, fmtPeso, hoyIso } from '../lib/pesos'

// Sin ancho: cada uso define el suyo (w-full / w-24 / w-20). `w-full` en la
// base pisaba a los anchos fijos de las filas del preview.
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
  idPelaje: number
  idCategoria: number
  cantidad: number
  fechaPesajeIni?: string
  modoInicial?: 'total' | 'animal'
  pesoTotal?: number
  desbasteTotal?: number
  observaciones?: string
  animales: PreviewRow[]
}

const parseNum = (s: string): number | undefined => {
  const v = parseFloat(s.replace(',', '.'))
  return isNaN(v) ? undefined : v
}

/**
 * Carga masiva de animales al lote: raza (opcional), pelaje (requerido) y
 * categoría (requerida, infiere sexo) compartidos + peso inicial con toggle
 * total/por animal + observaciones. Al completar lo requerido y la cantidad,
 * lista el preview con N° auto (último del lote + 1, +1, …), caravana por
 * fila y —según el modo— el peso por animal.
 */
export function CargaMasivaModal({
  siguienteN,
  onClose,
  onOk,
}: {
  siguienteN: number
  onClose: () => void
  onOk: (vals: CargaMasivaValues) => Promise<void>
}) {
  const [idRaza, setIdRaza] = useState<string | number>('')
  const [idPelaje, setIdPelaje] = useState<string | number>('')
  const [idCategoria, setIdCategoria] = useState<string | number>('')
  const [cantidad, setCantidad] = useState('')
  const [cargarInicial, setCargarInicial] = useState(false)
  const [modo, setModo] = useState<'total' | 'animal'>('total')
  const [fecha, setFecha] = useState(hoyIso())
  const [pesoTotal, setPesoTotal] = useState('')
  const [desbasteTotal, setDesbasteTotal] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [caravanas, setCaravanas] = useState<Record<number, string>>({})
  const [pesos, setPesos] = useState<Record<number, string>>({})
  const [desbastes, setDesbastes] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const n = parseInt(cantidad, 10)
  const cantidadOk = !isNaN(n) && n > 0 && n <= 500
  const requeridosOk = !!idPelaje && !!idCategoria && cantidadOk

  const preview = useMemo<{ nAnimal: number }[]>(() => {
    if (!cantidadOk) return []
    return Array.from({ length: n }, (_, i) => ({ nAnimal: siguienteN + i }))
  }, [cantidadOk, n, siguienteN])

  const totalNum = parseNum(pesoTotal)
  const porAnimal = totalNum != null && n > 0 ? round2(totalNum / n) : null

  const setCaravana = (k: number, val: string) =>
    setCaravanas((s) => ({ ...s, [k]: val }))

  const rows = preview.map((p) => ({
    nAnimal: p.nAnimal,
    caravana: (caravanas[p.nAnimal] ?? '').trim(),
  }))

  const submit = async () => {
    setError('')
    if (!idPelaje) return setError('El pelaje es obligatorio.')
    if (!idCategoria) return setError('La categoría es obligatoria.')
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
    if (cargarInicial) {
      if (!fecha) return setError('Indicá la fecha del pesaje inicial.')
      if (modo === 'total' && (totalNum == null || totalNum <= 0)) {
        return setError('Ingresá el peso total del lote.')
      }
    }
    setBusy(true)
    try {
      await onOk({
        ...(idRaza ? { idRaza: Number(idRaza) } : {}),
        idPelaje: Number(idPelaje),
        idCategoria: Number(idCategoria),
        cantidad: n,
        ...(cargarInicial
          ? {
              fechaPesajeIni: fecha,
              modoInicial: modo,
              ...(modo === 'total'
                ? {
                    pesoTotal: totalNum,
                    ...(parseNum(desbasteTotal) != null
                      ? { desbasteTotal: parseNum(desbasteTotal) }
                      : {}),
                  }
                : {}),
            }
          : {}),
        observaciones: observaciones.trim() || undefined,
        animales: rows.map((r) => ({
          nAnimal: r.nAnimal,
          caravana: r.caravana,
          ...(cargarInicial && modo === 'animal' && parseNum(pesos[r.nAnimal] ?? '') != null
            ? {
                peso: parseNum(pesos[r.nAnimal] ?? ''),
                ...(parseNum(desbastes[r.nAnimal] ?? '') != null
                  ? { desbaste: parseNum(desbastes[r.nAnimal] ?? '') }
                  : {}),
              }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-card border border-border rounded-lg shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Carga masiva de animales</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Se crean N animales con estos datos compartidos. El sexo se infiere de la
          categoría. Al completar lo obligatorio y la cantidad, cargás cada caravana.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <CatalogoSelect
            tipo="raza"
            label="Raza"
            placeholder="Buscar o agregar raza..."
            value={idRaza}
            onChange={setIdRaza}
          />
          <div className="flex items-end gap-2">
            <CategoriaSelect value={idCategoria} onChange={setIdCategoria} className="flex-1" />
            <SexoDeCategoria idCategoria={idCategoria} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <PelajeSelect value={idPelaje} onChange={setIdPelaje} idRaza={idRaza} />
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Cantidad *</label>
            <input
              type="number"
              min={1}
              max={500}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className={inputCls}
              placeholder="Ej: 10"
            />
          </div>
        </div>

        {/* Peso inicial (opcional) */}
        <div className="space-y-3 border border-border rounded-md p-4">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={cargarInicial}
              onChange={(e) => setCargarInicial(e.target.checked)}
              className="size-4 accent-[var(--color-primary)]"
            />
            Cargar peso inicial ahora
          </label>
          {cargarInicial && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Fecha *</label>
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-foreground">Modo</span>
                  <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5 w-full">
                    {(['total', 'animal'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setModo(m)}
                        className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                          modo === m
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {m === 'total' ? 'Peso total' : 'Por animal'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {modo === 'total' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Peso total (kg) *</label>
                    <input type="number" step="0.01" min="0" value={pesoTotal} onChange={(e) => setPesoTotal(e.target.value)} className={inputCls} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Desbaste total (opcional)</label>
                    <input type="number" step="0.01" min="0" value={desbasteTotal} onChange={(e) => setDesbasteTotal(e.target.value)} className={inputCls} />
                  </div>
                </div>
              )}
              {modo === 'total' && porAnimal != null && (
                <p className="text-xs text-muted-foreground">≈ {fmtPeso(porAnimal)} kg por animal (se aplicará a cada uno).</p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Observaciones (para todos)</label>
          <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} className={`${inputCls} resize-y`} />
        </div>

        {requeridosOk && (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Users className="size-3.5" strokeWidth={2} /> Preview · {n} animales
            </div>
            <div className="divide-y divide-border max-h-64 overflow-y-auto">
              {preview.map((p) => (
                <div key={p.nAnimal} className="flex items-center gap-2 px-3 py-2">
                  <span className="w-10 shrink-0 text-sm font-medium text-foreground">#{p.nAnimal}</span>
                  <input
                    type="text"
                    value={caravanas[p.nAnimal] ?? ''}
                    onChange={(e) => setCaravana(p.nAnimal, e.target.value)}
                    placeholder="Caravana *"
                    className={inputCls}
                  />
                  {cargarInicial && modo === 'animal' && (
                    <>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={pesos[p.nAnimal] ?? ''}
                        onChange={(e) => setPesos((s) => ({ ...s, [p.nAnimal]: e.target.value }))}
                        placeholder="Peso kg"
                        className={`${inputCls} w-24`}
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={desbastes[p.nAnimal] ?? ''}
                        onChange={(e) => setDesbastes((s) => ({ ...s, [p.nAnimal]: e.target.value }))}
                        placeholder="Desb."
                        title="Desbaste (opcional)"
                        className={`${inputCls} w-20`}
                      />
                    </>
                  )}
                  {cargarInicial && modo === 'total' && (
                    <span className="w-24 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
                      {porAnimal != null ? `${fmtPeso(porAnimal)} kg` : '—'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {!requeridosOk && (
          <p className="text-xs text-muted-foreground">
            Completá pelaje, categoría y cantidad para ver el preview.
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
            Crear {cantidadOk ? n : ''} animales
          </button>
        </div>
      </div>
    </div>
  )
}
