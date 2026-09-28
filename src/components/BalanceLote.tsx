import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useSWR from 'swr'
import { Calculator, ChevronDown, Loader2 } from 'lucide-react'
import { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { Table } from './Table'

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
  costo: number
  liquidada: boolean
}

interface BalanceView {
  alimentaciones: BalanceAlimentacion[]
  tratamientos: BalanceTratamiento[]
  totales: { total: number; liquidado: number; pendiente: number }
}

type Fila =
  | ({ tipo: 'alimentacion' } & BalanceAlimentacion)
  | ({ tipo: 'tratamiento' } & BalanceTratamiento)

/**
 * Celda "N animales": resumen con popover (portal, fijo) anclado a la celda
 * que lista las caravanas alcanzadas, como "animales que salieron" en Salidas.
 */
function CeldaAnimalesBalance({ animales }: { animales: { id: number; caravana: string | null }[] }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect()
      const ancho = 280
      const left = Math.max(12, Math.min(r.left, window.innerWidth - ancho - 12))
      setPos({ top: r.bottom + 4, left })
    }
    setOpen((v) => !v)
  }

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      if (panelRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    // El scroll DENTRO del panel no lo cierra (para poder scrollear la lista).
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline cursor-pointer"
      >
        {animales.length} animales
        <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: 280, zIndex: 9999 }}
            className="bg-card border border-border rounded-md shadow-lg max-h-72 overflow-y-auto p-1.5"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="divide-y divide-border">
              {animales.map((a) => (
                <div key={a.id} className="px-2 py-1.5 text-xs text-foreground">
                  Car. {a.caravana ?? '—'}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
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

/**
 * Balance económico del lote (colapsado por defecto): costos registrados
 * (alimentaciones a precios de referencia + tratamientos a precios aplicados)
 * y totales (total / liquidado / pendiente). Visible con lectura:balance-lote.
 */
export function BalanceLote({ loteId }: { loteId: number }) {
  const { permisos } = useAuth()
  const puedeVer = permisos.includes('lectura:balance-lote')
  const [abierto, setAbierto] = useState(false)

  const { data: balance, isLoading } = useSWR<BalanceView>(
    puedeVer && abierto ? `/lotes/${loteId}/balance` : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const filas: Fila[] = useMemo(() => {
    if (!balance) return []
    const todas: Fila[] = [
      ...balance.alimentaciones.map((a): Fila => ({ tipo: 'alimentacion', ...a })),
      ...balance.tratamientos.map((t): Fila => ({ tipo: 'tratamiento', ...t })),
    ]
    return todas.sort((a, b) =>
      a.fecha < b.fecha
        ? 1
        : a.fecha > b.fecha
          ? -1
          : a.hora < b.hora
            ? 1
            : a.hora > b.hora
              ? -1
              : b.id - a.id,
    )
  }, [balance])

  if (!puedeVer) return null

  return (
    <section className="bg-card border border-border rounded-lg p-5 space-y-4">
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        title={abierto ? 'Colapsar balance' : 'Expandir balance'}
        className="w-full flex items-center justify-between gap-3 text-left cursor-pointer group"
      >
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-md bg-primary-soft text-primary flex items-center justify-center shrink-0">
            <Calculator className="size-5" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              Balance económico
              <ChevronDown
                className={`size-4 text-muted-foreground transition-transform group-hover:text-foreground ${abierto ? '' : '-rotate-90'}`}
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

      {abierto && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center p-10">
              <Loader2 className="size-6 text-primary animate-spin" strokeWidth={1.75} />
            </div>
          ) : filas.length === 0 ? (
            <div className="bg-background border border-border rounded-lg p-8 text-center">
              <p className="text-sm text-muted-foreground">Todavía no hay costos registrados en este lote.</p>
            </div>
          ) : (
            <>
              <Table<Fila>
                data={filas}
                columns={[
                  {
                    header: 'Fecha / Hora',
                    accessor: (f) => (
                      <span className="text-muted-foreground whitespace-nowrap">
                        {fmtFecha(f.fecha)} · {hhmm(f.hora)}
                      </span>
                    ),
                  },
                  {
                    header: 'Concepto',
                    accessor: (f) =>
                      f.tipo === 'alimentacion' ? (
                        <span className="text-foreground">
                          Alimentación · {f.dietaNombre} <span className="text-xs text-muted-foreground">(v{f.dietaVersion})</span>
                        </span>
                      ) : (
                        <span className="text-foreground">
                          {f.nombres.join(' + ') || 'Tratamiento'}
                          {f.kind === 'lote' && (
                            <span className="ml-1.5 inline-flex text-[9px] font-semibold uppercase tracking-wide text-info bg-info-soft rounded-full px-1.5 py-0.5">
                              Lote
                            </span>
                          )}
                        </span>
                      ),
                  },
                  {
                    header: 'Detalle',
                    accessor: (f) => {
                      if (f.tipo === 'alimentacion') {
                        return (
                          <span className="text-muted-foreground tabular-nums">
                            {f.cantidadKg} kg · {f.nAnimales} an.
                          </span>
                        )
                      }
                      if (f.kind === 'lote') {
                        return <CeldaAnimalesBalance animales={f.animales ?? []} />
                      }
                      return (
                        <span className="text-muted-foreground">
                          Car. {f.caravana ?? '—'} · Individual
                        </span>
                      )
                    },
                  },
                  {
                    header: 'Costo',
                    accessor: (f) => (
                      <span className="text-foreground tabular-nums">$ {fmtMoney(f.costo)}</span>
                    ),
                  },
                  {
                    header: 'Estado',
                    accessor: (f) => <EstadoBadge liquidada={f.liquidada} />,
                  },
                ]}
              />
              {balance && (
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="border border-border rounded-md px-3 py-2.5 text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total</p>
                    <p className="text-base font-semibold text-foreground tabular-nums">$ {fmtMoney(balance.totales.total)}</p>
                  </div>
                  <div className="border border-border rounded-md px-3 py-2.5 text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Liquidado</p>
                    <p className="text-base font-semibold text-success tabular-nums">$ {fmtMoney(balance.totales.liquidado)}</p>
                  </div>
                  <div className="border border-success/40 bg-success-soft/40 rounded-md px-3 py-2.5 text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pendiente</p>
                    <p className="text-base font-semibold text-foreground tabular-nums">$ {fmtMoney(balance.totales.pendiente)}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
