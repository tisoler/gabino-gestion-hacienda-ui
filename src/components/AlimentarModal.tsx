import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Loader2, X } from 'lucide-react'
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

/**
 * Alimentar corral: elige corral, dieta (activas: globales + de la empresa),
 * cantidad (kg) y fecha. El server reparte la cantidad entre los lotes del
 * corral en proporción a sus animales vivos.
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
  const [idDieta, setIdDieta] = useState<string | number>('')
  const [cantidad, setCantidad] = useState('')
  const [fecha, setFecha] = useState(hoyIso())
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

  const n = parseFloat(cantidad.replace(',', '.'))
  const cantidadOk = !isNaN(n) && n > 0
  const listo = idCorral !== '' && idDieta !== '' && cantidadOk && !!fecha

  const submit = async () => {
    setError('')
    if (!listo) return
    setBusy(true)
    try {
      await api.post('/alimentaciones', {
        idCorral: Number(idCorral),
        idDieta: Number(idDieta),
        cantidadKg: n,
        fecha,
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
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-xl p-6 space-y-4">
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
          La cantidad se reparte entre los lotes del corral según sus animales vivos
          (los de enfermería cuentan; los muertos no).
        </p>

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

        <SelectAutocomplete
          label="Dieta *"
          placeholder="Elegir dieta activa..."
          value={idDieta}
          onChange={setIdDieta}
          options={dietasOpciones.map((d) => ({ value: d.id, label: `${d.nombre} (v${d.version})` }))}
          clearable={false}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Cantidad (kg) *</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className={`${inputCls} w-full`}
              placeholder="Ej: 2500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Fecha *</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className={`${inputCls} w-full`}
            />
          </div>
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
            Registrar alimentación
          </button>
        </div>
      </div>
    </div>
  )
}
