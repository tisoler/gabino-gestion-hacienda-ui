import { useState } from 'react'
import { Loader2, X } from 'lucide-react'

export interface TratamientoFormValues {
  nombre: string
  descripcion: string | null
  precioReferencia: number | null
  idEmpresa?: number | null
}

export interface TratamientoModalTratamiento {
  id?: number
  nombre: string
  descripcion: string | null
  precioReferencia: number | string | null
  idEmpresa: number | null
}

/**
 * Alta/edición de tratamiento (estilo CorralModal). Reutilizable:
 * - `nombreInicial`: prefill del nombre (crear on-the-fly desde un select).
 * - `alcanceFijo`: oculta el selector de alcance y fija el destino
 *   (global o empresa; sin id = empresa actual del usuario).
 * No persiste: emite los valores por `onOk` y el padre decide (POST
 * /tratamientos o alta local).
 */
export function TratamientoModal({
  tratamiento,
  empresas,
  puedeElegirAlcance,
  nombreInicial,
  alcanceFijo,
  onClose,
  onOk,
}: {
  tratamiento?: TratamientoModalTratamiento
  empresas: { id: number; nombre: string }[]
  puedeElegirAlcance: boolean
  nombreInicial?: string
  alcanceFijo?: { tipo: 'global' } | { tipo: 'empresa'; idEmpresa?: number } | null
  onClose: () => void
  onOk: (vals: TratamientoFormValues) => Promise<void>
}) {
  const editando = !!tratamiento
  const [nombre, setNombre] = useState(tratamiento?.nombre ?? nombreInicial ?? '')
  const [descripcion, setDescripcion] = useState(tratamiento?.descripcion ?? '')
  const [precio, setPrecio] = useState(
    tratamiento?.precioReferencia != null ? String(tratamiento.precioReferencia) : '',
  )
  const [alcance, setAlcance] = useState<string | number>(
    editando ? (tratamiento!.idEmpresa ?? 'global') : 'global',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const parseNum = (s: string): number | null => {
    if (!s.trim()) return null
    const n = parseFloat(s.replace(',', '.'))
    return isNaN(n) || n < 0 ? null : Math.round(n * 100) / 100
  }

  const submit = async () => {
    if (!nombre.trim()) {
      setError('El nombre es obligatorio.')
      return
    }
    const precioNum = parseNum(precio)
    if (precio.trim() && precioNum == null) {
      setError('El precio de referencia debe ser un número mayor o igual a 0.')
      return
    }
    setError('')
    setBusy(true)
    try {
      await onOk({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        precioReferencia: precioNum,
        ...(alcanceFijo
          ? (alcanceFijo.tipo === 'global'
            ? { idEmpresa: null }
            : alcanceFijo.idEmpresa != null
              ? { idEmpresa: alcanceFijo.idEmpresa }
              : {})
          : puedeElegirAlcance
            ? { idEmpresa: alcance === 'global' ? null : Number(alcance) }
            : {}),
      })
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo guardar el tratamiento.'))
      setBusy(false)
    }
  }

  const inputCls =
    'w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            {editando ? `Editar tratamiento "${tratamiento.nombre}"` : 'Nuevo tratamiento'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Nombre *</label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={inputCls}
            placeholder="Ej: Antibiótico"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Descripción</label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
            className={`${inputCls} resize-y`}
            placeholder="Detalle opcional del tratamiento"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Precio ref.</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            className={inputCls}
            placeholder="Ej: 3500.00"
          />
        </div>

        {alcanceFijo ? (
          <p className="text-xs text-muted-foreground">
            Se {alcanceFijo.tipo === 'global' ? 'creará como tratamiento global' : 'creará para la empresa actual'}.
          </p>
        ) : puedeElegirAlcance ? (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Alcance</label>
            <select
              value={alcance}
              onChange={(e) => setAlcance(e.target.value === 'global' ? 'global' : Number(e.target.value))}
              className={`${inputCls} cursor-pointer`}
            >
              <option value="global">Global (todas las empresas)</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Se {editando ? 'mantiene en tu empresa actual' : 'creará para tu empresa actual'}.
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
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {editando ? 'Guardar cambios' : 'Agregar tratamiento'}
          </button>
        </div>
      </div>
    </div>
  )
}

function extractMsg(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback
}
