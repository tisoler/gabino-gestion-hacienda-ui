import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import useSWR from 'swr'
import { AlertCircle, Loader2 } from 'lucide-react'
import { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import SelectAutocomplete from '../components/SelectAutocomplete'
import { Table } from '../components/Table'
import { DetallePopover } from '../components/DetallePopover'

const fmtFecha = (f: string): string => {
  if (!f) return '—'
  const d = new Date(f.length === 10 ? f + 'T00:00:00' : f)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR')
}

const fmtMoney = (n: number | null | undefined): string => {
  if (n == null || isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface LiquidacionRow {
  id: number
  fecha: string
  idLote: number
  loteNombre: string
  idCliente: string | null
  clienteNombre: string | null
  nItems: number
  total: number
}

interface LiquidacionItem {
  id: number
  tipo: string
  concepto: string
  etiqueta: string
  cantidad: number | null
  precio: number | null
  costo: number
}

interface LiquidacionDetalle {
  id: number
  fecha: string
  idLote: number
  loteNombre: string
  total: number
  items: LiquidacionItem[]
}

interface Filtros {
  cliente: string
  lote: string
  desde: string
  hasta: string
}

const TIPO_LABEL: Record<string, string> = {
  alimentacion: 'Alimentación',
  tratamiento: 'Tratamiento',
  costo: 'Costo',
}

function DetalleItems({ id }: { id: number }) {
  const { data, isLoading } = useSWR<LiquidacionDetalle>(
    `/liquidaciones/${id}`,
    fetcher,
    { revalidateOnFocus: false },
  )
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="size-5 text-primary animate-spin" strokeWidth={1.75} />
      </div>
    )
  }
  if (!data || data.items.length === 0) {
    return <p className="text-xs text-muted-foreground">Sin ítems.</p>
  }
  return (
    <div className="divide-y divide-border">
      {data.items.map((it) => (
        <div key={it.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs">
          <span className="min-w-0">
            <span className="block text-foreground truncate" title={it.etiqueta}>
              {it.etiqueta}
            </span>
            <span className="block text-muted-foreground">
              {TIPO_LABEL[it.tipo] ?? it.tipo}
              {it.concepto === 'insumo' ? ' · insumo' : ''}
              {it.cantidad != null ? ` · ${it.cantidad} kg` : ''}
            </span>
          </span>
          <span className="text-foreground tabular-nums shrink-0">$ {fmtMoney(it.costo)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs font-semibold">
        <span className="text-foreground">Total</span>
        <span className="text-foreground tabular-nums">$ {fmtMoney(data.total)}</span>
      </div>
    </div>
  )
}

export default function Liquidaciones() {
  const { permisos } = useAuth()
  const puedeVer = permisos.includes('lectura:liquidacion')
  const puedeFiltrarCliente = permisos.includes('lectura:cliente')
  const puedeFiltrarLote = permisos.includes('lectura:lote')
  const [params] = useSearchParams()
  const [filtros, setFiltros] = useState<Filtros>({
    cliente: '',
    lote: params.get('lote') ?? '',
    desde: '',
    hasta: '',
  })
  const [pagina, setPagina] = useState(0)

  const set = (patch: Partial<Filtros>) => {
    setFiltros((f) => ({ ...f, ...patch }))
    setPagina(0)
  }

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (filtros.cliente) p.set('idCliente', filtros.cliente)
    if (filtros.lote) p.set('idLote', filtros.lote)
    if (filtros.desde) p.set('fechaDesde', filtros.desde)
    if (filtros.hasta) p.set('fechaHasta', filtros.hasta)
    p.set('page', String(pagina + 1))
    p.set('pageSize', '20')
    return p.toString()
  }, [filtros, pagina])

  const listKey = puedeVer ? `/liquidaciones?${qs}` : null
  const { data: resp, isLoading } = useSWR<{ data: LiquidacionRow[]; total: number }>(
    listKey,
    fetcher,
    { revalidateOnFocus: false },
  )
  const filas = resp?.data ?? []
  const total = resp?.total ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / 20))
  const paginaSegura = Math.min(pagina, totalPaginas - 1)

  // Opciones de filtros (sólo si tiene los permisos de esas vistas).
  const { data: lotes } = useSWR<{ id: number; nombre: string }[]>(
    puedeVer && puedeFiltrarLote ? '/lotes' : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: clientes } = useSWR<{ uid: string; nombreUsuario: string | null }[]>(
    puedeVer && puedeFiltrarCliente ? '/clientes' : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const tieneFiltros = !!(filtros.cliente || filtros.lote || filtros.desde || filtros.hasta)

  if (!puedeVer) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tenés permisos para ver liquidaciones.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Liquidaciones</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Liquidaciones generadas por lote, con precios congelados. Se generan desde el balance del lote.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <section className="bg-card border border-border rounded-lg p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {puedeFiltrarCliente && (
          <SelectAutocomplete
            label="Cliente"
            placeholder="Todos"
            value={filtros.cliente}
            onChange={(v) => set({ cliente: String(v) })}
            options={(clientes ?? []).map((c) => ({ value: c.uid, label: c.nombreUsuario ?? c.uid }))}
            clearable
          />
        )}
        {puedeFiltrarLote && (
          <SelectAutocomplete
            label="Lote"
            placeholder="Todos"
            value={filtros.lote}
            onChange={(v) => set({ lote: String(v) })}
            options={(lotes ?? []).map((l) => ({ value: l.id, label: l.nombre }))}
            clearable
          />
        )}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Desde</label>
          <input
            type="date"
            value={filtros.desde}
            onChange={(e) => set({ desde: e.target.value })}
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Hasta</label>
          <input
            type="date"
            value={filtros.hasta}
            onChange={(e) => set({ hasta: e.target.value })}
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </section>

      {tieneFiltros && (
        <div>
          <button
            onClick={() => set({ cliente: '', lote: '', desde: '', hasta: '' })}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center p-20">
          <Loader2 className="size-8 text-primary animate-spin" strokeWidth={1.75} />
        </div>
      ) : (
        <>
          <Table<LiquidacionRow>
            data={filas}
            emptyMessage="Todavía no hay liquidaciones."
            columns={[
              {
                header: 'Fecha',
                accessor: (l) => (
                  <span className="text-muted-foreground whitespace-nowrap">{fmtFecha(l.fecha)}</span>
                ),
              },
              {
                header: 'Lote',
                accessor: (l) => <span className="font-medium text-foreground">{l.loteNombre}</span>,
              },
              {
                header: 'Cliente',
                accessor: (l) => (
                  <span className="text-muted-foreground">{l.clienteNombre ?? '—'}</span>
                ),
              },
              {
                header: 'Ítems',
                accessor: (l) => (
                  <DetallePopover
                    etiqueta={`${l.nItems} ítems`}
                    titulo={`Liquidación #${l.id} · ${l.loteNombre}`}
                    ancho={420}
                  >
                    <DetalleItems id={l.id} />
                  </DetallePopover>
                ),
              },
              {
                header: 'Total',
                accessor: (l) => (
                  <span className="text-sm font-semibold text-foreground tabular-nums">
                    $ {fmtMoney(l.total)}
                  </span>
                ),
              },
            ]}
          />
          {totalPaginas > 1 && (
            <div className="flex items-center justify-center gap-3 pt-1">
              <button
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
                disabled={paginaSegura === 0}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                ← Anterior
              </button>
              <span className="text-xs text-muted-foreground tabular-nums">
                Página {paginaSegura + 1} de {totalPaginas} · {total} registros
              </span>
              <button
                onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
                disabled={paginaSegura >= totalPaginas - 1}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
