import { useMemo, useState } from 'react'
import { Loader2, Users, X } from 'lucide-react'
import CatalogoSelect from './CatalogoSelect'
import { CategoriaSelect, PelajeSelect, SexoDeCategoria } from './AnimalCatalogos'

const inputCls =
  'w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

interface PreviewRow {
  nAnimal: number
  caravana: string
}

export interface CargaMasivaValues {
  idRaza?: number
  idPelaje: number
  idCategoria: number
  cantidad: number
  fechaPesajeIni?: string
  pesoInicial?: number
  desbasteIni?: number
  fechaPesajeFin?: string
  pesoFinal?: number
  desbasteFin?: number
  observaciones?: string
  animales: PreviewRow[]
}

/**
 * Carga masiva de animales al lote: raza (opcional), pelaje (requerido) y
 * categoría (requerida, infiere sexo) compartidos + pesajes/observaciones
 * opcionales. Al completar lo requerido y la cantidad, lista el preview con
 * el N° auto (último del lote + 1, +1, …) y un input de caravana por fila.
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
  const [fechaPesajeIni, setFechaPesajeIni] = useState('')
  const [pesoInicial, setPesoInicial] = useState('')
  const [desbasteIni, setDesbasteIni] = useState('')
  const [fechaPesajeFin, setFechaPesajeFin] = useState('')
  const [pesoFinal, setPesoFinal] = useState('')
  const [desbasteFin, setDesbasteFin] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [caravanas, setCaravanas] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const n = parseInt(cantidad, 10)
  const cantidadOk = !isNaN(n) && n > 0 && n <= 500
  const requeridosOk = !!idPelaje && !!idCategoria && cantidadOk

  const preview = useMemo<PreviewRow[]>(() => {
    if (!cantidadOk) return []
    return Array.from({ length: n }, (_, i) => ({
      nAnimal: siguienteN + i,
      caravana: caravanas[siguienteN + i] ?? '',
    }))
  }, [cantidadOk, n, siguienteN, caravanas])

  const setCaravana = (nAnimal: number, val: string) =>
    setCaravanas((s) => ({ ...s, [nAnimal]: val }))

  const toNum = (s: string): number | undefined => {
    const v = parseFloat(s.replace(',', '.'))
    return isNaN(v) ? undefined : v
  }

  const submit = async () => {
    setError('')
    if (!idPelaje) return setError('El pelaje es obligatorio.')
    if (!idCategoria) return setError('La categoría es obligatoria.')
    if (!cantidadOk) return setError('Ingresá una cantidad válida (1 a 500).')
    const rows = preview.map((r) => ({ ...r, caravana: (caravanas[r.nAnimal] ?? '').trim() }))
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
        idPelaje: Number(idPelaje),
        idCategoria: Number(idCategoria),
        cantidad: n,
        fechaPesajeIni: fechaPesajeIni || undefined,
        pesoInicial: pesoInicial.trim() ? toNum(pesoInicial) : undefined,
        desbasteIni: desbasteIni.trim() ? toNum(desbasteIni) : undefined,
        fechaPesajeFin: fechaPesajeFin || undefined,
        pesoFinal: pesoFinal.trim() ? toNum(pesoFinal) : undefined,
        desbasteFin: desbasteFin.trim() ? toNum(desbasteFin) : undefined,
        observaciones: observaciones.trim() || undefined,
        animales: rows,
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

        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Pesaje inicial / final y observaciones (opcional, para todos)
          </summary>
          <div className="grid gap-3 sm:grid-cols-3 mt-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Fecha pesaje inicial</label>
              <input type="date" value={fechaPesajeIni} onChange={(e) => setFechaPesajeIni(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Peso inicial (kg)</label>
              <input type="number" step="0.01" value={pesoInicial} onChange={(e) => setPesoInicial(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Desbaste inicial</label>
              <input type="number" step="0.01" value={desbasteIni} onChange={(e) => setDesbasteIni(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Fecha pesaje final</label>
              <input type="date" value={fechaPesajeFin} onChange={(e) => setFechaPesajeFin(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Peso final (kg)</label>
              <input type="number" step="0.01" value={pesoFinal} onChange={(e) => setPesoFinal(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Desbaste final</label>
              <input type="number" step="0.01" value={desbasteFin} onChange={(e) => setDesbasteFin(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1 sm:col-span-3">
              <label className="text-xs font-medium text-foreground">Observaciones</label>
              <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} className={`${inputCls} resize-y`} />
            </div>
          </div>
        </details>

        {requeridosOk && (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Users className="size-3.5" strokeWidth={2} /> Preview · {n} animales · ingresá las caravanas
            </div>
            <div className="divide-y divide-border max-h-64 overflow-y-auto">
              {preview.map((r) => (
                <div key={r.nAnimal} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-12 shrink-0 text-sm font-medium text-foreground">#{r.nAnimal}</span>
                  <input
                    type="text"
                    value={caravanas[r.nAnimal] ?? ''}
                    onChange={(e) => setCaravana(r.nAnimal, e.target.value)}
                    placeholder="Caravana"
                    className={inputCls}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {!requeridosOk && (
          <p className="text-xs text-muted-foreground">
            Completá pelaje, categoría y cantidad para ver el preview de caravanas.
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
