import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import useSWR from 'swr'
import { AlertCircle, Loader2, Utensils } from 'lucide-react'
import { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import SelectAutocomplete from '../components/SelectAutocomplete'
import { Table } from '../components/Table'
import type { AlimentacionView } from '../lib/alimentacion'

const fmtFecha = (f: string): string => {
  if (!f) return '—'
  const d = new Date(f.length === 10 ? f + 'T00:00:00' : f)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR')
}
const fmtKg = (n: number): string => n.toLocaleString('es-AR', { maximumFractionDigits: 2 })

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
  const [params] = useSearchParams()
  const [filtros, setFiltros] = useState<Filtros>({
    cliente: '',
    corral: '',
    lote: params.get('lote') ?? '',
    desde: '',
    hasta: '',
  })

  const { data: alimentaciones, isLoading } = useSWR<AlimentacionView[]>(
    puedeVer ? '/alimentaciones' : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const all = useMemo(() => alimentaciones ?? [], [alimentaciones])

  const set = (patch: Partial<Filtros>) => setFiltros((f) => ({ ...f, ...patch }))

  // Fila "toca" un filtro si alguno de sus lotes lo cumple.
  const coincide = (a: AlimentacionView, f: Filtros, ignorar?: keyof Filtros) => {
    if (ignorar !== 'corral' && f.corral && a.corral.id !== Number(f.corral)) return false
    if (ignorar !== 'cliente' && f.cliente && !a.lotes.some((l) => l.idCliente === f.cliente)) return false
    if (ignorar !== 'lote' && f.lote && !a.lotes.some((l) => l.loteId === Number(f.lote))) return false
    return true
  }

  const filtradas = useMemo(
    () =>
      all.filter(
        (a) =>
          coincide(a, filtros) &&
          (!filtros.desde || a.fecha >= filtros.desde) &&
          (!filtros.hasta || a.fecha <= filtros.hasta),
      ),
    [all, filtros],
  )

  // Opciones encadenadas: cada selector se filtra por los DEMÁS filtros (sin rango de fechas).
  const opcionesCorrales = useMemo(() => {
    const base = all.filter((a) => coincide(a, filtros, 'corral'))
    const map = new Map<number, string>()
    for (const a of base) map.set(a.corral.id, a.corral.nombre)
    return [...map.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }, [all, filtros])

  const opcionesLotes = useMemo(() => {
    const base = all.filter((a) => coincide(a, filtros, 'lote'))
    const map = new Map<number, string>()
    for (const a of base) for (const l of a.lotes) map.set(l.loteId, l.loteNombre)
    return [...map.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }, [all, filtros])

  const opcionesClientes = useMemo(() => {
    const base = all.filter((a) => coincide(a, filtros, 'cliente'))
    const map = new Map<string, string>()
    for (const a of base) for (const l of a.lotes) if (l.idCliente) map.set(l.idCliente, l.clienteNombre ?? l.idCliente)
    return [...map.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }, [all, filtros])

  const tieneFiltros = !!(filtros.cliente || filtros.corral || filtros.lote || filtros.desde || filtros.hasta)

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Alimentación</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Histórico de alimentaciones de corrales (base para el reporte de costo).
          </p>
        </div>
      </div>

      {/* Filtros */}
      <section className="bg-card border border-border rounded-lg p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SelectAutocomplete
          label="Cliente"
          placeholder="Todos"
          value={filtros.cliente}
          onChange={(v) => set({ cliente: String(v) })}
          options={opcionesClientes}
          clearable
        />
        <SelectAutocomplete
          label="Corral"
          placeholder="Todos"
          value={filtros.corral}
          onChange={(v) => set({ corral: String(v) })}
          options={opcionesCorrales}
          clearable
        />
        <SelectAutocomplete
          label="Lote"
          placeholder="Todos"
          value={filtros.lote}
          onChange={(v) => set({ lote: String(v) })}
          options={opcionesLotes}
          clearable
        />
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
        {tieneFiltros && (
          <div className="flex items-end">
            <button
              onClick={() => set({ cliente: '', corral: '', lote: '', desde: '', hasta: '' })}
              className="px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </section>

      {/* Listado */}
      {isLoading ? (
        <div className="flex items-center justify-center p-20">
          <Loader2 className="size-8 text-primary animate-spin" strokeWidth={1.75} />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {all.length === 0 ? 'Todavía no hay alimentaciones registradas.' : 'Sin resultados para los filtros seleccionados.'}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="sm:hidden space-y-3">
            {filtradas.map((a) => (
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
<p className="text-xs text-muted-foreground">
                      {fmtFecha(a.fecha)} · {fmtKg(a.cantidadKg)} kg total · {a.nAnimales} animales
                      {a.nAnimalesEnfermeria > 0 && ` + ${a.nAnimalesEnfermeria} en enfermería`} ·{' '}
                      {fmtKg(a.cantidadPorAnimal)} kg/animal
                    </p>
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
              data={filtradas}
              columns={[
                {
                  header: 'Fecha',
                  accessor: (a) => <span className="text-muted-foreground">{fmtFecha(a.fecha)}</span>,
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
                    <span className="text-foreground tabular-nums">
                      {fmtKg(a.cantidadKg)} kg{' '}
                      <span className="text-xs text-muted-foreground">({fmtKg(a.cantidadPorAnimal)}/an.)</span>
                      {a.nAnimalesEnfermeria > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          {fmtKg(a.cantidadCorralKg)} corral + {fmtKg(a.cantidadEnfermeriaKg)} enf.
                        </span>
                      )}
                    </span>
                  ),
                },
                {
                  header: 'Animales',
                  accessor: (a) => (
                    <span className="text-muted-foreground tabular-nums">
                      {a.nAnimales}
                      {a.nAnimalesEnfermeria > 0 && (
                        <span className="text-primary"> + {a.nAnimalesEnfermeria} enf.</span>
                      )}
                    </span>
                  ),
                },
                {
                  header: 'Reparto por lote',
                  accessor: (a) => (
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
              ]}
            />
          </div>
        </>
      )}
    </div>
  )
}
