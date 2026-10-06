import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import useSWR from 'swr'
import { AlertCircle, Loader2, Lock, Pencil, Trash2, Utensils } from 'lucide-react'
import api, { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import SelectAutocomplete from '../components/SelectAutocomplete'
import { Table } from '../components/Table'
import { DetallePopover } from '../components/DetallePopover'
import { AlimentarModal } from '../components/AlimentarModal'
import type { AlimentacionView } from '../lib/alimentacion'

const fmtKg = (n: number): string => n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
const fmtFecha = (f: string): string => {
  if (!f) return '—'
  const d = new Date(f.length === 10 ? f + 'T00:00:00' : f)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR')
}
const hhmm = (h?: string | null): string => (h ? h.slice(0, 5) : '12:00')

interface Filtros {
  cliente: string
  corral: string
  lote: string
  desde: string
  hasta: string
}

export default function Alimentacion() {
  const { permisos, isSysAdmin } = useAuth()
  const puedeVer = permisos.includes('lectura:alimento')
  const puedeEditar = permisos.includes('escritura:alimento')
  const [params] = useSearchParams()
  const [filtros, setFiltros] = useState<Filtros>({
    cliente: '',
    corral: '',
    lote: params.get('lote') ?? '',
    desde: '',
    hasta: '',
  })

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (filtros.cliente) p.set('idCliente', filtros.cliente)
    if (filtros.corral) p.set('idCorral', filtros.corral)
    if (filtros.lote) p.set('idLote', filtros.lote)
    if (filtros.desde) p.set('fechaDesde', filtros.desde)
    if (filtros.hasta) p.set('fechaHasta', filtros.hasta)
    return p.toString()
  }, [filtros])

  const [pagina, setPagina] = useState(0)
  const [filasPorPagina, setFilasPorPagina] = useState(8)
  const listaRef = useRef<HTMLDivElement>(null)

  const set = (patch: Partial<Filtros>) => {
    setFiltros((f) => ({ ...f, ...patch }))
    setPagina(0)
  }

  const [editando, setEditando] = useState<AlimentacionView | null>(null)
  const [alimentarOpen, setAlimentarOpen] = useState(false)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const listKey = puedeVer
    ? `/alimentaciones?page=${pagina + 1}&pageSize=${filasPorPagina}${qs ? `&${qs}` : ''}`
    : null
  const { data: paginaResp, isLoading, mutate: mutateAlimentaciones } = useSWR<{
    data: AlimentacionView[]
    total: number
  }>(listKey, fetcher, { revalidateOnFocus: false })
  const filas = paginaResp?.data ?? []
  const total = paginaResp?.total ?? 0

  // Opciones encadenadas desde el server (cada lista excluye su propio filtro).
  const { data: opciones } = useSWR<{
    clientes: { id: string; nombre: string }[]
    corrales: { id: number; nombre: string }[]
    lotes: { id: number; nombre: string }[]
  }>(puedeVer ? `/alimentaciones/filtros${qs ? `?${qs}` : ''}` : null, fetcher, {
    revalidateOnFocus: false,
  })
  const opcionesCorrales = (opciones?.corrales ?? []).map((o) => ({ value: o.id, label: o.nombre }))
  const opcionesLotes = (opciones?.lotes ?? []).map((o) => ({ value: o.id, label: o.nombre }))
  const opcionesClientes = (opciones?.clientes ?? []).map((o) => ({ value: o.id, label: o.nombre }))

  const tieneFiltros = !!(filtros.cliente || filtros.corral || filtros.lote || filtros.desde || filtros.hasta)

  // Paginado a la altura de la pantalla (sin scroll vertical): se mide la
  // primera fila visible y se calcula cuántas entran bajo el listado. El
  // pageSize resultante se pide al server (no se trae de más).
  useEffect(() => {
    const calcular = () => {
      const el = listaRef.current
      if (!el) return
      const topDoc = el.getBoundingClientRect().top + window.scrollY
      const altos = Array.from(el.querySelectorAll('tbody tr'))
        .map((tr) => tr.getBoundingClientRect().height)
        .filter((h) => h > 0)
      const altoFila = altos[0] ?? 52
      const reserva = 52 // paginador + márgenes inferiores
      setFilasPorPagina(Math.max(1, Math.floor((window.innerHeight - topDoc - reserva) / altoFila)))
    }
    calcular()
    window.addEventListener('resize', calcular)
    return () => window.removeEventListener('resize', calcular)
  }, [total])

  const totalPaginas = Math.max(1, Math.ceil(total / filasPorPagina))
  const paginaSegura = Math.min(pagina, totalPaginas - 1)

  const handleEliminar = async (a: AlimentacionView) => {
    if (a.liquidada) return
    if (!window.confirm(`¿Eliminar la alimentación del ${fmtFecha(a.fecha)} (${a.corral.nombre})?`)) return
    setEliminandoId(a.id)
    setError('')
    try {
      await api.delete(`/alimentaciones/${a.id}`)
      await mutateAlimentaciones()
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo eliminar la alimentación.'))
    } finally {
      setEliminandoId(null)
    }
  }

  if (!puedeVer) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tenés permisos para ver alimentación.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Alimentación</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Histórico de alimentaciones de corrales (base para el reporte de costo).
          </p>
        </div>
        {puedeEditar && (
          <button
            onClick={() => setAlimentarOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-border hover:bg-accent transition-colors cursor-pointer"
          >
            <Utensils className="size-4" strokeWidth={2} /> Alimentar
          </button>
        )}
      </div>

      {/* Filtros: una sola línea compacta */}
      <section className="bg-card border border-border rounded-lg px-3 py-2.5 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[150px]">
          <SelectAutocomplete
            label="Cliente"
            placeholder="Todos"
            value={filtros.cliente}
            onChange={(v) => set({ cliente: String(v) })}
            options={opcionesClientes}
            clearable
          />
        </div>
        <div className="flex-1 min-w-[150px]">
          <SelectAutocomplete
            label="Corral"
            placeholder="Todos"
            value={filtros.corral}
            onChange={(v) => set({ corral: String(v) })}
            options={opcionesCorrales}
            clearable
          />
        </div>
        <div className="flex-1 min-w-[150px]">
          <SelectAutocomplete
            label="Lote"
            placeholder="Todos"
            value={filtros.lote}
            onChange={(v) => set({ lote: String(v) })}
            options={opcionesLotes}
            clearable
          />
        </div>
        <div className="min-w-[130px] space-y-1">
          <label className="text-xs font-medium text-foreground">Desde</label>
          <input
            type="date"
            value={filtros.desde}
            onChange={(e) => set({ desde: e.target.value })}
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="min-w-[130px] space-y-1">
          <label className="text-xs font-medium text-foreground">Hasta</label>
          <input
            type="date"
            value={filtros.hasta}
            onChange={(e) => set({ hasta: e.target.value })}
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {tieneFiltros && (
          <button
            onClick={() => set({ cliente: '', corral: '', lote: '', desde: '', hasta: '' })}
            className="px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent transition-colors cursor-pointer shrink-0"
          >
            Limpiar
          </button>
        )}
      </section>

      {/* Listado */}
      {error && (
        <div role="alert" className="p-3 bg-destructive-soft border border-destructive/20 text-destructive text-sm rounded-md flex items-center gap-2.5">
          <AlertCircle className="size-4 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      )}
      {isLoading ? (
        <div className="flex items-center justify-center p-20">
          <Loader2 className="size-8 text-primary animate-spin" strokeWidth={1.75} />
        </div>
      ) : total === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {!tieneFiltros ? 'Todavía no hay alimentaciones registradas.' : 'Sin resultados para los filtros seleccionados.'}
          </p>
        </div>
      ) : (
        <div ref={listaRef}>
          {/* Mobile: cards */}
          <div className="sm:hidden space-y-3">
            {filas.map((a) => (
              <div key={a.id} className="premium-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="size-8 rounded-md bg-primary-soft text-primary flex items-center justify-center shrink-0">
                      <Utensils className="size-4" strokeWidth={1.75} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {a.corral.nombre} · {a.dieta.nombre} (v{a.dieta.version})
                      </p>
                      <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-1">
                        <span className="whitespace-nowrap">
                          {fmtFecha(a.fecha)} · {hhmm(a.hora)}
                        </span>
                        <span>· {fmtKg(a.cantidadKg)} kg total · {a.nAnimales} animales</span>
                        {a.nAnimalesEnfermeria > 0 && (
                          <span>+ {a.nAnimalesEnfermeria} en enfermería ·</span>
                        )}
                        <span>{fmtKg(a.cantidadPorAnimal)} kg/animal</span>
                        {a.liquidada && (
                          <span className="inline-flex text-[9px] font-semibold uppercase tracking-wide text-success bg-success-soft rounded-full px-1.5 py-0.5">
                            Liquidada
                          </span>
                        )}
                      </p>
                      {puedeEditar && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <button
                            onClick={() => setEditando(a)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors cursor-pointer"
                          >
                            <Pencil className="size-3.5" strokeWidth={2} /> Editar
                          </button>
                          {!a.liquidada && (
                            <button
                              onClick={() => void handleEliminar(a)}
                              disabled={eliminandoId === a.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-border text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              <Trash2 className="size-3.5" strokeWidth={2} /> Eliminar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {isSysAdmin && a.empresa && (
                    <span className="text-xs text-muted-foreground shrink-0">{a.empresa.nombre}</span>
                  )}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {a.lotes.map((l) => (
                    <div
                      key={l.loteId}
                      className="flex items-center justify-between gap-2 text-sm border border-border rounded-md px-2.5 py-1.5"
                    >
                      <span className="text-foreground truncate">
                        {l.loteNombre}
                        {l.clienteNombre && (
                          <span className="text-xs text-muted-foreground"> · {l.clienteNombre}</span>
                        )}
                      </span>
                      <span className="text-muted-foreground tabular-nums shrink-0">
                        {fmtKg(l.cantidadKg)} kg <span className="text-xs">({l.nAnimales} an.)</span>
                        {l.nAnimalesEnfermeria > 0 && (
                          <span className="text-xs text-primary">
                            {' '}
                            + {fmtKg(l.cantidadEnfermeriaKg)} kg enf. ({l.nAnimalesEnfermeria} an.)
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                  {a.nAnimalesEnfermeria > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Enfermería: {fmtKg(a.cantidadEnfermeriaKg)} kg extra ({a.nAnimalesEnfermeria}{' '}
                      animales) a {fmtKg(a.cantidadPorAnimal)} kg/an. — se suma al total, no se
                      reparte del corral.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: tabla */}
          <div className="hidden sm:block">
            <Table<AlimentacionView>
              data={filas}
              compacto
              columns={[
                {
                  header: 'Fecha / Hora',
                  accessor: (a) => (
                    <span className="text-muted-foreground whitespace-nowrap">
                      {fmtFecha(a.fecha)} · {hhmm(a.hora)}
                    </span>
                  ),
                },
                {
                  header: 'Corral',
                  accessor: (a) => <span className="font-medium text-foreground">{a.corral.nombre}</span>,
                },
                {
                  header: 'Dieta',
                  accessor: (a) => (
                    <span className="text-muted-foreground">
                      {a.dieta.nombre} <span className="text-xs">(v{a.dieta.version})</span>
                    </span>
                  ),
                },
                {
                  header: 'Cantidad',
                  accessor: (a) => (
                    <DetallePopover etiqueta={`${fmtKg(a.cantidadKg)} kg`} titulo="Cantidad">
                      <p className="text-sm text-foreground tabular-nums">
                        {fmtKg(a.cantidadKg)} kg{' '}
                        <span className="text-xs text-muted-foreground">({fmtKg(a.cantidadPorAnimal)}/an.)</span>
                      </p>
                      {a.nAnimalesEnfermeria > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {fmtKg(a.cantidadCorralKg)} corral + {fmtKg(a.cantidadEnfermeriaKg)} enf.
                        </p>
                      )}
                    </DetallePopover>
                  ),
                },
                {
                  header: 'Animales',
                  accessor: (a) => (
                    <DetallePopover
                      etiqueta={`${a.nAnimales + a.nAnimalesEnfermeria} animales`}
                      titulo="Animales"
                    >
                      <p className="text-sm text-muted-foreground tabular-nums">
                        En común: <span className="text-foreground font-medium">{a.nAnimales}</span>
                      </p>
                      <p className="text-sm text-muted-foreground tabular-nums">
                        En enfermería: <span className="text-foreground font-medium">{a.nAnimalesEnfermeria}</span>
                      </p>
                    </DetallePopover>
                  ),
                },
                {
                  header: 'Reparto por lote',
                  accessor: (a) => (
                    <DetallePopover
                      etiqueta={a.lotes.map((l) => l.loteNombre).join(', ') || '—'}
                      titulo="Reparto por lote"
                      ancho={360}
                    >
                      <div className="space-y-0.5">
                        {a.lotes.map((l) => (
                          <div key={l.loteId} className="text-xs">
                            <span className="text-foreground">{l.loteNombre}</span>
                            {l.clienteNombre && (
                              <span className="text-muted-foreground"> · {l.clienteNombre}</span>
                            )}
                            <span className="text-muted-foreground tabular-nums">
                              {' '}
                              — {fmtKg(l.cantidadKg)} kg ({l.nAnimales} an.)
                              {l.nAnimalesEnfermeria > 0 && (
                                <span className="text-primary">
                                  {' '}
                                  + {fmtKg(l.cantidadEnfermeriaKg)} kg enf. ({l.nAnimalesEnfermeria} an.)
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </DetallePopover>
                  ),
                },
                ...(isSysAdmin
                  ? [
                    {
                      header: 'Empresa',
                      accessor: (a: AlimentacionView) => (
                        <span className="text-muted-foreground">{a.empresa?.nombre ?? '—'}</span>
                      ),
                    },
                  ]
                  : []),
                ...(puedeEditar
                  ? [
                    {
                      header: 'Estado',
                      accessor: (a: AlimentacionView) => (
                        <span
                          className={`inline-flex text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${a.liquidada
                            ? 'text-success bg-success-soft'
                            : 'text-muted-foreground bg-muted'
                            }`}
                        >
                          {a.liquidada ? 'Liquidada' : 'Pendiente'}
                        </span>
                      ),
                    },
                    {
                      header: 'Acciones',
                      accessor: (a: AlimentacionView) => (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setEditando(a)}
                            title="Editar alimentación"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors cursor-pointer"
                          >
                            <Pencil className="size-3.5" strokeWidth={2} />
                          </button>
                          {a.liquidada ? (
                            <span
                              className="p-2 rounded-md bg-muted text-muted-foreground inline-flex"
                              title="Liquidada: no se puede eliminar"
                            >
                              <Lock className="size-4" strokeWidth={1.75} />
                            </span>
                          ) : (
                            <button
                              onClick={() => void handleEliminar(a)}
                              disabled={eliminandoId === a.id}
                              title="Eliminar alimentación"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors cursor-pointer"
                            >
                              <Trash2 className="size-4" strokeWidth={1.75} />
                            </button>
                          )}
                        </div>
                      ),
                    },
                  ]
                  : []),
              ]}
            />
          </div>
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
        </div>
      )}

      {alimentarOpen && (
        <AlimentarModal
          onClose={() => setAlimentarOpen(false)}
          onSaved={async () => {
            await mutateAlimentaciones()
          }}
        />
      )}

      {editando && (
        <AlimentarModal
          corralReadonly
          modoEdicion={{
            id: editando.id,
            idCorral: editando.corral.id,
            corralNombre: editando.corral.nombre,
            idDieta: editando.dieta.id,
            cantidadKg: editando.cantidadCorralKg,
            fecha: editando.fecha,
            hora: editando.hora,
          }}
          onClose={() => setEditando(null)}
          onSaved={async () => {
            await mutateAlimentaciones()
          }}
        />
      )}
    </div>
  )
}

function extractMsg(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback
}
