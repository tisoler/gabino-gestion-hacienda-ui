import { useState } from 'react'
import useSWR from 'swr'
import { Loader2, X } from 'lucide-react'
import api, { fetcher } from '../lib/api'
import { NumeroInput } from './NumeroInput'
import SelectAutocomplete from './SelectAutocomplete'

const inputCls =
  'px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

const hoyIso = (): string => {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * Imputar un costo vario pendiente al lote (queda en el balance hasta
 * liquidarse). El costo puede elegirse del catálogo o crearse on-the-fly por
 * nombre (el server lo crea en la empresa).
 */
export function CostoAplicadoModal({
  loteId,
  onClose,
  onGuardado,
}: {
  loteId: number
  onClose: () => void
  onGuardado: () => Promise<void> | void
}) {
  const [costo, setCosto] = useState<string | number>('')
  const [fecha, setFecha] = useState(hoyIso())
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const { data: costosCatalogo } = useSWR<{ id: number; nombre: string; precioReferencia: number | string | null }[]>(
    '/costos',
    fetcher,
    { revalidateOnFocus: false },
  )

  const elegirCosto = (v: string | number) => {
    setCosto(v)
    if (typeof v === 'number') {
      const cat = (costosCatalogo ?? []).find((c) => c.id === v)
      if (cat) {
        if (!descripcion) setDescripcion(cat.nombre)
        if (!monto && cat.precioReferencia != null) setMonto(String(cat.precioReferencia))
      }
    } else if (typeof v === 'string') {
      if (!descripcion) setDescripcion(v)
    }
  }

  const parseNum = (s: string): number | undefined => {
    if (!s.trim()) return undefined
    const n = parseFloat(s.replace(',', '.'))
    return isNaN(n) || n < 0 ? undefined : Math.round(n * 100) / 100
  }

  const submit = async () => {
    setError('')
    if (costo === '') {
      setError('Elegí o creá el costo.')
      return
    }
    if (!fecha) {
      setError('Indicá la fecha del costo.')
      return
    }
    const m = parseNum(monto)
    if (m == null) {
      setError('El monto debe ser un número mayor o igual a 0.')
      return
    }
    setBusy(true)
    try {
      await api.post(`/lotes/${loteId}/costos`, {
        ...(typeof costo === 'number' ? { idCosto: costo } : { nombre: costo }),
        fecha,
        ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}),
        monto: m,
      })
      await onGuardado()
      onClose()
    } catch (err) {
      console.error(err)
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'No se pudo imputar el costo.',
      )
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Imputar costo al lote</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Queda pendiente en el balance hasta liquidarse.
        </p>

        {costosCatalogo ? (
          <SelectAutocomplete
            label="Costo *"
            placeholder="Buscar o crear costo..."
            value={costo}
            onChange={elegirCosto}
            options={(costosCatalogo ?? []).map((c) => ({ value: c.id, label: c.nombre }))}
            allowCreate
            onCreate={async (nombre) => nombre}
          />
        ) : (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Costo *</label>
            <input
              type="text"
              value={typeof costo === 'string' ? costo : ''}
              onChange={(e) => elegirCosto(e.target.value)}
              className={`${inputCls} w-full`}
              placeholder="Nombre del costo..."
            />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Fecha *</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className={`${inputCls} w-full`}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Monto *</label>
            <NumeroInput
              min={0}
              step="0.01"
              value={monto}
              onChange={setMonto}
              className={`${inputCls} w-full`}
              placeholder="$"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Descripción</label>
          <input
            type="text"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className={`${inputCls} w-full`}
            placeholder="Detalle del costo..."
          />
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
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Imputar costo
          </button>
        </div>
      </div>
    </div>
  )
}
