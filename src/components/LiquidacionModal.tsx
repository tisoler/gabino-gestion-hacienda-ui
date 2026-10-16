import { useEffect, useMemo, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { ChevronDown, Loader2, Lock, Plus, X } from 'lucide-react'
import api, { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { NumeroInput } from './NumeroInput'
import SelectAutocomplete from './SelectAutocomplete'
import { CostoModal, type CostoFormValues } from './CostoModal'

const inputCls =
  'px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'
const inputChico =
  'px-2 py-1 bg-background border border-border rounded-md text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

const hoyIso = (): string => {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const fmtFecha = (f: string): string => {
  if (!f) return '—'
  const d = new Date(f.length === 10 ? f + 'T00:00:00' : f)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR')
}

const fmtMoney = (n: number | null | undefined): string => {
  if (n == null || isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const parseNum = (s: string | undefined): number | undefined => {
  if (s == null || !s.trim()) return undefined
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) || n < 0 ? undefined : Math.round(n * 100) / 100
}

interface InsumoLinea {
  id: number | null
  nombre: string
  precio: number | null
}

interface AplicadoDetalle {
  id: number
  caravana: string | null
  nombre: string
  precioBase: number | null
  costo: number
  liquidada: boolean
  insumos: InsumoLinea[]
}

interface TratamientoRow {
  kind: 'animal' | 'lote'
  id: number
  fecha: string
  nombres: string[]
  caravana?: string | null
  nAnimales?: number
  precioBase: number | null
  insumos: InsumoLinea[]
  aplicados?: AplicadoDetalle[]
  costo: number
  liquidada: boolean
}

interface AlimentacionRow {
  id: number
  fecha: string
  dietaNombre: string
  dietaVersion: number
  cantidadKg: number
  costo: number
  liquidada: boolean
}

interface CostoRow {
  id: number
  fecha: string
  costoNombre: string
  descripcion: string
  monto: number
  liquidada: boolean
}

interface BalanceLiq {
  alimentaciones: AlimentacionRow[]
  tratamientos: TratamientoRow[]
  costos: CostoRow[]
}

interface CostoNuevo {
  ref: number | string
  refNombre: string
  fecha: string
  monto: string
}

/**
 * Generar una liquidación: date picker arriba (default hoy) + pendientes con
 * checkbox y PRECIOS EDITABLES (se traen las referencias del momento y se
 * congelan al guardar). Los tratamientos expanden a base + insumos. Los
 * costos pendientes se pueden sumar; además se pueden crear costos inline
 * (nacen liquidados y bloqueados). Preselecciona lo de fecha ≤ elegida.
 */
export function LiquidacionModal({
  loteId,
  onClose,
  onGuardado,
}: {
  loteId: number
  onClose: () => void
  onGuardado: () => Promise<void> | void
}) {
  const [fecha, setFecha] = useState(hoyIso())
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [prevKeys, setPrevKeys] = useState<string | null>(null)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [preciosKg, setPreciosKg] = useState<Record<number, string>>({})
  const [preciosBase, setPreciosBase] = useState<Record<number, string>>({})
  const [preciosIns, setPreciosIns] = useState<Record<number, string>>({})
  const [montosCosto, setMontosCosto] = useState<Record<number, string>>({})
  const [costosNuevos, setCostosNuevos] = useState<CostoNuevo[]>([])
  const [ncCosto, setNcCosto] = useState<string | number>('')
  const [ncFecha, setNcFecha] = useState(hoyIso())
  const [ncMonto, setNcMonto] = useState('')
  const [creandoCosto, setCreandoCosto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const { permisos } = useAuth()
  const puedeCrearCosto = permisos.includes('escritura:costo')
  const { mutate: mutateGlobal } = useSWRConfig()

  const { data: balance, isLoading, isValidating, error: errorCarga, mutate: mutateBalance } = useSWR<BalanceLiq>(
    `/lotes/${loteId}/balance`,
    fetcher,
    { revalidateOnFocus: false },
  )
  // Recarga explícita al abrir: el modal siempre parte de data fresca
  // (no de un eventual caché viejo de la sección de balance).
  useEffect(() => {
    mutateBalance()
  }, [mutateBalance])
  // Catálogo de costos para el alta inline (best-effort: sin lectura:costo
  // se carga por nombre libre y el server lo crea).
  const { data: costosCatalogo } = useSWR<{ id: number; nombre: string; precioReferencia: number | string | null }[]>(
    '/costos',
    fetcher,
    { revalidateOnFocus: false },
  )

  const alimPend = useMemo(
    () => (balance && 'alimentaciones' in balance ? balance.alimentaciones.filter((a) => !a.liquidada) : []),
    [balance],
  )
  // Aplicados pendientes (los de masivas como filas propias con badge Lote).
  const tratPend = useMemo(() => {
    if (!balance || !('tratamientos' in balance)) return []
    const lista: { key: string; grupo: string | null; grupoNombres: string; ap: AplicadoDetalle; fecha: string }[] = []
    for (const t of balance.tratamientos) {
      if (t.liquidada) continue
      if (t.kind === 'lote') {
        for (const ap of t.aplicados ?? []) {
          if (ap.liquidada) continue
          lista.push({
            key: `tratamiento:${ap.id}`,
            grupo: `${t.nombres.join(' + ') || 'Tratamiento'} (${t.nAnimales ?? 0} an.)`,
            grupoNombres: t.nombres.join(' + '),
            ap,
            fecha: t.fecha,
          })
        }
      } else {
        lista.push({
          key: `tratamiento:${t.id}`,
          grupo: null,
          grupoNombres: '',
          ap: {
            id: t.id,
            caravana: t.caravana ?? null,
            nombre: t.nombres.join(' + ') || 'Tratamiento',
            precioBase: t.precioBase,
            costo: t.costo,
            liquidada: false,
            insumos: t.insumos,
          },
          fecha: t.fecha,
        })
      }
    }
    return lista.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
  }, [balance])
  const costosPend = useMemo(
    () => (balance && 'costos' in balance ? balance.costos.filter((c) => !c.liquidada) : []),
    [balance],
  )

  // Prefill de precios editables al cargar el balance (referencias del momento).
  const firma = `${alimPend.map((a) => a.id).join(',')}|${tratPend.map((t) => t.key).join(',')}|${costosPend.map((c) => c.id).join(',')}`
  if (firma !== prevKeys) {
    setPrevKeys(firma)
    const kg: Record<number, string> = {}
    for (const a of alimPend) kg[a.id] = a.cantidadKg > 0 ? String(Math.round((a.costo / a.cantidadKg) * 100) / 100) : ''
    setPreciosKg(kg)
    const base: Record<number, string> = {}
    const ins: Record<number, string> = {}
    for (const t of tratPend) {
      if (t.ap.precioBase != null) base[t.ap.id] = String(t.ap.precioBase)
      for (const i of t.ap.insumos) {
        if (i.id != null && i.precio != null) ins[i.id] = String(i.precio)
      }
    }
    setPreciosBase(base)
    setPreciosIns(ins)
    const montos: Record<number, string> = {}
    for (const c of costosPend) montos[c.id] = String(c.monto)
    setMontosCosto(montos)
    setSeleccion(
      new Set(
        [
          ...alimPend.filter((a) => a.fecha <= fecha).map((a) => `alimentacion:${a.id}`),
          ...tratPend.filter((t) => t.fecha <= fecha).map((t) => t.key),
          ...costosPend.filter((c) => c.fecha <= fecha).map((c) => `costo:${c.id}`),
        ],
      ),
    )
  }

  const elegirFecha = (v: string) => {
    setFecha(v)
    setSeleccion(
      new Set(
        [
          ...alimPend.filter((a) => a.fecha <= v).map((a) => `alimentacion:${a.id}`),
          ...tratPend.filter((t) => t.fecha <= v).map((t) => t.key),
          ...costosPend.filter((c) => c.fecha <= v).map((c) => `costo:${c.id}`),
        ],
      ),
    )
  }

  const toggle = (key: string) =>
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // Check por sección: selecciona/deselecciona todos sus pendientes.
  const toggleTodos = (keys: string[]) =>
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (keys.every((k) => next.has(k))) for (const k of keys) next.delete(k)
      else for (const k of keys) next.add(k)
      return next
    })
  const alimKeys = alimPend.map((a) => `alimentacion:${a.id}`)
  const tratKeys = tratPend.map((t) => t.key)
  const todosAlim = alimKeys.length > 0 && alimKeys.every((k) => seleccion.has(k))
  const todosTrat = tratKeys.length > 0 && tratKeys.every((k) => seleccion.has(k))
  const toggleExpand = (key: string) =>
    setExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // Total seleccionado con los precios editados.
  const totalSel = useMemo(() => {
    let total = 0
    for (const a of alimPend) {
      if (!seleccion.has(`alimentacion:${a.id}`)) continue
      const p = parseNum(preciosKg[a.id]) ?? (a.cantidadKg > 0 ? a.costo / a.cantidadKg : 0)
      total += a.cantidadKg * p
    }
    for (const t of tratPend) {
      if (!seleccion.has(t.key)) continue
      total += parseNum(preciosBase[t.ap.id]) ?? t.ap.precioBase ?? 0
      for (const i of t.ap.insumos) {
        total += i.id != null ? (parseNum(preciosIns[i.id]) ?? i.precio ?? 0) : (i.precio ?? 0)
      }
    }
    for (const c of costosPend) {
      if (!seleccion.has(`costo:${c.id}`)) continue
      total += parseNum(montosCosto[c.id]) ?? c.monto
    }
    for (const n of costosNuevos) total += parseNum(n.monto) ?? 0
    return Math.round(total * 100) / 100
  }, [alimPend, tratPend, costosPend, seleccion, preciosKg, preciosBase, preciosIns, montosCosto, costosNuevos])

  const elegirCostoCatalogo = (v: string | number) => {
    setNcCosto(v)
    if (typeof v === 'number') {
      const cat = (costosCatalogo ?? []).find((c) => c.id === v)
      if (cat && !ncMonto && cat.precioReferencia != null) {
        setNcMonto(String(cat.precioReferencia))
      }
    }
  }

  // Alta on-the-fly (mismo enfoque que insumos/tratamientos): si lo tipeado
  // ya existe se selecciona; si no, se abre el modal de costos. Con
  // escritura:costo se persiste y se selecciona el id; si no, queda local
  // por nombre y el server lo crea al liquidar.
  const crearCosto = (txt: string): Promise<string | number> => {
    const limpio = txt.trim().replace(/\s+/g, ' ')
    const existente = (costosCatalogo ?? []).find(
      (c) => c.nombre.toLowerCase() === limpio.toLowerCase(),
    )
    if (existente) return Promise.resolve(existente.id)
    setCreandoCosto(limpio)
    return Promise.resolve('')
  }

  const guardarCostoModal = async (vals: CostoFormValues) => {
    if (creandoCosto == null) return
    if (puedeCrearCosto) {
      const { data } = await api.post('/costos', vals)
      // Revalidar el catálogo para que el nuevo quede seleccionado y visible.
      await mutateGlobal('/costos')
      setNcCosto(data.id)
      if (!ncMonto && data.precioReferencia != null) setNcMonto(String(data.precioReferencia))
    } else {
      setNcCosto(vals.nombre)
    }
    setCreandoCosto(null)
  }

  const agregarCostoNuevo = () => {
    setError('')
    if (ncCosto === '') {
      setError('Elegí o creá el costo a agregar.')
      return
    }
    const monto = parseNum(ncMonto)
    if (monto == null) {
      setError('El monto del costo debe ser un número mayor o igual a 0.')
      return
    }
    if (!ncFecha) {
      setError('Indicá la fecha del costo.')
      return
    }
    const nombre = typeof ncCosto === 'number'
      ? (costosCatalogo ?? []).find((c) => c.id === ncCosto)?.nombre ?? ''
      : ncCosto
    setCostosNuevos((prev) => [
      ...prev,
      {
        ref: ncCosto,
        refNombre: nombre,
        fecha: ncFecha,
        monto: String(monto),
      },
    ])
    setNcCosto('')
    setNcMonto('')
  }

  const submit = async () => {
    if (seleccion.size === 0 && costosNuevos.length === 0) {
      setError('Seleccioná al menos un ítem a liquidar.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const items: { tipo: string; id: number; precio?: number; insumos?: { id: number; precio: number }[] }[] = []
      for (const a of alimPend) {
        if (!seleccion.has(`alimentacion:${a.id}`)) continue
        const p = parseNum(preciosKg[a.id])
        items.push({ tipo: 'alimentacion', id: a.id, ...(p != null ? { precio: p } : {}) })
      }
      for (const t of tratPend) {
        if (!seleccion.has(t.key)) continue
        const base = parseNum(preciosBase[t.ap.id])
        const insumos: { id: number; precio: number }[] = []
        for (const i of t.ap.insumos) {
          if (i.id == null) continue
          const p = parseNum(preciosIns[i.id]) ?? i.precio ?? undefined
          if (p != null) insumos.push({ id: i.id, precio: p })
        }
        items.push({
          tipo: 'tratamiento',
          id: t.ap.id,
          ...(base != null ? { precio: base } : {}),
          ...(insumos.length > 0 ? { insumos } : {}),
        })
      }
      for (const c of costosPend) {
        if (!seleccion.has(`costo:${c.id}`)) continue
        const m = parseNum(montosCosto[c.id])
        items.push({ tipo: 'costo', id: c.id, ...(m != null ? { precio: m } : {}) })
      }
      await api.post(`/lotes/${loteId}/liquidar`, {
        fecha,
        ...(items.length > 0 ? { items } : {}),
        ...(costosNuevos.length > 0
          ? {
            costosNuevos: costosNuevos.map((n) => ({
              ...(typeof n.ref === 'number' ? { idCosto: n.ref } : { nombre: n.ref }),
              fecha: n.fecha,
              monto: Number(n.monto),
            })),
          }
          : {}),
      })
      await onGuardado()
      onClose()
    } catch (err) {
      console.error(err)
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'No se pudo guardar la liquidación.',
      )
      setBusy(false)
    }
  }

  const hayPendientes = alimPend.length + tratPend.length + costosPend.length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-3xl bg-card border border-border rounded-lg shadow-xl p-6 flex flex-col gap-3 max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-foreground">Liquidar movimientos</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground shrink-0">
          Se preseleccionan los pendientes hasta la fecha elegida. Los precios se traen de
          referencia y se pueden editar: al guardar quedan congelados.
        </p>

        <div className="max-w-[200px] space-y-1.5 shrink-0">
          <label className="text-xs font-medium text-foreground">Liquidar hasta</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => elegirFecha(e.target.value)}
            className={`${inputCls} w-full`}
          />
          {isValidating && !isLoading && (
            <p className="text-[11px] text-muted-foreground">Actualizando balance…</p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto space-y-4 pr-1">
          {errorCarga ? (
            <p role="alert" className="text-sm text-destructive">No se pudo cargar el balance.</p>
          ) : isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="size-6 text-primary animate-spin" strokeWidth={1.75} />
            </div>
          ) : (
            <>
              {!hayPendientes && costosNuevos.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No hay movimientos pendientes de liquidar.
                </p>
              )}
              {alimPend.length > 0 && (
                <section className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Alimentación ({alimPend.length})
                    </p>
                    <label className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={todosAlim}
                        onChange={() => toggleTodos(alimKeys)}
                        className="size-4 accent-primary cursor-pointer"
                      />
                      Todos
                    </label>
                  </div>
                  <div className="border border-border rounded-md divide-y divide-border">
                    {alimPend.map((a) => {
                      const key = `alimentacion:${a.id}`
                      const on = seleccion.has(key)
                      return (
                        <div key={key} className="flex items-center gap-2 px-3 py-1.5 min-h-[36px]">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(key)}
                            className="size-4 accent-primary shrink-0 cursor-pointer"
                          />
                          <span className="flex-1 min-w-0 text-sm text-foreground truncate" title={`Alimentación · ${a.dietaNombre} (v${a.dietaVersion})`}>
                            {a.dietaNombre} (v{a.dietaVersion})
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">{fmtFecha(a.fecha)}</span>
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0">{a.cantidadKg} kg</span>
                          <span className="flex items-center gap-1 shrink-0" title="$/kg (editable, se congela)">
                            <span className="text-xs text-muted-foreground">$</span>
                            <NumeroInput
                              min={0}
                              step="0.01"
                              value={preciosKg[a.id] ?? ''}
                              onChange={(v) => setPreciosKg((s) => ({ ...s, [a.id]: v }))}
                              className={`${inputChico} w-24`}
                              placeholder="$/kg"
                            />
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {tratPend.length > 0 && (
                <section className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Tratamientos ({tratPend.length})
                    </p>
                    <label className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={todosTrat}
                        onChange={() => toggleTodos(tratKeys)}
                        className="size-4 accent-primary cursor-pointer"
                      />
                      Todos
                    </label>
                  </div>
                  <div className="border border-border rounded-md divide-y divide-border">
                    {tratPend.map((t) => {
                      const on = seleccion.has(t.key)
                      const abierto = expandidos.has(t.key)
                      const subtotal =
                        (parseNum(preciosBase[t.ap.id]) ?? t.ap.precioBase ?? 0) +
                        t.ap.insumos.reduce(
                          (acc, i) => acc + (i.id != null ? (parseNum(preciosIns[i.id]) ?? i.precio ?? 0) : (i.precio ?? 0)),
                          0,
                        )
                      return (
                        <div key={t.key}>
                          <div className="flex items-center gap-2 px-3 py-1.5 min-h-[36px]">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggle(t.key)}
                              className="size-4 accent-primary shrink-0 cursor-pointer"
                            />
                            <button
                              onClick={() => toggleExpand(t.key)}
                              className="p-0.5 rounded text-muted-foreground hover:bg-accent shrink-0 cursor-pointer"
                              title={abierto ? 'Ocultar detalle' : 'Ver insumos y editar precios'}
                            >
                              <ChevronDown className={`size-4 transition-transform ${abierto ? '' : '-rotate-90'}`} strokeWidth={2} />
                            </button>
                            <span className="flex-1 min-w-0 text-sm text-foreground truncate" title={t.ap.nombre}>
                              {t.ap.nombre}
                              {t.grupo != null && (
                                <span className="ml-1.5 inline-flex text-[9px] font-semibold uppercase tracking-wide text-info bg-info-soft rounded-full px-1.5 py-0.5">
                                  Lote
                                </span>
                              )}
                              {t.ap.caravana && (
                                <span className="ml-1.5 text-xs text-muted-foreground">Car. {t.ap.caravana}</span>
                              )}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0">{fmtFecha(t.fecha)}</span>
                            <span className="text-sm tabular-nums text-foreground shrink-0">$ {fmtMoney(subtotal)}</span>
                          </div>
                          {abierto && (
                            <div className="px-3 pb-2 pl-12 space-y-1.5 bg-muted/20">
                              <div className="flex items-center gap-2 pt-1.5">
                                <span className="flex-1 text-xs text-muted-foreground">Tratamiento</span>
                                <NumeroInput
                                  min={0}
                                  step="0.01"
                                  value={preciosBase[t.ap.id] ?? ''}
                                  onChange={(v) => setPreciosBase((s) => ({ ...s, [t.ap.id]: v }))}
                                  className={`${inputChico} w-24`}
                                  placeholder="$"
                                />
                              </div>
                              {t.ap.insumos.map((i, idx) => (
                                <div key={i.id ?? idx} className="flex items-center gap-2">
                                  <span className="flex-1 text-xs text-muted-foreground truncate" title={i.nombre}>
                                    + {i.nombre}
                                  </span>
                                  {i.id != null ? (
                                    <NumeroInput
                                      min={0}
                                      step="0.01"
                                      value={preciosIns[i.id] ?? ''}
                                      onChange={(v) => setPreciosIns((s) => ({ ...s, [i.id as number]: v }))}
                                      className={`${inputChico} w-24`}
                                      placeholder="$"
                                    />
                                  ) : (
                                    <span className="text-xs text-foreground tabular-nums w-24 text-right">
                                      $ {fmtMoney(i.precio)}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {costosPend.length > 0 && (
                <section className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Costos varios ({costosPend.length})
                  </p>
                  <div className="border border-border rounded-md divide-y divide-border">
                    {costosPend.map((c) => {
                      const key = `costo:${c.id}`
                      const on = seleccion.has(key)
                      return (
                        <div key={key} className="flex items-center gap-2 px-3 py-1.5 min-h-[36px]">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(key)}
                            className="size-4 accent-primary shrink-0 cursor-pointer"
                          />
                          <span className="flex-1 min-w-0 text-sm text-foreground truncate" title={c.descripcion}>
                            {c.descripcion}
                            <span className="ml-1.5 text-xs text-muted-foreground">{c.costoNombre}</span>
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">{fmtFecha(c.fecha)}</span>
                          <span className="flex items-center gap-1 shrink-0" title="Monto (editable, se congela)">
                            <span className="text-xs text-muted-foreground">$</span>
                            <NumeroInput
                              min={0}
                              step="0.01"
                              value={montosCosto[c.id] ?? ''}
                              onChange={(v) => setMontosCosto((s) => ({ ...s, [c.id]: v }))}
                              className={`${inputChico} w-24`}
                              placeholder="$"
                            />
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              <section className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Agregar costo a esta liquidación
                </p>
                <div className="border border-border rounded-md p-3 space-y-2 bg-muted/20">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {costosCatalogo ? (
                      <SelectAutocomplete
                        label="Costo"
                        placeholder="Buscar o crear costo..."
                        value={ncCosto}
                        onChange={elegirCostoCatalogo}
                        options={(costosCatalogo ?? []).map((c) => ({ value: c.id, label: c.nombre }))}
                        allowCreate
                        onCreate={crearCosto}
                      />
                    ) : (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Costo</label>
                        <input
                          type="text"
                          value={typeof ncCosto === 'string' ? ncCosto : ''}
                          onChange={(e) => elegirCostoCatalogo(e.target.value)}
                          className={`${inputCls} w-full`}
                          placeholder="Nombre del costo..."
                        />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">Fecha</label>
                      <input
                        type="date"
                        value={ncFecha}
                        onChange={(e) => setNcFecha(e.target.value)}
                        className={`${inputCls} w-full`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">Monto *</label>
                      <NumeroInput
                        min={0}
                        step="0.01"
                        value={ncMonto}
                        onChange={setNcMonto}
                        className={`${inputCls} w-full`}
                        placeholder="$"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={agregarCostoNuevo}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors cursor-pointer"
                    >
                      <Plus className="size-3.5" strokeWidth={2} /> Agregar (queda liquidado)
                    </button>
                  </div>
                  {costosNuevos.length > 0 && (
                    <div className="border border-border rounded-md divide-y divide-border bg-card">
                      {costosNuevos.map((n, idx) => (
                        <div key={idx} className="flex items-center gap-2 px-3 py-1.5">
                          <Lock className="size-3.5 text-muted-foreground shrink-0" strokeWidth={2} />
                          <span className="flex-1 min-w-0 text-sm text-foreground truncate" title={n.refNombre}>
                            {n.refNombre}
                          </span>
                          <input
                            type="date"
                            value={n.fecha}
                            onChange={(e) => setCostosNuevos((prev) => prev.map((x, j) => (j === idx ? { ...x, fecha: e.target.value } : x)))}
                            className={`${inputChico} w-32 shrink-0`}
                          />
                          <span className="flex items-center gap-1 shrink-0">
                            <span className="text-xs text-muted-foreground">$</span>
                            <NumeroInput
                              min={0}
                              step="0.01"
                              value={n.monto}
                              onChange={(v) => setCostosNuevos((prev) => prev.map((x, j) => (j === idx ? { ...x, monto: v } : x)))}
                              className={`${inputChico} w-24`}
                              placeholder="$"
                            />
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>

        {creandoCosto != null && (
          <CostoModal
            nombreInicial={creandoCosto}
            empresas={[]}
            puedeElegirAlcance={false}
            alcanceFijo={{ tipo: 'empresa' }}
            onClose={() => setCreandoCosto(null)}
            onOk={guardarCostoModal}
          />
        )}

        {error && <p role="alert" className="text-sm text-destructive shrink-0">{error}</p>}

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-border shrink-0">
          <p className="text-sm text-muted-foreground tabular-nums">
            {seleccion.size + costosNuevos.length} ítems ·{' '}
            <span className="text-foreground font-semibold">$ {fmtMoney(totalSel)}</span>
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={submit}
              disabled={busy || (seleccion.size === 0 && costosNuevos.length === 0)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Guardar liquidación
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
