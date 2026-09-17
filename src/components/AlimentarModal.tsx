import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Loader2, Plus, X } from 'lucide-react'
import api, { fetcher } from '../lib/api'
import SelectAutocomplete from './SelectAutocomplete'
import type { CorralOpcion, DietaOpcion } from '../lib/alimentacion'

const inputCls =
  'px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

const hoyIso = (): string => {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

interface Fila {
  key: number
  idDieta: string | number
  fecha: string
  cantidad: string
}

let proxKey = 1
const nuevaFila = (prev?: Fila): Fila => ({
  key: proxKey++,
  idDieta: prev?.idDieta ?? '',
  fecha: prev?.fecha ?? hoyIso(),
  cantidad: '',
})

/**
 * Alimentar corral: el corral es fijo arriba y se cargan UNA O MÁS filas
 * (dieta + fecha + cantidad). Cada fila es una alimentación para ese día.
 * La fila nueva hereda la fecha y la dieta de la anterior.
 */
export function AlimentarModal({
  initialCorralId,
  onClose,
  onSaved,
}: {
  initialCorralId?: number
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const { data: corrales } = useSWR<CorralOpcion[]>('/corrales', fetcher)
  const { data: dietas } = useSWR<DietaOpcion[]>('/dietas', fetcher)

  const [idCorral, setIdCorral] = useState<string | number>(initialCorralId ?? '')
  const [filas, setFilas] = useState<Fila[]>([nuevaFila()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Sólo corrales COMUNES con animales vivos: la enfermería se alimenta a
  // través del corral de su lote.
  const corralesActivos = useMemo(
    () =>
      (corrales ?? []).filter(
        (c) => c.activo && c.tipo === 'comun' && c.tieneVivos,
      ),
    [corrales],
  )
  // /dietas (sin `estado`) ya devuelve sólo las activas (globales + de la empresa).
  const dietasOpciones = useMemo(() => dietas ?? [], [dietas])

  const setFila = (key: number, patch: Partial<Fila>) =>
    setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)))

  const quitarFila = (key: number) => setFilas((fs) => fs.filter((f) => f.key !== key))

  const agregarFila = () => {
    const ultima = filas[filas.length - 1]
    setFilas((fs) => [...fs, nuevaFila(ultima)])
  }

  const filasValidas = filas.every((f) => {
    const n = parseFloat(f.cantidad.replace(',', '.'))
    return f.idDieta !== '' && !!f.fecha && !isNaN(n) && n > 0
  })
  const listo = idCorral !== '' && filas.length > 0 && filasValidas

  const submit = async () => {
    setError('')
    if (!listo) return
    setBusy(true)
    try {
      await api.post('/alimentaciones/masiva', {
        idCorral: Number(idCorral),
        filas: filas.map((f) => ({
          idDieta: Number(f.idDieta),
          cantidadKg: parseFloat(f.cantidad.replace(',', '.')),
          fecha: f.fecha,
        })),
      })
      await onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'No se pudo registrar la alimentación.',
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
          <h2 className="text-base font-semibold text-foreground">Alimentar corral</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          La cantidad de cada fila se reparte entre los lotes del corral según sus animales
          vivos (los de enfermería cuentan; los muertos no).
        </p>

        {/* Corral: único, siempre arriba */}
        <SelectAutocomplete
          label="Corral *"
          placeholder="Elegir corral..."
          value={idCorral}
          onChange={setIdCorral}
          options={corralesActivos.map((c) => ({
            value: c.id,
            label: c.nombre,
          }))}
          clearable={false}
        />

        {/* Filas */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground">Alimentaciones ({filas.length})</label>
            <button
              onClick={agregarFila}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors cursor-pointer"
            >
              <Plus className="size-3.5" strokeWidth={2} /> Agregar fila
            </button>
          </div>

          {filas.map((f, i) => (
            <div key={f.key} className="border border-border rounded-md p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Fila {i + 1}
                </span>
                {filas.length > 1 && (
                  <button
                    onClick={() => quitarFila(f.key)}
                    title="Quitar fila"
                    className="p-1 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors cursor-pointer"
                  >
                    <X className="size-3.5" strokeWidth={2} />
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
                <SelectAutocomplete
                  label="Dieta *"
                  placeholder="Elegir dieta..."
                  value={f.idDieta}
                  onChange={(v) => setFila(f.key, { idDieta: v })}
                  options={dietasOpciones.map((d) => ({
                    value: d.id,
                    label: `${d.nombre} (v${d.version})`,
                  }))}
                  clearable={false}
                />
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Fecha *</label>
                  <input
                    type="date"
                    value={f.fecha}
                    onChange={(e) => setFila(f.key, { fecha: e.target.value })}
                    className={`${inputCls} w-full`}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Cantidad (kg) *</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={f.cantidad}
                    onChange={(e) => setFila(f.key, { cantidad: e.target.value })}
                    className={`${inputCls} w-full`}
                    placeholder="Ej: 2500"
                  />
                </div>
                <div className="hidden sm:block" aria-hidden />
              </div>
            </div>
          ))}
        </div>

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
            Registrar {filas.length} alimentación{filas.length !== 1 ? 'es' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}