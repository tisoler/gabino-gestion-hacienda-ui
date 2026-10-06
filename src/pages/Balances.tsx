import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useSWR from 'swr'
import { AlertCircle, ChevronDown, Loader2, Scale } from 'lucide-react'
import { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { Table } from '../components/Table'

const fmtMoney = (n: number | null | undefined): string => {
  if (n == null || isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface BalanceLoteResumen {
  idLote: number
  loteNombre: string
  idEmpresa: number
  nombreEmpresa: string | null
  idCliente: string | null
  clienteNombre: string | null
  nAnimales: number
  total: number
  liquidado: number
  pendiente: number
  desglose?: {
    alimentacion: { liquidado: number; pendiente: number }
    tratamientos: { liquidado: number; pendiente: number }
  }
}

/**
 * Balances por cliente: una sección colapsable por titular con su tabla de
 * lotes (totales) + resumen general. Visible con lectura:balance-lote; los
 * lotes se filtran por empresa/aislamiento de cliente en el server.
 */
export default function Balances() {
  const navigate = useNavigate()
  const { permisos, isCliente } = useAuth()
  // lectura:balance-lote se impone a base: con ambos se ve el detalle.
  const completo = permisos.includes('lectura:balance-lote')
  const puedeVer = completo || permisos.includes('lectura:balance-lote-base')

  const { data: resumen, isLoading } = useSWR<BalanceLoteResumen[]>(
    puedeVer ? '/lotes/balances' : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const [colapsados, setColapsados] = useState<Record<string, boolean>>({})

  const grupos = useMemo(() => {
    // El cliente es siempre él mismo: agrupa por empresa anfitriona (puede
    // tener lotes en varias). El resto agrupa por cliente (titular del lote).
    const map = new Map<string, { key: string; nombre: string; lotes: BalanceLoteResumen[] }>()
    for (const r of resumen ?? []) {
      const esEmpresa = isCliente
      const key = esEmpresa ? String(r.idEmpresa) : (r.idCliente ?? '__sin__')
      const nombre = esEmpresa
        ? (r.nombreEmpresa ?? `Empresa ${r.idEmpresa}`)
        : (r.clienteNombre ?? 'Sin cliente')
      const g = map.get(key) ?? { key, nombre, lotes: [] }
      g.lotes.push(r)
      map.set(key, g)
    }
    return [...map.values()]
      .map((g) => ({
        ...g,
        lotes: [...g.lotes].sort((a, b) => a.loteNombre.localeCompare(b.loteNombre, 'es')),
        total: g.lotes.reduce((acc, l) => acc + l.total, 0),
        liquidado: g.lotes.reduce((acc, l) => acc + l.liquidado, 0),
        pendiente: g.lotes.reduce((acc, l) => acc + l.pendiente, 0),
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [resumen, isCliente])

  const totales = useMemo(() => {
    const lista = resumen ?? []
    const total = lista.reduce((acc, l) => acc + l.total, 0)
    const liquidado = lista.reduce((acc, l) => acc + l.liquidado, 0)
    return { total, liquidado, pendiente: total - liquidado }
  }, [resumen])

  if (!puedeVer) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tenés permisos para ver esta sección.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Balances</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Costos por lote, agrupados por cliente.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-20">
          <Loader2 className="size-8 text-primary animate-spin" strokeWidth={1.75} />
        </div>
      ) : grupos.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-sm text-muted-foreground">Todavía no hay lotes con movimientos para balancear.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="border border-border rounded-md px-3 py-2.5 text-center bg-card">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="text-base font-semibold text-foreground tabular-nums">$ {fmtMoney(totales.total)}</p>
            </div>
            <div className="border border-border rounded-md px-3 py-2.5 text-center bg-card">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Liquidado</p>
              <p className="text-base font-semibold text-success tabular-nums">$ {fmtMoney(totales.liquidado)}</p>
            </div>
            <div className="border border-success/40 bg-success-soft/40 rounded-md px-3 py-2.5 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pendiente</p>
              <p className="text-base font-semibold text-foreground tabular-nums">$ {fmtMoney(totales.pendiente)}</p>
            </div>
          </div>

          {grupos.map((g) => {
            const colapsado = colapsados[g.key] ?? false
            return (
              <section key={g.key} className="bg-card border border-border rounded-lg p-5 space-y-4">
                <button
                  onClick={() => setColapsados((s) => ({ ...s, [g.key]: !s[g.key] }))}
                  aria-expanded={!colapsado}
                  className="w-full flex items-center justify-between gap-3 text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-9 rounded-md bg-primary-soft text-primary flex items-center justify-center shrink-0">
                      <Scale className="size-5" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                        {g.nombre}
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform group-hover:text-foreground shrink-0 ${colapsado ? '-rotate-90' : ''}`}
                          strokeWidth={2}
                        />
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {g.lotes.length} {g.lotes.length === 1 ? 'lote' : 'lotes'} · Pendiente ${fmtMoney(g.pendiente)}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-foreground tabular-nums shrink-0 hidden sm:block">
                    $ {fmtMoney(g.total)}
                  </span>
                </button>

                {!colapsado && (
                  <Table<BalanceLoteResumen>
                    data={g.lotes}
                    onRowClick={(l) => navigate(`/lotes/${l.idLote}`)}
                    columns={
                      completo
                        ? [
                          {
                            header: 'Lote',
                            accessor: (l) => (
                              <div className="min-w-0">
                                <p className="font-medium text-foreground truncate">{l.loteNombre}</p>
                                <p className="text-xs text-muted-foreground">{l.nAnimales} animales</p>
                              </div>
                            ),
                          },
                          {
                            header: 'Total',
                            accessor: (l) => (
                              <span className="text-foreground tabular-nums">$ {fmtMoney(l.total)}</span>
                            ),
                          },
                          {
                            header: 'Liquidado',
                            accessor: (l) => (
                              <span className="text-muted-foreground tabular-nums">$ {fmtMoney(l.liquidado)}</span>
                            ),
                          },
                          {
                            header: 'Pendiente',
                            accessor: (l) => (
                              <span className="text-foreground tabular-nums font-medium">$ {fmtMoney(l.pendiente)}</span>
                            ),
                          },
                        ]
                        : [
                          {
                            header: 'Lote',
                            accessor: (l) => (
                              <div className="min-w-0">
                                <p className="font-medium text-foreground truncate">{l.loteNombre}</p>
                                <p className="text-xs text-muted-foreground">{l.nAnimales} animales</p>
                              </div>
                            ),
                          },
                          {
                            header: 'Alim. liq.',
                            accessor: (l) => (
                              <span className="text-muted-foreground tabular-nums">$ {fmtMoney(l.desglose?.alimentacion.liquidado)}</span>
                            ),
                          },
                          {
                            header: 'Alim. pend.',
                            accessor: (l) => (
                              <span className="text-foreground tabular-nums">$ {fmtMoney(l.desglose?.alimentacion.pendiente)}</span>
                            ),
                          },
                          {
                            header: 'Trat. liq.',
                            accessor: (l) => (
                              <span className="text-muted-foreground tabular-nums">$ {fmtMoney(l.desglose?.tratamientos.liquidado)}</span>
                            ),
                          },
                          {
                            header: 'Trat. pend.',
                            accessor: (l) => (
                              <span className="text-foreground tabular-nums">$ {fmtMoney(l.desglose?.tratamientos.pendiente)}</span>
                            ),
                          },
                        ]
                    }
                  />
                )}
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
