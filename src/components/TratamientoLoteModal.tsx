import { useState } from 'react'
import { Loader2, Stethoscope, X } from 'lucide-react'
import api from '../lib/api'
import { AtajosHora } from './AtajosHora'
import { TratamientosEditor } from './TratamientosEditor'
import {
  aTratamientosDto,
  limpiarTratamientosPayload,
  validarTratamientosPayload,
  type TratamientoPayload,
} from '../lib/veterinaria'

const inputCls =
  'w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

const hoyIso = (): string => {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const hhmmActual = (): string => {
  const d = new Date()
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`
}

/**
 * Aplica tratamiento(s) a TODO el lote: un registro por animal activo
 * (sano/enfermo), sin movimiento y con alcance 'lote' (bulk en transacción).
 */
export function TratamientoLoteModal({
  loteId,
  loteNombre,
  onClose,
  onGuardado,
}: {
  loteId: number
  loteNombre: string
  onClose: () => void
  onGuardado: () => Promise<void> | void
}) {
  const [fecha, setFecha] = useState(hoyIso())
  const [hora, setHora] = useState(hhmmActual())
  const [tratPayload, setTratPayload] = useState<TratamientoPayload[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    const items = limpiarTratamientosPayload(tratPayload)
    if (items.length === 0) {
      setError('Agregá al menos un tratamiento.')
      return
    }
    const errTrat = validarTratamientosPayload(items)
    if (errTrat) {
      setError(errTrat)
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.post(`/lotes/${loteId}/tratamientos`, {
        fecha,
        hora: `${hora}:00`,
        items: aTratamientosDto(items),
      })
      await onGuardado()
      onClose()
    } catch (err) {
      console.error(err)
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'No se pudo aplicar el tratamiento al lote.',
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
          <h2 className="text-base font-semibold text-foreground">
            Tratar lote "{loteNombre}"
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Se registra un tratamiento por cada animal activo del lote (sin contar
          muertos ni salidos), sin movimiento.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center min-h-7">
              <label className="text-xs font-medium text-foreground">Fecha *</label>
            </div>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 min-h-7">
              <label className="text-xs font-medium text-foreground">Hora *</label>
              <AtajosHora value={hora} onChange={setHora} />
            </div>
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={inputCls} />
          </div>
        </div>

        <TratamientosEditor onChange={setTratPayload} />

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
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Stethoscope className="size-4" strokeWidth={2} />}
            Aplicar al lote
          </button>
        </div>
      </div>
    </div>
  )
}
