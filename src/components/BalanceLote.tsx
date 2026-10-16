import { Fragment, useMemo, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Calculator, ChevronDown, Loader2, Plus, Receipt } from 'lucide-react'
import { fetcher } from '../lib/api'
import { revalidarBalances } from '../lib/balance'
import { useAuth } from '../contexts/auth-context'
import { DetallePopover } from './DetallePopover'
import { LiquidacionModal } from './LiquidacionModal'
import { CostoAplicadoModal } from './CostoAplicadoModal'

const fmtFecha = (f: string): string => {
  if (!f) return '—'
  const d = new Date(f.length === 10 ? f + 'T00:00:00' : f)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR')
}

const hhmm = (h?: string | null): string => (h ? h.slice(0, 5) : '—')

const fmtMoney = (n: number | null | undefined): string => {
  if (n == null || isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

interface BalanceAlimentacion {
  id: number
  fecha: string
  hora: string
  dietaNombre: string
  dietaVersion: number
  cantidadKg: number
  nAnimales: number
  costo: number
  liquidada: boolean
}

interface BalanceTratamiento {
  kind: 'animal' | 'lote'
  id: number
  fecha: string
  hora: string
  nombres: string[]
  caravana?: string | null
  nAnimales?: number
  animales?: { id: number; caravana: string | null }[]
  precioBase: number | null
  insumos: InsumoLinea[]
  aplicados?: AplicadoDetalle[]
  costo: number
  liquidada: boolean
}

interface BalanceCosto {
  id: number
  fecha: string
  costoNombre: string
  descripcion: string
  monto: number
  liquidada: boolean
}

interface BalanceView {
  alimentaciones: BalanceAlimentacion[]
  tratamientos: BalanceTratamiento[]
  costos: BalanceCosto[]
  totales: { total: number; liquidado: number; pendiente: number }
}

interface BalanceResumido {
  alimentacion: { liquidado: number; pendiente: number }
  tratamientos: { liquidado: number; pendiente: number }
  costos: { liquidado: number; pendiente: number }
  totales: { total: number; liquidado: number; pendiente: number }
}

function EstadoBadge({ liquidada }: { liquidada: boolean }) {
  return (
    <span
      className={`inline-flex text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${liquidada
        ? 'text-success bg-success-soft'
        : 'text-muted-foreground bg-muted'
        }`}
    >
      {liquidada ? 'Liquidada' : 'Pendiente'}
    </span>
  )
}

const thCls =
  'text-left px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'
const tdCls = 'px-2 py-2 text-sm'

function ContenidoCaja({
  titulo,
  liquidado,
  pendiente,
  conDetalle,
}: {
  titulo: string
  liquidado: number
  pendiente: number
  conDetalle: boolean
}) {
  return (
    <span className="block min-w-0">
      <span className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
        {conDetalle && (
          <span className="text-[10px] font-medium normal-case tracking-normal text-primary">
            Ver detalle
          </span>
        )}
      </span>
      <span className="mt-1 block space-y-0.5 tabular-nums">
        <span className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Liquidado</span>
          <span className="text-success font-medium">$ {fmtMoney(liquidado)}</span>
        </span>
        <span className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Pendiente</span>
          <span className="text-foreground font-medium">$ {fmtMoney(pendiente)}</span>
        </span>
      </span>
    </span>
  )
}

const CLASES_CAJA =
  'block w-full text-left border border-border rounded-md px-3 py-2.5 transition-colors cursor-pointer hover:border-primary/60'

const CLASES_CAJA_ESTATICA = 'border border-border rounded-md px-3 py-2.5'

function TablaDetalleAlimentacion({ rows }: { rows: BalanceAlimentacion[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">Sin alimentaciones.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className={thCls}>Fecha / Hora</th>
            <th className={thCls}>Dieta</th>
            <th className={thCls}>Cantidad</th>
            <th className={thCls}>Costo</th>
            <th className={thCls}>Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((a) => (
            <tr key={a.id}>
              <td className={`${tdCls} whitespace-nowrap text-muted-foreground`}>
                {fmtFecha(a.fecha)} · {hhmm(a.hora)}
              </td>
              <td className={tdCls}>
                <span className="text-foreground">
                  {a.dietaNombre} <span className="text-xs text-muted-foreground">(v{a.dietaVersion})</span>
                </span>
              </td>
              <td className={`${tdCls} tabular-nums text-muted-foreground`}>
                {a.cantidadKg} kg · {a.nAnimales} an.
              </td>
              <td className={`${tdCls} tabular-nums text-foreground`}>$ {fmtMoney(a.costo)}</td>
              <td className={tdCls}>
                <EstadoBadge liquidada={a.liquidada} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LineasInsumos({ precioBase, insumos }: { precioBase: number | null; insumos: InsumoLinea[] }) {
  return (
    <div className="space-y-0.5 py-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Tratamiento</span>
        <span className="tabular-nums text-foreground">$ {fmtMoney(precioBase)}</span>
      </div>
      {insumos.map((i, idx) => (
        <div key={i.id ?? idx} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground truncate">+ {i.nombre}</span>
          <span className="tabular-nums text-foreground shrink-0">$ {fmtMoney(i.precio)}</span>
        </div>
      ))}
    </div>
  )
}

function TablaDetalleTratamiento({ rows }: { rows: BalanceTratamiento[] }) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const toggle = (key: string) =>
    setExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">Sin tratamientos.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className={thCls}></th>
            <th className={thCls}>Fecha / Hora</th>
            <th className={thCls}>Tratamiento</th>
            <th className={thCls}>Detalle</th>
            <th className={thCls}>Costo</th>
            <th className={thCls}>Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((t) => {
            const key = `${t.kind}-${t.id}`
            const abierto = expandidos.has(key)
            return (
              <Fragment key={key}>
                <tr>
                  <td className={tdCls}>
                    <button
                      onClick={() => toggle(key)}
                      className="p-0.5 rounded text-muted-foreground hover:bg-accent cursor-pointer"
                      title={abierto ? 'Ocultar insumos' : 'Ver insumos'}
                    >
                      <ChevronDown className={`size-4 transition-transform ${abierto ? '' : '-rotate-90'}`} strokeWidth={2} />
                    </button>
                  </td>
                  <td className={`${tdCls} whitespace-nowrap text-muted-foreground`}>
                    {fmtFecha(t.fecha)} · {hhmm(t.hora)}
                  </td>
                  <td className={tdCls}>
                    <span className="text-foreground">
                      {t.nombres.join(' + ') || 'Tratamiento'}
                      {t.kind === 'lote' && (
                        <span className="ml-1.5 inline-flex text-[9px] font-semibold uppercase tracking-wide text-info bg-info-soft rounded-full px-1.5 py-0.5">
                          Lote
                        </span>
                      )}
                    </span>
                  </td>
                  <td className={tdCls}>
                    {t.kind === 'lote' ? (
                      <span className="text-muted-foreground">{t.nAnimales ?? 0} animales</span>
                    ) : (
                      <span className="text-muted-foreground">
                        Car. {t.caravana ?? '—'} · Individual
                      </span>
                    )}
                  </td>
                  <td className={`${tdCls} tabular-nums text-foreground`}>$ {fmtMoney(t.costo)}</td>
                  <td className={tdCls}>
                    <EstadoBadge liquidada={t.liquidada} />
                  </td>
                </tr>
                {abierto && (
                  <tr>
                    <td />
                    <td colSpan={5} className="px-2 py-1 bg-muted/20">
                      {t.kind === 'lote' ? (
                        <div className="space-y-2 py-1">
                          {(t.aplicados ?? []).map((ap) => (
                            <div key={ap.id} className="border-l-2 border-border pl-2">
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-foreground truncate">
                                  {ap.nombre}
                                  {ap.caravana && (
                                    <span className="ml-1.5 text-muted-foreground">Car. {ap.caravana}</span>
                                  )}
                                </span>
                                <span className="tabular-nums text-foreground shrink-0">$ {fmtMoney(ap.costo)}</span>
                              </div>
                              <LineasInsumos precioBase={ap.precioBase} insumos={ap.insumos} />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <LineasInsumos precioBase={t.precioBase} insumos={t.insumos} />
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TablaDetalleCostos({
  rows,
  puedeImputar,
  onAgregar,
}: {
  rows: BalanceCosto[]
  puedeImputar: boolean
  onAgregar: () => void
}) {
  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin costos varios.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className={thCls}>Fecha</th>
                <th className={thCls}>Costo</th>
                <th className={thCls}>Monto</th>
                <th className={thCls}>Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className={`${tdCls} whitespace-nowrap text-muted-foreground`}>
                    {fmtFecha(c.fecha)}
                  </td>
                  <td className={tdCls}>
                    <span className="text-foreground">{c.descripcion}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">{c.costoNombre}</span>
                  </td>
                  <td className={`${tdCls} tabular-nums text-foreground`}>$ {fmtMoney(c.monto)}</td>
                  <td className={tdCls}>
                    <EstadoBadge liquidada={c.liquidada} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {puedeImputar && (
        <div className="flex justify-end">
          <button
            onClick={onAgregar}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors cursor-pointer"
          >
            <Plus className="size-3.5" strokeWidth={2} /> Agregar costo
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Balance económico del lote (colapsado por defecto): siempre la disposición
 * resumida (subtotales por rubro + totales). Con lectura:balance-lote, cada
 * rubro es clickeable y abre el detalle en un popover grande. Con
 * escritura:liquidacion hay botón para ingresar una liquidación; con
 * escritura:balance-lote se pueden imputar costos varios.
 */
export function BalanceLote({ loteId }: { loteId: number }) {
  const { permisos } = useAuth()
  // lectura:balance-lote se impone a base: con ambos se ve el detalle.
  const completo = permisos.includes('lectura:balance-lote')
  const puedeVer = completo || permisos.includes('lectura:balance-lote-base')
  const puedeLiquidar = permisos.includes('escritura:liquidacion')
  const puedeImputarCosto = permisos.includes('escritura:balance-lote')
  const [abierto, setAbierto] = useState(false)
  const [liquidando, setLiquidando] = useState(false)
  const [imputandoCosto, setImputandoCosto] = useState(false)
  const { mutate: mutateGlobal } = useSWRConfig()

  const balanceKey = puedeVer && abierto ? `/lotes/${loteId}/balance` : null
  const { data: balance, isLoading } = useSWR<BalanceView | BalanceResumido>(
    balanceKey,
    fetcher,
    { revalidateOnFocus: false },
  )

  const vista = useMemo(() => {
    if (!balance) return null
    if ('alimentaciones' in balance) {
      const al = balance.alimentaciones
      const tr = balance.tratamientos
      const co = balance.costos ?? []
      const suma = (xs: { liquidada: boolean; costo: number }[], liq: boolean) =>
        xs.filter((x) => (x.liquidada ?? false) === liq).reduce((acc, x) => acc + x.costo, 0)
      const sumaMonto = (xs: { liquidada: boolean; monto: number }[], liq: boolean) =>
        xs.filter((x) => (x.liquidada ?? false) === liq).reduce((acc, x) => acc + x.monto, 0)
      return {
        alimentacion: { liquidado: suma(al, true), pendiente: suma(al, false) },
        tratamientos: { liquidado: suma(tr, true), pendiente: suma(tr, false) },
        costos: { liquidado: sumaMonto(co, true), pendiente: sumaMonto(co, false) },
        totales: balance.totales,
        detalle: { alimentaciones: al, tratamientos: tr, costos: co },
      }
    }
    return {
      alimentacion: balance.alimentacion,
      tratamientos: balance.tratamientos,
      costos: balance.costos,
      totales: balance.totales,
      detalle: null,
    }
  }, [balance])

  if (!puedeVer) return null

  const recargar = async () => {
    await revalidarBalances(mutateGlobal, loteId)
  }

  const cajaAlimentacion = vista && (
    <ContenidoCaja
      titulo="Alimentación"
      liquidado={vista.alimentacion.liquidado}
      pendiente={vista.alimentacion.pendiente}
      conDetalle={completo}
    />
  )
  const cajaTratamientos = vista && (
    <ContenidoCaja
      titulo="Tratamientos"
      liquidado={vista.tratamientos.liquidado}
      pendiente={vista.tratamientos.pendiente}
      conDetalle={completo}
    />
  )
  const cajaCostos = vista && (
    <ContenidoCaja
      titulo="Costos varios"
      liquidado={vista.costos.liquidado}
      pendiente={vista.costos.pendiente}
      conDetalle={completo}
    />
  )

  return (
    <section className="bg-card border border-border rounded-lg p-5 space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          title={abierto ? 'Colapsar balance' : 'Expandir balance'}
          className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left cursor-pointer group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-9 rounded-md bg-primary-soft text-primary flex items-center justify-center shrink-0">
              <Calculator className="size-5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                Balance económico
                <ChevronDown
                  className={`size-4 text-muted-foreground transition-transform group-hover:text-foreground shrink-0 ${abierto ? '' : '-rotate-90'}`}
                  strokeWidth={2}
                />
              </p>
              <p className="text-xs text-muted-foreground">
                Costos registrados del lote
              </p>
            </div>
          </div>
          {balance && (
            <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
              $ {fmtMoney(balance.totales.pendiente)}
            </span>
          )}
        </button>
        {puedeLiquidar && (
          <button
            onClick={() => setLiquidando(true)}
            title="Ingresar liquidación"
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors cursor-pointer"
          >
            <Receipt className="size-3.5" strokeWidth={2} /> Liquidar
          </button>
        )}
      </div>

      {abierto && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center p-10">
              <Loader2 className="size-6 text-primary animate-spin" strokeWidth={1.75} />
            </div>
          ) : !vista || vista.totales.total === 0 ? (
            <div className="bg-background border border-border rounded-lg p-8 text-center">
              <p className="text-sm text-muted-foreground">Todavía no hay costos registrados en este lote.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                {completo && vista.detalle ? (
                  <>
                    <DetallePopover
                      etiqueta={cajaAlimentacion}
                      titulo="Alimentaciones"
                      ancho={780}
                      classNameBoton={`${CLASES_CAJA} hover:border-primary/60`}
                    >
                      <TablaDetalleAlimentacion rows={vista.detalle.alimentaciones} />
                    </DetallePopover>
                    <DetallePopover
                      etiqueta={cajaTratamientos}
                      titulo="Tratamientos"
                      ancho={780}
                      classNameBoton={`${CLASES_CAJA} hover:border-primary/60`}
                    >
                      <TablaDetalleTratamiento rows={vista.detalle.tratamientos} />
                    </DetallePopover>
                    <DetallePopover
                      etiqueta={cajaCostos}
                      titulo="Costos varios"
                      ancho={640}
                      classNameBoton={`${CLASES_CAJA} hover:border-primary/60`}
                    >
                      <TablaDetalleCostos
                        rows={vista.detalle.costos}
                        puedeImputar={puedeImputarCosto}
                        onAgregar={() => setImputandoCosto(true)}
                      />
                    </DetallePopover>
                  </>
                ) : (
                  <>
                    <div className={CLASES_CAJA_ESTATICA}>{cajaAlimentacion}</div>
                    <div className={CLASES_CAJA_ESTATICA}>{cajaTratamientos}</div>
                    <div className={CLASES_CAJA_ESTATICA}>{cajaCostos}</div>
                  </>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="border border-border rounded-md px-3 py-2.5 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total</p>
                  <p className="text-base font-semibold text-foreground tabular-nums">$ {fmtMoney(vista.totales.total)}</p>
                </div>
                <div className="border border-border rounded-md px-3 py-2.5 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Liquidado</p>
                  <p className="text-base font-semibold text-success tabular-nums">$ {fmtMoney(vista.totales.liquidado)}</p>
                </div>
                <div className="border border-success/40 bg-success-soft/40 rounded-md px-3 py-2.5 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pendiente</p>
                  <p className="text-base font-semibold text-foreground tabular-nums">$ {fmtMoney(vista.totales.pendiente)}</p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {liquidando && (
        <LiquidacionModal
          loteId={loteId}
          onClose={() => setLiquidando(false)}
          onGuardado={recargar}
        />
      )}

      {imputandoCosto && (
        <CostoAplicadoModal
          loteId={loteId}
          onClose={() => setImputandoCosto(false)}
          onGuardado={recargar}
        />
      )}
    </section>
  )
}
