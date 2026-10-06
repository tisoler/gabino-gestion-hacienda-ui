import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { fetcher } from '../lib/api'
import SelectAutocomplete, { type SelectAutocompleteOption } from './SelectAutocomplete'
import { NumeroInput } from './NumeroInput'
import { TratamientoModal, type TratamientoFormValues } from './TratamientoModal'
import { InsumoModal, type InsumoFormValues } from './InsumoModal'
import type { TratamientoPayload } from '../lib/veterinaria'

const inputCls =
  'px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

/** Bloque inicial del editor (registros existentes o vacío = bloque nuevo). */
export interface EditorTratamientoInicial {
  idRegistro?: number
  idTratamiento?: number
  precio?: number | null
  insumos: { idRegistro?: number; idInsumo?: number; precio?: number | null }[]
}

interface InsumoOpcion {
  id: number
  nombre: string
  idEmpresa: number | null
  precioReferencia: number | string | null
  categoria?: { id: number; nombre: string } | null
}

interface TratamientoOpcion {
  id: number
  nombre: string
  idEmpresa: number | null
  precioReferencia: number | string | null
}

/** Categoría que habilita a un insumo para tratamientos. */
const CATEGORIA_VETERINARIA = 'veterinaria'

/** Categoría fija de los insumos creados desde este editor. */
const CATEGORIA_VETERINARIA_FIJA = { id: 2, nombre: 'Veterinaria' }

interface FilaInsumo {
  key: number
  idRegistro?: number
  selInsumo: string | number
  precio: string
}

interface FilaTratamiento {
  key: number
  idRegistro?: number
  selTratamiento: string | number
  precio: string
  insumos: FilaInsumo[]
}

const toNum = (s: string): number | null => {
  if (!s.trim()) return null
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) || n < 0 ? null : Math.round(n * 100) / 100
}

const fmtRef = (p: number | string | null | undefined): string =>
  p == null || p === '' ? '' : String(p)

const bloqueVacio = (key: number): FilaTratamiento => ({
  key,
  selTratamiento: '',
  precio: '',
  insumos: [{ key: 1, selInsumo: '', precio: '' }],
})

/**
 * Editor de uno o más tratamientos, cada uno con uno o más insumos
 * (misma dinámica que los ingredientes de la dieta). Crear un valor nuevo
 * abre el modal correspondiente (con todos sus campos: descripción, precio
 * de referencia, unidad) y queda como temporal con sus valores; el server
 * lo persiste al guardar, con la empresa del lote y bajo
 * escritura:veterinaria (sin pedir escritura:insumo, igual que en dietas).
 * Emite el payload resuelto en cada cambio.
 */
export function TratamientosEditor({
  inicial = [],
  onChange,
}: {
  inicial?: EditorTratamientoInicial[]
  onChange: (payload: TratamientoPayload[]) => void
}) {
  const [filas, setFilas] = useState<FilaTratamiento[]>(() =>
    inicial.length > 0
      ? inicial.map((b, idx) => ({
          key: idx + 1,
          idRegistro: b.idRegistro,
          selTratamiento: b.idTratamiento ?? '',
          precio: b.precio != null ? String(b.precio) : '',
          insumos: (b.insumos?.length ? b.insumos : [{}]).map((ins, j) => ({
            key: j + 1,
            idRegistro: ins.idRegistro,
            selInsumo: ins.idInsumo ?? '',
            precio: ins.precio != null ? String(ins.precio) : '',
          })),
        }))
      : [bloqueVacio(1)],
  )
  const [sigue, setSigue] = useState((inicial.length || 1) + 1)
  const [sigueIns, setSigueIns] = useState(1000)
  const [nuevosTrat, setNuevosTrat] = useState<{ tempId: number; vals: TratamientoFormValues }[]>([])
  const [nuevosIns, setNuevosIns] = useState<{ tempId: number; vals: InsumoFormValues }[]>([])
  const [creandoTrat, setCreandoTrat] = useState<{ nombre: string; filaKey: number } | null>(null)
  const [creandoIns, setCreandoIns] = useState<{ nombre: string; filaKey: number; insKey: number } | null>(null)
  const emitRef = useRef(onChange)
  useEffect(() => {
    emitRef.current = onChange
  })

  const { data: tratamientos } = useSWR<TratamientoOpcion[]>('/tratamientos', fetcher, {
    revalidateOnFocus: false,
  })
  const { data: insumos } = useSWR<InsumoOpcion[]>('/insumos?scope=todas', fetcher, {
    revalidateOnFocus: false,
  })

  const opcionesTrat = useMemo<SelectAutocompleteOption[]>(() => {
    const ex = (tratamientos ?? []).map((t) => ({ value: t.id, label: t.nombre }))
    const nu = nuevosTrat.map((n) => ({ value: n.tempId, label: n.vals.nombre }))
    return [...ex, ...nu]
  }, [tratamientos, nuevosTrat])

  const opcionesIns = useMemo<SelectAutocompleteOption[]>(() => {
    const ex = (insumos ?? [])
      .filter((i) => i.categoria?.nombre.toLowerCase() === CATEGORIA_VETERINARIA)
      .map((i) => ({ value: i.id, label: i.nombre }))
    const nu = nuevosIns.map((n) => ({ value: n.tempId, label: n.vals.nombre }))
    return [...ex, ...nu]
  }, [insumos, nuevosIns])

  const refTrat = (id: number) => (tratamientos ?? []).find((t) => t.id === id)?.precioReferencia
  const refIns = (id: number) => (insumos ?? []).find((i) => i.id === id)?.precioReferencia

  // Emite el payload resuelto (valores completos para los temporales).
  useEffect(() => {
    const payload: TratamientoPayload[] = filas.map((f) => {
      const vT = Number(f.selTratamiento)
      const tNuevo =
        f.selTratamiento !== '' && vT < 0
          ? nuevosTrat.find((n) => n.tempId === vT)?.vals
          : undefined
      return {
        ...(f.idRegistro != null ? { idRegistro: f.idRegistro } : {}),
        ...(f.selTratamiento === ''
          ? {}
          : tNuevo
            ? {
                nombreTratamiento: tNuevo.nombre,
                ...(tNuevo.descripcion ? { descripcion: tNuevo.descripcion } : {}),
                ...(tNuevo.precioReferencia != null ? { precioReferencia: tNuevo.precioReferencia } : {}),
              }
            : { idTratamiento: vT }),
        precio: toNum(f.precio),
        insumos: f.insumos.map((ins) => {
          const vI = Number(ins.selInsumo)
          const iNuevo =
            ins.selInsumo !== '' && vI < 0
              ? nuevosIns.find((n) => n.tempId === vI)?.vals
              : undefined
          return {
            ...(ins.idRegistro != null ? { idRegistro: ins.idRegistro } : {}),
            ...(ins.selInsumo === ''
              ? {}
              : iNuevo
                ? {
                    nombreInsumo: iNuevo.nombre,
                    ...(iNuevo.descripcion ? { descripcion: iNuevo.descripcion } : {}),
                    ...(iNuevo.precioReferencia != null ? { precioReferencia: iNuevo.precioReferencia } : {}),
                    ...(iNuevo.unidad ? { unidad: iNuevo.unidad } : {}),
                    ...(iNuevo.idCategoria != null ? { idCategoria: iNuevo.idCategoria } : {}),
                  }
                : { idInsumo: vI }),
            precio: toNum(ins.precio),
          }
        }),
      }
    })
    emitRef.current(payload)
  }, [filas, nuevosTrat, nuevosIns])

  const setFila = (key: number, patch: Partial<FilaTratamiento>) =>
    setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)))

  const setIns = (key: number, insKey: number, patch: Partial<FilaInsumo>) =>
    setFilas((fs) =>
      fs.map((f) =>
        f.key === key
          ? { ...f, insumos: f.insumos.map((i) => (i.key === insKey ? { ...i, ...patch } : i)) }
          : f,
      ),
    )

  const agregarTratamiento = () => {
    const key = sigue
    setSigue((s) => s + 1)
    setFilas((fs) => [...fs, bloqueVacio(key)])
  }

  const quitarTratamiento = (key: number) =>
    setFilas((fs) => fs.filter((f) => f.key !== key))

  const agregarInsumo = (key: number) => {
    const insKey = sigueIns
    setSigueIns((s) => s + 1)
    setFilas((fs) =>
      fs.map((f) =>
        f.key === key ? { ...f, insumos: [...f.insumos, { key: insKey, selInsumo: '', precio: '' }] } : f,
      ),
    )
  }

  const quitarInsumo = (key: number, insKey: number) =>
    setFilas((fs) =>
      fs.map((f) => (f.key === key ? { ...f, insumos: f.insumos.filter((i) => i.key !== insKey) } : f)),
    )

  // Crear on-the-fly: si lo tipeado ya existe se selecciona; si no, se abre
  // el modal (los valores quedan como temporal con todo lo cargado).
  const crearTrat = (txt: string, filaKey: number): Promise<string | number> => {
    const limpio = txt.trim().replace(/\s+/g, ' ')
    const existente = opcionesTrat.find((o) => o.label.toLowerCase() === limpio.toLowerCase())
    if (existente) return Promise.resolve(Number(existente.value))
    setCreandoTrat({ nombre: limpio, filaKey })
    return Promise.resolve('')
  }

  const crearIns = (txt: string, filaKey: number, insKey: number): Promise<string | number> => {
    const limpio = txt.trim().replace(/\s+/g, ' ')
    const existente = opcionesIns.find((o) => o.label.toLowerCase() === limpio.toLowerCase())
    if (existente) return Promise.resolve(Number(existente.value))
    setCreandoIns({ nombre: limpio, filaKey, insKey })
    return Promise.resolve('')
  }

  const guardarTratModal = async (vals: TratamientoFormValues) => {
    if (!creandoTrat) return
    const { filaKey } = creandoTrat
    const tempId = -Date.now()
    // Mapa y selección en el mismo bloque: sin cadena async intermedia.
    setNuevosTrat((prev) => [...prev, { tempId, vals }])
    const fila = filas.find((f) => f.key === filaKey)
    setFila(filaKey, {
      selTratamiento: tempId,
      ...(!fila?.precio && vals.precioReferencia != null
        ? { precio: String(vals.precioReferencia) }
        : {}),
    })
    setCreandoTrat(null)
  }

  const guardarInsModal = async (vals: InsumoFormValues) => {
    if (!creandoIns) return
    const { filaKey, insKey } = creandoIns
    const tempId = -Date.now() - 1
    setNuevosIns((prev) => [...prev, { tempId, vals }])
    const fila = filas.find((f) => f.key === filaKey)
    const ins = fila?.insumos.find((i) => i.key === insKey)
    setIns(filaKey, insKey, {
      selInsumo: tempId,
      ...(!ins?.precio && vals.precioReferencia != null
        ? { precio: String(vals.precioReferencia) }
        : {}),
    })
    setCreandoIns(null)
  }

  return (
    <div className="space-y-3">
      {filas.map((f, idx) => {
        const usadosOtras = new Set(
          filas.filter((o) => o.key !== f.key && o.selTratamiento !== '').map((o) => Number(o.selTratamiento)),
        )
        const optsTrat = opcionesTrat.filter((o) => !usadosOtras.has(Number(o.value)))
        return (
          <div key={f.key} className="border border-border rounded-md p-3 space-y-2.5 bg-background/60">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tratamiento {filas.length > 1 ? idx + 1 : ''}
              </span>
              <button
                onClick={() => quitarTratamiento(f.key)}
                title="Quitar tratamiento"
                className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors cursor-pointer"
              >
                <Trash2 className="size-3.5" strokeWidth={2} />
              </button>
            </div>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <SelectAutocomplete
                  placeholder="Tratamiento (ej: Antibiótico)..."
                  value={f.selTratamiento}
                  onChange={(v) => {
                    const patch: Partial<FilaTratamiento> = { selTratamiento: v }
                    const num = Number(v)
                    if (v !== '' && num > 0 && !f.precio) {
                      const ref = refTrat(num)
                      if (ref != null && ref !== '') patch.precio = fmtRef(ref)
                    }
                    setFila(f.key, patch)
                  }}
                  options={optsTrat}
                  allowCreate
                  onCreate={(txt) => crearTrat(txt, f.key)}
                  renderTag={(o) => {
                    const val = Number(o.value)
                    if (val < 0) {
                      return (
                        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-info bg-info-soft rounded-full px-1.5 py-0.5">
                          Nuevo
                        </span>
                      )
                    }
                    const item = (tratamientos ?? []).find((c) => c.id === val)
                    return item && item.idEmpresa == null ? (
                      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                        Global
                      </span>
                    ) : null
                  }}
                  emptyMessage="No encontrado. Escribí para agregar."
                />
              </div>
              <NumeroInput
                min={0}
                step="0.01"
                value={f.precio}
                onChange={(v) => setFila(f.key, { precio: v })}
                className={`${inputCls} w-28 shrink-0`}
                placeholder="Precio"
                title="Precio del tratamiento (default: referencia)"
              />
            </div>
            <div className="space-y-2 pl-1">
              {f.insumos.map((ins) => (
                <div key={ins.key} className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <SelectAutocomplete
                      placeholder="Insumo (ej: Oxitetraciclina)..."
                      value={ins.selInsumo}
                      onChange={(v) => {
                        const patch: Partial<FilaInsumo> = { selInsumo: v }
                        const num = Number(v)
                        if (v !== '' && num > 0 && !ins.precio) {
                          const ref = refIns(num)
                          if (ref != null && ref !== '') patch.precio = fmtRef(ref)
                        }
                        setIns(f.key, ins.key, patch)
                      }}
                      options={opcionesIns}
                      allowCreate
                      onCreate={(txt) => crearIns(txt, f.key, ins.key)}
                      renderTag={(o) => {
                        const val = Number(o.value)
                        if (val < 0) {
                          return (
                            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-info bg-info-soft rounded-full px-1.5 py-0.5">
                              Nuevo
                            </span>
                          )
                        }
                        const item = (insumos ?? []).find((c) => c.id === val)
                        return item && item.idEmpresa == null ? (
                          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                            Global
                          </span>
                        ) : null
                      }}
                      emptyMessage="No encontrado. Escribí para agregar."
                    />
                  </div>
                  <NumeroInput
                    min={0}
                    step="0.01"
                    value={ins.precio}
                    onChange={(v) => setIns(f.key, ins.key, { precio: v })}
                    className={`${inputCls} w-28 shrink-0`}
                    placeholder="Precio"
                    title="Precio del insumo (default: referencia)"
                  />
                  <button
                    onClick={() => quitarInsumo(f.key, ins.key)}
                    title="Quitar insumo"
                    className="p-2 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors shrink-0 cursor-pointer"
                  >
                    <Trash2 className="size-4" strokeWidth={2} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => agregarInsumo(f.key)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors cursor-pointer"
              >
                <Plus className="size-3.5" strokeWidth={2} /> Agregar insumo
              </button>
            </div>
          </div>
        )
      })}
      <button
        onClick={agregarTratamiento}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors cursor-pointer"
      >
        <Plus className="size-3.5" strokeWidth={2} /> Agregar tratamiento
      </button>

      {creandoTrat && (
        <TratamientoModal
          nombreInicial={creandoTrat.nombre}
          empresas={[]}
          puedeElegirAlcance={false}
          alcanceFijo={{ tipo: 'empresa' }}
          onClose={() => setCreandoTrat(null)}
          onOk={guardarTratModal}
        />
      )}

      {creandoIns && (
        <InsumoModal
          nombreInicial={creandoIns.nombre}
          categoriaFija={CATEGORIA_VETERINARIA_FIJA}
          alcanceFijo={{ tipo: 'empresa' }}
          categorias={[]}
          empresas={[]}
          puedeElegirAlcance={false}
          onClose={() => setCreandoIns(null)}
          onOk={guardarInsModal}
        />
      )}
    </div>
  )
}

export function EstadoCargandoTratamientos() {
  return (
    <div className="flex items-center justify-center p-6">
      <Loader2 className="size-5 text-primary animate-spin" strokeWidth={1.75} />
    </div>
  )
}
