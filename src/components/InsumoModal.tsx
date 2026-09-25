import { useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import SelectAutocomplete, { type SelectAutocompleteOption } from './SelectAutocomplete'
import { INSUMO_UNIDADES, INSUMO_UNIDAD_LABELS } from '../constantes'

export interface CategoriaInsumoOption {
  id: number
  nombre: string
  idEmpresa: number | null
}

export interface InsumoFormValues {
  nombre: string
  descripcion: string | null
  idCategoria?: number | null
  categoriaNueva?: string
  precioReferencia: number | null
  unidad: string | null
  idEmpresa?: number | null
}

export interface InsumoModalInsumo {
  id?: number
  nombre: string
  descripcion: string | null
  idCategoria: number | null
  precioReferencia: number | string | null
  unidad: string | null
  idEmpresa: number | null
}

/**
 * Alta/edición de insumo (estilo CorralModal). Reutilizable:
 * - `nombreInicial`: prefill del nombre (crear on-the-fly desde un select).
 * - `categoriaFija`: oculta el selector y fija la categoría (sólo lectura).
 * - `alcanceFijo`: oculta el selector de alcance y fija el destino.
 * No persiste: emite los valores por `onOk` y el padre decide (POST
 * /insumos o alta local para "crear vía dieta").
 */
export function InsumoModal({
  insumo,
  categorias,
  empresas,
  puedeElegirAlcance,
  nombreInicial,
  categoriaFija,
  alcanceFijo,
  onClose,
  onOk,
}: {
  insumo?: InsumoModalInsumo
  categorias: CategoriaInsumoOption[]
  empresas: { id: number; nombre: string }[]
  puedeElegirAlcance: boolean
  nombreInicial?: string
  categoriaFija?: { id: number; nombre: string } | null
  alcanceFijo?: { tipo: 'global' } | { tipo: 'empresa'; idEmpresa?: number } | null
  onClose: () => void
  onOk: (vals: InsumoFormValues) => Promise<void>
}) {
  const editando = !!insumo
  const [nombre, setNombre] = useState(insumo?.nombre ?? nombreInicial ?? '')
  const [descripcion, setDescripcion] = useState(insumo?.descripcion ?? '')
  const [idCategoria, setIdCategoria] = useState<string | number>(
    categoriaFija ? categoriaFija.id : (insumo?.idCategoria ?? ''),
  )
  const [precio, setPrecio] = useState(
    insumo?.precioReferencia != null ? String(insumo.precioReferencia) : '',
  )
  const [unidad, setUnidad] = useState(insumo?.unidad ?? '')
  const [alcance, setAlcance] = useState<string | number>(
    editando ? (insumo!.idEmpresa ?? 'global') : 'global',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Categorías nuevas creadas en el FE (id temporal negativo): igual que los
  // ingredientes en "Nueva versión de la dieta". El server las persiste al
  // guardar el insumo, con el alcance elegido.
  const [nuevas, setNuevas] = useState<{ tempId: number; nombre: string }[]>([])
  const alcanceId = alcanceFijo
    ? (alcanceFijo.tipo === 'global' ? null : (alcanceFijo.idEmpresa ?? null))
    : puedeElegirAlcance
      ? (alcance === 'global' ? null : Number(alcance))
      : null
  const catsAlcance = useMemo(
    () => (categorias ?? []).filter(
      (c) => c.idEmpresa == null || (alcanceId != null && c.idEmpresa === alcanceId),
    ),
    [categorias, alcanceId],
  )
  const opciones: SelectAutocompleteOption[] = useMemo(() => {
    const base = catsAlcance.map((c) => ({ value: c.id, label: c.nombre }))
    const nu = nuevas.map((n) => ({ value: n.tempId, label: n.nombre }))
    // Si la categoría actual quedó fuera del filtro de alcance, se conserva
    // como opción para no romper el select controlado.
    if (
      idCategoria !== '' &&
      Number(idCategoria) > 0 &&
      !base.some((o) => Number(o.value) === Number(idCategoria))
    ) {
      const actual = (categorias ?? []).find((c) => c.id === Number(idCategoria))
      base.unshift({
        value: Number(idCategoria),
        label: actual ? `${actual.nombre} (otra empresa)` : `Categoría ${idCategoria}`,
      })
    }
    return [...base, ...nu]
  }, [catsAlcance, nuevas, idCategoria, categorias])

  const crearCategoriaLocal = async (txt: string): Promise<number> => {
    const limpio = txt.trim().replace(/\s+/g, ' ')
    const existente = opciones.find((o) => o.label.toLowerCase() === limpio.toLowerCase())
    if (existente) return Number(existente.value)
    const tempId = -Date.now()
    setNuevas((prev) => [...prev, { tempId, nombre: limpio }])
    return tempId
  }
  const nombreDeNueva = (tempId: number) => nuevas.find((n) => n.tempId === tempId)?.nombre

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
    const v = categoriaFija ? categoriaFija.id : idCategoria === '' ? null : Number(idCategoria)
    let categoriaNueva: string | undefined
    let idCat: number | null | undefined = v
    if (v != null && v < 0) {
      categoriaNueva = nombreDeNueva(v)
      if (!categoriaNueva) {
        setError('La categoría nueva no tiene nombre.')
        return
      }
      idCat = undefined
    }
    setError('')
    setBusy(true)
    try {
      await onOk({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        ...(idCat !== undefined ? { idCategoria: idCat } : {}),
        ...(categoriaNueva ? { categoriaNueva } : {}),
        precioReferencia: precioNum,
        unidad: unidad || null,
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
      setError(extractMsg(err, 'No se pudo guardar el insumo.'))
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
            {editando ? `Editar insumo "${insumo.nombre}"` : 'Nuevo insumo'}
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
            placeholder="Ej: Urea 46%"
          />
        </div>

        {categoriaFija ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Categoría</span>
            <p>
              <span className="inline-flex items-center px-2 py-0.5 bg-info-soft text-info text-[11px] font-medium rounded">
                {categoriaFija.nombre}
              </span>
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Categoría</span>
            <SelectAutocomplete
              placeholder="Buscar o agregar categoría..."
              value={idCategoria}
              onChange={(val) => setIdCategoria(val)}
              options={opciones}
              allowCreate
              onCreate={crearCategoriaLocal}
              renderTag={(o) => {
                const val = Number(o.value)
                if (val < 0) {
                  return (
                    <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-info bg-info-soft rounded-full px-1.5 py-0.5">
                      Nueva
                    </span>
                  )
                }
                const item = (categorias ?? []).find((c) => c.id === val)
                return item?.idEmpresa == null ? (
                  <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                    Global
                  </span>
                ) : null
              }}
              emptyMessage="No encontrada. Escribí para agregar."
            />
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Descripción</label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
            className={`${inputCls} resize-y`}
            placeholder="Detalle opcional del insumo"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Precio ref.</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              className={inputCls}
              placeholder="Ej: 1200.50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Unidad</label>
            <select
              value={unidad}
              onChange={(e) => setUnidad(e.target.value)}
              className={`${inputCls} cursor-pointer`}
            >
              <option value="">Sin unidad</option>
              {INSUMO_UNIDADES.map((u) => (
                <option key={u} value={u}>{INSUMO_UNIDAD_LABELS[u]}</option>
              ))}
            </select>
          </div>
        </div>

        {alcanceFijo ? (
          <p className="text-xs text-muted-foreground">
            Se {alcanceFijo.tipo === 'global' ? 'creará como insumo global' : 'creará para la empresa de la dieta'}.
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
            <p className="text-xs text-muted-foreground">
              Las categorías nuevas se crean con este alcance.
            </p>
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
            {editando ? 'Guardar cambios' : 'Agregar insumo'}
          </button>
        </div>
      </div>
    </div>
  )
}

function extractMsg(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback
}
